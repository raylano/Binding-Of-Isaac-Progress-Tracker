<#
  Stuurt je Isaac-save naar het Kelderdagboek, zonder browser, naar jouw account.

  Voorbeelden:
    powershell -ExecutionPolicy Bypass -File tools\sync-save.ps1
    powershell -ExecutionPolicy Bypass -File tools\sync-save.ps1 -AfterGame
    powershell -ExecutionPolicy Bypass -File tools\sync-save.ps1 -InstallShortcut

  -AfterGame        start Isaac via Steam, wacht tot je het spel afsluit en synchroniseert dan
  -InstallShortcut  zet een snelkoppeling "Isaac + sync" op je bureaublad die precies dat doet
  -Slot 2           een andere save-slot (1, 2 of 3)
  -ResetLogin       opnieuw inloggen (of een ander account kiezen)

  De eerste keer log je in met je e-mailadres en wachtwoord, of maak je een nieuw
  account. Het wachtwoord wordt niet bewaard: de server geeft een eigen sync-token
  voor deze pc, en dat staat versleuteld met Windows DPAPI (alleen leesbaar voor
  jouw Windows-account) in %APPDATA%\boipt\account-<server>.xml. Intrekken kan op
  de site onder Sync -> Account.
#>
param(
  [string]$Server = $(if ($env:BOIPT_SERVER) { $env:BOIPT_SERVER } else { 'https://isaac.wolfs.dev' }),
  [ValidateSet(1, 2, 3)][int]$Slot = 1,
  [string]$SavePath,
  [switch]$AfterGame,
  [switch]$InstallShortcut,
  [Alias('ResetPin')][switch]$ResetLogin
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Server = $Server.TrimEnd('/')
if ($Server -notmatch '^https://' -and $Server -notmatch '^http://(localhost|127\.0\.0\.1)(:\d+)?$') {
  throw "Gebruik https voor $Server; je wachtwoord en token gaan anders onversleuteld over het net."
}

$Dir = Join-Path $env:APPDATA 'boipt'
$CredFile = Join-Path $Dir ("account-{0}.xml" -f (([Uri]$Server).Authority -replace '[^A-Za-z0-9.-]', '_'))

function Get-Plain([Security.SecureString]$secure) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# POST met JSON; geeft @{ Status; Body } terug, ook bij 4xx.
function Invoke-Json([string]$Path, $Data) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($Data | ConvertTo-Json -Compress))
  try {
    $body = Invoke-RestMethod -Method Post -Uri "$Server/api/$Path" -Body $bytes -ContentType 'application/json; charset=utf-8'
    return @{ Status = 200; Body = $body }
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if (-not $code) { throw }
    $msg = $null
    try { $msg = ($_.ErrorDetails.Message | ConvertFrom-Json).error } catch { }
    return @{ Status = $code; Body = @{ error = $msg } }
  }
}

function New-Login {
  Write-Host "Inloggen bij $Server" -ForegroundColor Cyan
  $answer = Read-Host 'Heb je al een account? (j/n)'
  $isNew = $answer -match '^[nN]'
  $email = (Read-Host 'E-mailadres').Trim()
  $password = Get-Plain (Read-Host -AsSecureString 'Wachtwoord (minstens 12 tekens)')
  try {
    if ($isNew) {
      $again = Get-Plain (Read-Host -AsSecureString 'Nog een keer')
      if ($again -ne $password) { throw 'De wachtwoorden zijn niet gelijk.' }
      $again = $null
      $reg = Invoke-Json 'register' @{ email = $email; password = $password }
      if ($reg.Status -ne 200) { throw "Account maken mislukt: $($reg.Body.error)" }
      Write-Host 'Account gemaakt.' -ForegroundColor Green
    }
    $res = Invoke-Json 'token' @{ email = $email; password = $password; label = $env:COMPUTERNAME }
  } finally {
    $password = $null
  }
  if ($res.Status -eq 429) { throw 'Te veel pogingen; wacht een kwartier.' }
  if ($res.Status -ne 200) { throw "Inloggen mislukt: $($res.Body.error)" }
  New-Item -ItemType Directory -Force -Path $Dir | Out-Null
  # Export-Clixml versleutelt het wachtwoordveld (hier: het token) met DPAPI.
  $secureToken = ConvertTo-SecureString $res.Body.token -AsPlainText -Force
  New-Object Management.Automation.PSCredential ($email, $secureToken) | Export-Clixml -Path $CredFile
  # De oude PIN van voor de accounts is niet meer nodig.
  Remove-Item (Join-Path $Dir 'pin.txt') -Force -ErrorAction SilentlyContinue
  Write-Host "Ingelogd als $email; deze pc synct voortaan naar dat account." -ForegroundColor Green
}

function Get-Token {
  if ($env:BOIPT_TOKEN) { return $env:BOIPT_TOKEN }
  if ($ResetLogin -and (Test-Path $CredFile)) { Remove-Item $CredFile -Force }
  if (-not (Test-Path $CredFile)) { New-Login }
  $cred = Import-Clixml -Path $CredFile
  return Get-Plain $cred.Password
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

function Send-Save([switch]$Retried) {
  $path = Find-Save
  $token = Get-Token
  Write-Host "Save: $path"
  Write-Host "Server: $Server"
  try {
    $res = Invoke-RestMethod -Method Post -Uri "$Server/api/save" -InFile $path `
      -ContentType 'application/octet-stream' -Headers @{ Authorization = "Bearer $token" }
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 401 -and -not $Retried -and -not $env:BOIPT_TOKEN) {
      Write-Host 'Je sync-token is verlopen of ingetrokken. Log opnieuw in.' -ForegroundColor Yellow
      Remove-Item $CredFile -Force -ErrorAction SilentlyContinue
      return Send-Save -Retried
    }
    if ($code -eq 401) { Write-Host 'Niet ingelogd. Probeer opnieuw met -ResetLogin.' -ForegroundColor Red; exit 1 }
    if ($code -eq 429) { Write-Host 'Te veel pogingen; wacht even.' -ForegroundColor Red; exit 1 }
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
  Get-Token | Out-Null
  Write-Host "Snelkoppeling gemaakt: $lnk" -ForegroundColor Green
  exit 0
}

if ($AfterGame) {
  # Eerst inloggen, zodat er na het spelen niets meer gevraagd hoeft te worden.
  Get-Token | Out-Null
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
