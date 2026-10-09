<#
  Sends your Isaac save to your BasementDiary account, without a browser.

  Examples:
    powershell -ExecutionPolicy Bypass -File tools\sync-save.ps1
    powershell -ExecutionPolicy Bypass -File tools\sync-save.ps1 -InstallShortcut
    powershell -ExecutionPolicy Bypass -File tools\sync-save.ps1 -Server https://your-domain.example -AfterGame

  -Server URL       your BasementDiary server. Optional: the first time the script asks for
                    it, and later it uses the server you last logged in or synced to.
                    -Server (or the BOIPT_SERVER environment variable) overrides that.
                    The Sync page on the site shows the address.
  -AfterGame        start Isaac via Steam, wait until you quit the game, then sync
  -InstallShortcut  put an "Isaac + sync" shortcut on your desktop that does exactly that
  -Slot 2           use a different save slot (1, 2 or 3)
  -ResetLogin       forget the saved server and login, then ask for both again
                    (to log in again, or pick a different account or server)

  First run: the script asks for the server address, whether you already have an
  account, your email address and password. You can create a new account there (only
  while the admin has registration open). The password is not stored: the server
  issues a dedicated sync token for this PC, which is kept encrypted with Windows DPAPI
  (readable only by your Windows account) in %APPDATA%\boipt\account-<server>.xml.
  The server address and your email address (no secrets) go in
  %APPDATA%\boipt\config.json, so later runs need no arguments. If the token stops
  working (revoked on the site under Sync -> Account), the script asks you to log in
  again and updates both files.

  BOIPT_TOKEN in the environment replaces the saved token; BOIPT_SERVER replaces the
  saved server without overwriting it.
