<#
  Sends your Isaac save to your BasementDiary account, without a browser.

  Examples:
    powershell -ExecutionPolicy Bypass -File tools\sync-save.ps1 -Server https://your-domain.example
    powershell -ExecutionPolicy Bypass -File tools\sync-save.ps1 -Server https://your-domain.example -AfterGame
    powershell -ExecutionPolicy Bypass -File tools\sync-save.ps1 -Server https://your-domain.example -InstallShortcut

  -Server URL       your BasementDiary server (required; or set BOIPT_SERVER instead).
                    The Sync page on the site shows this command with the right -Server.
  -AfterGame        start Isaac via Steam, wait until you quit the game, then sync
  -InstallShortcut  put an "Isaac + sync" shortcut on your desktop that does exactly that
  -Slot 2           use a different save slot (1, 2 or 3)
  -ResetLogin       log in again (or pick a different account)

  The first time, you log in with your email address and password, or create a new
  account (only while the admin has registration open). The password is not stored:
  the server issues a dedicated sync token for this PC, which is kept encrypted with
  Windows DPAPI (readable only by your Windows account) in
  %APPDATA%\boipt\account-<server>.xml. You can revoke it on the site under
  Sync -> Account.
#>
param(
  [string]$Server = $env:BOIPT_SERVER,
  [ValidateSet(1, 2, 3)][int]$Slot = 1,
  [string]$SavePath,
  [switch]$AfterGame,
  [switch]$InstallShortcut,
  [switch]$ResetLogin
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
if ([string]::IsNullOrWhiteSpace($Server)) {
  throw ("No server set. Pass -Server https://your-server or set the BOIPT_SERVER environment variable. " +
    "If you host BasementDiary yourself, the Sync page on your site shows the exact command with the " +
    "right -Server, based on PUBLIC_URL in the server's .env.")
}
$Server = $Server.TrimEnd('/')
if ($Server -notmatch '^https://' -and $Server -notmatch '^http://(localhost|127\.0\.0\.1)(:\d+)?$') {
  throw "Use https for $Server; otherwise your password and token travel over the network unencrypted."
}

$Dir = Join-Path $env:APPDATA 'boipt'
$CredFile = Join-Path $Dir ("account-{0}.xml" -f (([Uri]$Server).Authority -replace '[^A-Za-z0-9.-]', '_'))

function Get-Plain([Security.SecureString]$secure) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# POST as JSON; returns @{ Status; Body }, also on 4xx.
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
  Write-Host "Log in to $Server" -ForegroundColor Cyan
  $answer = Read-Host 'Do you already have an account? (y/n)'
  $isNew = $answer -match '^[nN]'
  $email = (Read-Host 'Email address').Trim()
  $password = Get-Plain (Read-Host -AsSecureString 'Password (at least 12 characters)')
  try {
    if ($isNew) {
      $again = Get-Plain (Read-Host -AsSecureString 'Repeat password')
      if ($again -ne $password) { throw 'The passwords do not match.' }
      $again = $null
      $reg = Invoke-Json 'register' @{ email = $email; password = $password }
      if ($reg.Status -ne 200) { throw "Could not create account: $($reg.Body.error)" }
      Write-Host 'Account created.' -ForegroundColor Green
    }
    $res = Invoke-Json 'token' @{ email = $email; password = $password; label = $env:COMPUTERNAME }
  } finally {
    $password = $null
  }
  if ($res.Status -eq 429) { throw 'Too many attempts; wait fifteen minutes.' }
  if ($res.Status -ne 200) { throw "Login failed: $($res.Body.error)" }
  New-Item -ItemType Directory -Force -Path $Dir | Out-Null
  # Export-Clixml encrypts the password field (here: the token) with DPAPI.
  $secureToken = ConvertTo-SecureString $res.Body.token -AsPlainText -Force
  New-Object Management.Automation.PSCredential ($email, $secureToken) | Export-Clixml -Path $CredFile
  # The old PIN from before accounts existed is no longer needed.
  Remove-Item (Join-Path $Dir 'pin.txt') -Force -ErrorAction SilentlyContinue
  Write-Host "Logged in as $email; this PC will now sync to that account." -ForegroundColor Green
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
  # Without Steam Cloud the save lives in Documents.
  $local = Join-Path ([Environment]::GetFolderPath('MyDocuments')) "My Games\Binding of Isaac Repentance+\$name"
  if (Test-Path $local) { $candidates += Get-Item $local }
  if (-not $candidates) { throw "No $name found. Pass the path with -SavePath." }
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
      Write-Host 'Your sync token has expired or been revoked. Please log in again.' -ForegroundColor Yellow
      Remove-Item $CredFile -Force -ErrorAction SilentlyContinue
      return Send-Save -Retried
    }
    if ($code -eq 401) { Write-Host 'Not logged in. Try again with -ResetLogin.' -ForegroundColor Red; exit 1 }
    if ($code -eq 429) { Write-Host 'Too many attempts; please wait a moment.' -ForegroundColor Red; exit 1 }
    throw
  }
  $new = @($res.gained).Count
  Write-Host ("Done: {0}, {1} secrets, {2} new." -f $res.edition, $res.achievements, $new) -ForegroundColor Green
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
  Write-Host "Shortcut created: $lnk" -ForegroundColor Green
  exit 0
}

if ($AfterGame) {
  # Log in first, so nothing needs to be asked after playing.
  Get-Token | Out-Null
  $running = Get-Process -Name 'isaac-ng' -ErrorAction SilentlyContinue
  if (-not $running) {
    Write-Host 'Starting Isaac via Steam...'
    Start-Process 'steam://rungameid/250900'
    $deadline = (Get-Date).AddMinutes(3)
    while (-not ($running = Get-Process -Name 'isaac-ng' -ErrorAction SilentlyContinue)) {
      if ((Get-Date) -gt $deadline) { throw 'Isaac did not start within 3 minutes.' }
      Start-Sleep -Seconds 2
    }
  }
  Write-Host 'Have fun in the basement. Syncing as soon as you quit the game.'
  $running | Wait-Process
  # The game writes the save on exit; give Steam Cloud a moment to finish.
  Start-Sleep -Seconds 5
}

Send-Save
if ($AfterGame) { Start-Sleep -Seconds 4 }
