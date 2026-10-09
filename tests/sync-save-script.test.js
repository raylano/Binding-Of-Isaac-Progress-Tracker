// tools/sync-save.ps1 only runs in Windows PowerShell, so these checks are static:
// they pin the first-run flow (ask for the server, remember it in %APPDATA%\boipt),
// the server precedence and the security rules. With pwsh on the PATH the script is
// also parsed for syntax errors.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const script = fs.readFileSync(new URL('tools/sync-save.ps1', root), 'utf8').replace(/\r\n/g, '\n');

// Body of a top-level `function Name ... {` up to the matching closing brace on column 0.
function fn(name) {
  const start = script.search(new RegExp(`^function ${name}\\b`, 'm'));
  assert.ok(start >= 0, `function ${name} missing`);
  const end = script.indexOf('\n}\n', start);
  return script.slice(start, end + 2);
}

// Top-level code after the last function: server resolution and the main flow.
const main = script.slice(script.indexOf('\n}\n', script.search(/^function Send-Save\b/m)) + 3);

test('sync-save: -Server is optional and has no BOIPT_SERVER default', () => {
  assert.match(script, /param\(\n\s+\[string\]\$Server,\n/);
  // The old unconditional "No server set" stop is gone; only a non-interactive session stops.
  assert.doesNotMatch(main, /throw[^\n]*No server set/);
  assert.match(fn('Read-Server'), /No server set and this session cannot ask/);
});

test('sync-save: server comes from -Server, then BOIPT_SERVER, then the saved config, else a prompt', () => {
  const block = main.slice(main.indexOf("$ServerSource = 'param'"));
  const order = ['IsNullOrWhiteSpace($Server)', '$env:BOIPT_SERVER', '$Saved.server', 'Read-Server'].map((s) => block.indexOf(s));
  assert.ok(order.every((i) => i >= 0), `missing step: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(block.indexOf('ConvertTo-ServerUrl $Server') > order[3], 'every server source is validated');
});

test('sync-save: config lives per user in %APPDATA%\\boipt\\config.json with only server and email', () => {
  assert.match(script, /\$Dir = Join-Path \$env:APPDATA 'boipt'/);
  assert.match(script, /\$ConfigFile = Join-Path \$Dir 'config\.json'/);
  const save = fn('Save-Config');
  assert.match(save, /\[ordered\]@\{ server = \$Server; email = \$email \} \| ConvertTo-Json \| Set-Content -Path \$ConfigFile/);
  assert.doesNotMatch(save, /password|token/i);
  // A BOIPT_SERVER override is not persisted.
  assert.match(save, /if \(\$ServerSource -eq 'env'\) \{ return \}/);
});

test('sync-save: the password is never written; only the token goes through DPAPI (Export-Clixml)', () => {
  const lines = script.split('\n')
    .filter((l) => !/^\s*#/.test(l) && /Export-Clixml|Set-Content|Out-File|Add-Content/.test(l));
  assert.ok(lines.length >= 2);
  for (const l of lines) assert.doesNotMatch(l, /password/i, l);
  const login = fn('New-Login');
  assert.match(login, /ConvertTo-SecureString \$res\.Body\.token -AsPlainText -Force/);
  assert.match(login, /\$cred \| Export-Clixml -Path \$CredFile/);
  assert.match(login, /\$password = \$null/);
  // Registration stays available from the script.
  assert.match(login, /Invoke-Json 'register'/);
});

test('sync-save: a successful login or upload saves the config', () => {
  assert.match(fn('New-Login'), /Save-Config/);
  assert.match(fn('Send-Save'), /Save-Config/);
});

test('sync-save: a revoked token asks to log in again (unless BOIPT_TOKEN is used)', () => {
  const send = fn('Send-Save');
  assert.match(send, /\$code -eq 401 -and -not \$Retried -and -not \$env:BOIPT_TOKEN/);
  assert.match(send, /Remove-Item \$CredFile/);
  assert.match(send, /return Send-Save -Retried/);
  const token = fn('Get-Token');
  assert.match(token, /if \(\$env:BOIPT_TOKEN\) \{ return \$env:BOIPT_TOKEN \}/);
  assert.match(token, /New-Login/);
});

test('sync-save: -ResetLogin forgets config and tokens once, before anything logs in', () => {
  assert.doesNotMatch(fn('Get-Token'), /ResetLogin/, 'Get-Token runs twice with -AfterGame');
  const reset = main.slice(main.indexOf('if ($ResetLogin) {'), main.indexOf("$ServerSource = 'param'"));
  assert.match(reset, /Remove-Item \$ConfigFile/);
  assert.match(reset, /Get-CredFile \$Previous\.server/);
  assert.match(main, /if \(\$ResetLogin\) \{ Remove-Item \$CredFile/);
  assert.ok(main.indexOf('if ($ResetLogin) { Remove-Item $CredFile') < main.indexOf('if ($InstallShortcut)'));
});

test('sync-save: the shortcut carries the resolved, quoted server and logs in before it is made', () => {
  const block = main.slice(main.indexOf('if ($InstallShortcut)'), main.indexOf('if ($AfterGame)'));
  assert.match(block, /-AfterGame -Server `"\$Server`" -Slot \$Slot/);
  assert.ok(block.indexOf('Get-Token') < block.indexOf('$sc.Save()'));
});

test('sync-save: README and DEPLOY describe the first run and the reset', () => {
  for (const doc of ['README.md', 'DEPLOY.md']) {
    const text = fs.readFileSync(new URL(doc, root), 'utf8');
    assert.match(text, /%APPDATA%\\boipt\\config\.json/, doc);
    assert.match(text, /-ResetLogin/, doc);
  }
});

const pwsh = spawnSync('pwsh', ['-NoProfile', '-Command', 'exit 0']).status === 0;

test('sync-save: PowerShell parses the script without errors', { skip: !pwsh && 'pwsh not installed' }, () => {
  const file = fileURLToPath(new URL('tools/sync-save.ps1', root));
  const cmd = `$e = $null; [void][Management.Automation.Language.Parser]::ParseFile('${file.replace(/'/g, "''")}', [ref]$null, [ref]$e); $e | ForEach-Object { $_.ToString() }; exit $e.Count`;
  const res = spawnSync('pwsh', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
});
