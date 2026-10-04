<#
  Stuurt je Isaac-save naar het Kelderdagboek, zonder browser.

  Voorbeelden:
    powershell -ExecutionPolicy Bypass -File tools\sync-save.ps1
    powershell -ExecutionPolicy Bypass -File tools\sync-save.ps1 -AfterGame
    powershell -ExecutionPolicy Bypass -File tools\sync-save.ps1 -InstallShortcut

  -AfterGame        start Isaac via Steam, wacht tot je het spel afsluit en synchroniseert dan
  -InstallShortcut  zet een snelkoppeling "Isaac + sync" op je bureaublad die precies dat doet
  -Slot 2           een andere save-slot (1, 2 of 3)
  -ResetPin         de opgeslagen PIN vergeten en opnieuw vragen

  De PIN wordt de eerste keer gevraagd en daarna versleuteld (Windows DPAPI, alleen
  leesbaar voor jouw Windows-account) bewaard in %APPDATA%\boipt\pin.txt.
#>
param(
  [string]$Server = $(if ($env:BOIPT_SERVER) { $env:BOIPT_SERVER } else { 'https://isaac.wolfs.dev' }),
  [ValidateSet(1, 2, 3)][int]$Slot = 1,
  [string]$SavePath,
  [switch]$AfterGame,
  [switch]$InstallShortcut,
  [switch]$ResetPin
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Server = $Server.TrimEnd('/')

function Get-Pin {
  if ($env:BOIPT_PIN) { return $env:BOIPT_PIN }
  $dir = Join-Path $env:APPDATA 'boipt'
  $file = Join-Path $dir 'pin.txt'
  if ($ResetPin -and (Test-Path $file)) { Remove-Item $file -Force }
  if (-not (Test-Path $file)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $secure = Read-Host -AsSecureString 'PIN voor het Kelderdagboek'
    $secure | ConvertFrom-SecureString | Set-Content -Path $file -Encoding ASCII
  }
  $secure = Get-Content $file | ConvertTo-SecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Find-Save {
  if ($SavePath) { return $SavePath }
  $name = "rep+persistentgamedata$Slot.dat"
  $steam = $null
  try { $steam = (Get-ItemProperty 'HKCU:\Software\Valve\Steam' -Name SteamPath).SteamPath } catch { }
  $roots = @()
  if ($steam) { $roots += (Join-Path $steam 'userdata') }
  $roots += "${env:ProgramFiles(x86)}\Steam\userdata"
  $candidates = @()
  foreach ($root in ($roots | Select-Object -Unique)) {
    if (Test-Path $root) {
      $candidates += Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue |
        ForEach-Object { Join-Path $_.FullName "250900\remote\$name" } |
        Where-Object { Test-Path $_ } |
        ForEach-Object { Get-Item $_ }
    }
  }
  # Zonder Steam Cloud staat de save in Documenten.
  $local = Join-Path ([Environment]::GetFolderPath('MyDocuments')) "My Games\Binding of Isaac Repentance+\$name"
  if (Test-Path $local) { $candidates += Get-Item $local }
  if (-not $candidates) { throw "Geen $name gevonden. Geef het pad op met -SavePath." }
  return ($candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
}

function Send-Save {
  $path = Find-Save
  $pin = Get-Pin
  Write-Host "Save: $path"
  Write-Host "Server: $Server"
  try {
    $res = Invoke-RestMethod -Method Post -Uri "$Server/api/save" -InFile $path `
      -ContentType 'application/octet-stream' -Headers @{ Authorization = "Bearer $pin" }
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 401) { Write-Host 'Verkeerde PIN. Probeer opnieuw met -ResetPin.' -ForegroundColor Red; exit 1 }
    if ($code -eq 429) { Write-Host 'Te veel pogingen; wacht een kwartier.' -ForegroundColor Red; exit 1 }
    throw
  }
  $new = @($res.gained).Count
  Write-Host ("Gelukt: {0}, {1} geheimen, {2} nieuw." -f $res.edition, $res.achievements, $new) -ForegroundColor Green
}

if ($InstallShortcut) {
  $desktop = [Environment]::GetFolderPath('Desktop')
  $lnk = Join-Path $desktop 'Isaac + sync.lnk'
  $shell = New-Object -ComObject WScript.Shell
  $sc = $shell.CreateShortcut($lnk)
  $sc.TargetPath = 'powershell.exe'
  $sc.Arguments = "-ExecutionPolicy Bypass -WindowStyle Minimized -File `"$PSCommandPath`" -AfterGame -Server $Server -Slot $Slot"
  $steamExe = $null
  try { $steamExe = (Get-ItemProperty 'HKCU:\Software\Valve\Steam' -Name SteamExe).SteamExe } catch { }
  if ($steamExe) { $sc.IconLocation = $steamExe }
  $sc.Save()
  Get-Pin | Out-Null
  Write-Host "Snelkoppeling gemaakt: $lnk" -ForegroundColor Green
  exit 0
}

if ($AfterGame) {
  $running = Get-Process -Name 'isaac-ng' -ErrorAction SilentlyContinue
  if (-not $running) {
    Write-Host 'Isaac starten via Steam...'
    Start-Process 'steam://rungameid/250900'
    $deadline = (Get-Date).AddMinutes(3)
    while (-not ($running = Get-Process -Name 'isaac-ng' -ErrorAction SilentlyContinue)) {
      if ((Get-Date) -gt $deadline) { throw 'Isaac is niet gestart binnen 3 minuten.' }
      Start-Sleep -Seconds 2
    }
  }
  Write-Host 'Veel plezier in de kelder. Ik synchroniseer zodra je het spel afsluit.'
  $running | Wait-Process
  # Het spel schrijft de save bij het afsluiten; even wachten tot Steam Cloud klaar is.
  Start-Sleep -Seconds 5
}

Send-Save
if ($AfterGame) { Start-Sleep -Seconds 4 }