#>
param(
  [string]$Server,
  [ValidateSet(1, 2, 3)][int]$Slot = 1,
  [string]$SavePath,
  [switch]$AfterGame,
  [switch]$InstallShortcut,
  [switch]$ResetLogin
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Dir = Join-Path $env:APPDATA 'boipt'
$ConfigFile = Join-Path $Dir 'config.json'
$AccountEmail = $null

function Get-Plain([Security.SecureString]$secure) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# Normalizes a server address; throws if it is not https (or http to this PC).
function ConvertTo-ServerUrl([string]$url) {
  $url = "$url".Trim().TrimEnd('/')
  if (-not $url) { throw 'Enter the address of your BasementDiary server, e.g. https://your-domain.example' }
  if ($url -notmatch '^[A-Za-z][A-Za-z0-9+.-]*://') { $url = "https://$url" }
  $uri = $null
  if (-not [Uri]::TryCreate($url, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -notin @('https', 'http')) {
    throw "$url is not a valid server address."
  }
  if ($url -notmatch '^https://' -and $url -notmatch '^http://(localhost|127\.0\.0\.1)(:\d+)?$') {
    throw "Use https for $url; otherwise your password and token travel over the network unencrypted."
  }
  return $url
}

function Get-CredFile([string]$url) {
  return Join-Path $Dir ("account-{0}.xml" -f (([Uri]$url).Authority -replace '[^A-Za-z0-9.-]', '_'))
}

# Saved server and email address; $null if there is none (or it is unreadable).
function Read-Config {
  if (-not (Test-Path $ConfigFile)) { return $null }
  try { return Get-Content -Raw -Path $ConfigFile | ConvertFrom-Json }
  catch {
    Write-Host "Ignoring unreadable $ConfigFile." -ForegroundColor Yellow
    return $null
  }
}

# Remembers the server (and account) that just worked, so later runs need no -Server.
# A server from BOIPT_SERVER is only an override and is not saved.
function Save-Config {
  if ($ServerSource -eq 'env') { return }
  $email = $AccountEmail
  if (-not $email -and $Previous -and $Previous.server -eq $Server) { $email = $Previous.email }
  New-Item -ItemType Directory -Force -Path $Dir | Out-Null
  [ordered]@{ server = $Server; email = $email } | ConvertTo-Json | Set-Content -Path $ConfigFile -Encoding UTF8
}

function Read-Server([string]$Default) {
  if (-not [Environment]::UserInteractive -or ([Environment]::GetCommandLineArgs() -match '^-NonI')) {
    throw ('No server set and this session cannot ask for one. Pass -Server https://your-server ' +
      'or set the BOIPT_SERVER environment variable.')
  }
  Write-Host 'Which BasementDiary server do you sync to? The Sync page on the site shows its address.' -ForegroundColor Cyan
  $prompt = 'Server address (e.g. https://your-domain.example)'
  if ($Default) { $prompt = "Server address (Enter for $Default)" }
  for ($try = 1; $try -le 5; $try++) {
    $answer = Read-Host $prompt
    if (-not "$answer".Trim() -and $Default) { $answer = $Default }
    try { return ConvertTo-ServerUrl $answer }
    catch { Write-Host $_.Exception.Message -ForegroundColor Red }
  }
  throw 'No valid server address entered.'
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

# Logs in (or registers first), saves the sync token and config; returns the credential.
function New-Login {
  Write-Host "Log in to $Server" -ForegroundColor Cyan
  $answer = Read-Host 'Do you already have an account? (y/n)'
  $isNew = $answer -match '^[nN]'
  $known = $null
  if ($Previous -and $Previous.server -eq $Server) { $known = $Previous.email }
  if ($known) {
    $email = (Read-Host "Email address (Enter for $known)").Trim()
    if (-not $email) { $email = $known }
  } else {
    $email = (Read-Host 'Email address').Trim()
  }
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
  $cred = New-Object Management.Automation.PSCredential ($email, $secureToken)
  $cred | Export-Clixml -Path $CredFile
  $script:AccountEmail = $email
  Save-Config
  # The old PIN from before accounts existed is no longer needed.
  Remove-Item (Join-Path $Dir 'pin.txt') -Force -ErrorAction SilentlyContinue
  Write-Host "Logged in as $email; this PC will now sync to that account." -ForegroundColor Green
  return $cred
}

function Get-Token {
  if ($env:BOIPT_TOKEN) { return $env:BOIPT_TOKEN }
  $cred = $null
  if (Test-Path $CredFile) {
    try { $cred = Import-Clixml -Path $CredFile }
    catch { Write-Host 'The saved login cannot be read on this Windows account; please log in again.' -ForegroundColor Yellow }
  }
  if (-not $cred) { $cred = New-Login }
  $script:AccountEmail = $cred.UserName
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
  Save-Config
  $new = @($res.gained).Count
  Write-Host ("Done: {0}, {1} secrets, {2} new." -f $res.edition, $res.achievements, $new) -ForegroundColor Green
}

# Which server: -Server, then BOIPT_SERVER, then the saved one, else ask.
$Previous = Read-Config
$Saved = $Previous
if ($ResetLogin) {
  # Forget the saved server and its login; the old values are only offered as defaults.
  if ($Previous -and $Previous.server) {
    try { Remove-Item (Get-CredFile $Previous.server) -Force -ErrorAction SilentlyContinue } catch { }
  }
  Remove-Item $ConfigFile -Force -ErrorAction SilentlyContinue
  $Saved = $null
}
$ServerSource = 'param'
if ([string]::IsNullOrWhiteSpace($Server)) {
  if ($env:BOIPT_SERVER) { $Server = $env:BOIPT_SERVER; $ServerSource = 'env' }
  elseif ($Saved -and $Saved.server) { $Server = $Saved.server; $ServerSource = 'saved' }
  else { $Server = Read-Server $Previous.server; $ServerSource = 'prompt' }
}
try { $Server = ConvertTo-ServerUrl $Server }
catch {
  if ($ServerSource -ne 'saved') { throw }
  throw "The saved server in $ConfigFile is invalid ($($_.Exception.Message)) Run with -ResetLogin to enter it again."
}
$CredFile = Get-CredFile $Server
if ($ResetLogin) { Remove-Item $CredFile -Force -ErrorAction SilentlyContinue }

if ($InstallShortcut) {
  # Log in first, so the shortcut never has to ask anything.
  Get-Token | Out-Null
  Save-Config
  $desktop = [Environment]::GetFolderPath('Desktop')
  $lnk = Join-Path $desktop 'Isaac + sync.lnk'
  $shell = New-Object -ComObject WScript.Shell
  $sc = $shell.CreateShortcut($lnk)
  $sc.TargetPath = 'powershell.exe'
  $sc.Arguments = "-ExecutionPolicy Bypass -WindowStyle Minimized -File `"$PSCommandPath`" -AfterGame -Server `"$Server`" -Slot $Slot"
  $steamExe = $null
  try { $steamExe = (Get-ItemProperty 'HKCU:\Software\Valve\Steam' -Name SteamExe).SteamExe } catch { }
  if ($steamExe) { $sc.IconLocation = $steamExe }
  $sc.Save()
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
