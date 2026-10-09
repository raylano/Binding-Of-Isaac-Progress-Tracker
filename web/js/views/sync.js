import { store, mutate, api, replaceState } from '../store.js';
import { CHAR_BY_KEY } from '../../data/characters.js';
import { parseSave } from '../save-parser.js';
import { diffSave, applySave, applySteam, serializeState } from '../logic.js';
import { canRemember, storedHandle, readStored, pickAndRemember, fromFile, forgetHandle } from '../import.js';
import { esc, toast, modal, timeAgo, unlockedToasts, markName } from '../ui.js';

let remembered = null;
let steamMsg = '';
let sessions = null;
let adminSettings = null;

function saveDir() {
  const id = store.config.accountId || '<account-ID>';
  return `C:\\Program Files (x86)\\Steam\\userdata\\${id}\\250900\\remote\\`;
}

export async function mount(root) {
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('dragover', (e) => { if (e.target.closest('.drop')) { e.preventDefault(); e.target.closest('.drop').classList.add('over'); } });
  root.addEventListener('dragleave', (e) => e.target.closest('.drop')?.classList.remove('over'));
  root.addEventListener('drop', async (e) => {
    const zone = e.target.closest('.drop');
    if (!zone) return;
    e.preventDefault();
    zone.classList.remove('over');
    const file = e.dataTransfer.files?.[0];
    if (file) importBytes(await fromFile(file));
  });
  remembered = await storedHandle();
  update(root);
  loadSessions(root);
  if (store.session.user?.admin) loadAdmin(root);
}

async function loadSessions(root) {
  try {
    sessions = (await api('/sessions')).sessions;
  } catch {
    sessions = null;
  }
  update(root);
}

async function loadAdmin(root) {
  try {
    adminSettings = await api('/admin/settings');
  } catch {
    adminSettings = null;
  }
  update(root);
}

function device(ua = '') {
  const browser = ua.match(/Edg|Firefox|Chrome|Safari/)?.[0]?.replace('Edg', 'Edge');
  const os = ua.match(/Windows|Android|iPhone|iPad|Mac OS|Linux/)?.[0]?.replace('Mac OS', 'Mac');
  return [browser, os].filter(Boolean).join(' on ') || 'Browser';
}

function sessionsHtml() {
  if (!sessions) return '<p class="muted">Loading sessions…</p>';
  return `<ul class="session-list">${sessions.map((s) => `
    <li><span>${s.kind === 'sync' ? `Sync script: ${esc(s.label || '')}` : esc(device(s.userAgent))}
      <small class="muted"> · active ${timeAgo(s.lastSeen)} ago${s.current ? ' · <b>this device</b>' : ''}</small></span>
      ${s.current ? '' : `<button type="button" class="btn small ghost" data-act="revoke" data-id="${esc(s.id)}">Revoke</button>`}</li>`).join('')}</ul>`;
}

function adminHtml() {
  if (!store.session.user?.admin) return '';
  const open = adminSettings?.registrationOpen;
  return `
      <section class="paper" data-admin>
        <h3>Admin</h3>
        ${adminSettings ? `
        <p>New accounts are <b>${open ? 'open' : 'closed'}</b>. ${open ? 'Anyone who can reach this site can sign up.' : 'Only existing accounts can log in.'}</p>
        <button type="button" class="btn ${open ? 'ghost' : 'blood'}" data-act="registration" data-open="${open ? 'false' : 'true'}">${open ? 'Close registration' : 'Open registration'}</button>`
        : '<p class="muted">Loading settings…</p>'}
      </section>`;
}

export function unmount() {}

export function update(root) {
  const { state } = store;
  const s = state.sources;
  const server = store.config.publicUrl || location.origin;
  root.innerHTML = `
    <h1 class="view-title">Sync</h1>
    <p class="view-sub">Your save file is the source of truth: it also holds your Hard marks and counters. Steam only fills in gaps.</p>

    <div class="grid cols-2">
      <section class="paper tape tilt-l">
        <h3>Save file</h3>
        <p class="muted">${s.save ? `Last imported ${timeAgo(s.save.at)} ago (${esc(s.save.edition || '')}, ${esc(s.save.achievements)} secrets).` : 'Never imported.'}</p>
        <div class="row">
          <button type="button" class="btn blood" data-act="sync-save">${remembered ? 'Sync save' : 'Choose your save'}</button>
          ${remembered ? '<button type="button" class="btn small ghost" data-act="forget">Other file</button>' : ''}
        </div>
        ${canRemember() ? `<p class="muted">${remembered ? 'This browser remembers your file: after a session this is one click.' : 'Pick the file the first time; after that this browser remembers it.'}</p>` : '<p class="muted">This browser cannot remember the file: pick it each time, or drag it below.</p>'}
        <h4>Where is it?</h4>
        <div class="path-box"><code id="save-dir">${esc(saveDir())}</code><button type="button" class="btn small" data-act="copy-dir">Copy path</button></div>
        <p class="muted">Paste the path into the address bar of the file dialog and choose <b>rep+persistentgamedata1.dat</b> (slot 1; 2 and 3 for the other slots).
          If the browser refuses that folder, pick the newest copy in <i>Documents\\My Games\\Binding of Isaac Repentance+\\save_backups</i>, or use the script below.</p>
        <div class="drop" style="margin-top:10px">Or drag the .dat file here<br><input type="file" accept=".dat" data-file aria-label="Choose save" style="margin-top:8px;max-width:100%"></div>
      </section>

      <section class="paper tilt-r">
        <h3>Steam</h3>
        <p class="muted">${s.steam ? `Last ${timeAgo(s.steam.at)} ago: ${esc(s.steam.count)} achievements.` : 'Not used yet.'}</p>
        <p>Fetches your Steam achievements and ticks off what was missing. Never removes anything; marks go to normal at most.</p>
        <p class="muted">Only works if Steam <b>Edit Profile → Privacy → Game details</b> is set to <b>Public</b>.${store.config.steamKey ? '' : ' (Without STEAM_API_KEY the server uses the public profile page.)'}</p>
        <form class="row" data-form="steam-id">
          <label class="sr" for="steam-id">SteamID64</label>
          <input id="steam-id" name="steamId" inputmode="numeric" maxlength="17" placeholder="SteamID64 (7656119…)" value="${esc(store.config.steamId || '')}">
          <button type="submit" class="btn small ghost">Save</button>
        </form>
        ${store.config.steamId ? '<button type="button" class="btn" data-act="steam">Sync Steam</button>' : '<p class="muted">First enter your SteamID64 (you can find it on steamid.io).</p>'}
        <div id="steam-out">${steamMsg}</div>
      </section>

      <section class="paper">
        <h3>Automatically after playing</h3>
        <p>The script <code>tools/sync-save.ps1</code> sends your save to this site without a browser. With <code>-AfterGame</code> it starts Isaac and syncs as soon as you close the game.</p>
        <pre class="cmd">powershell -ExecutionPolicy Bypass -File tools\\sync-save.ps1 -Server ${esc(server)} -InstallShortcut</pre>
        <p class="muted">This creates an "Isaac + sync" shortcut on your desktop and asks you to log in once. Your password is not stored: the script gets its own sync token, encrypted for your Windows account (DPAPI). Saves only go to this account. From then on, start Isaac with that shortcut.</p>
      </section>

      <section class="paper">
        <h3>Backup</h3>
        <p class="muted">Download your full progress as JSON, or restore a backup.</p>
        <div class="row">
          <button type="button" class="btn" data-act="export">Download backup</button>
          <label class="btn ghost">Restore backup<input type="file" accept="application/json,.json" data-backup class="sr"></label>
        </div>
      </section>

      <section class="paper">
        <h3>Account</h3>
        <p>Logged in as <b>${esc(store.session.user?.email || store.config.email || '')}</b>.</p>
        <h4>Where you are logged in</h4>
        ${sessionsHtml()}
        <hr>
        <button type="button" class="btn small ghost" data-act="logout">Log out</button>
      </section>
      ${adminHtml()}
    </div>`;
}

async function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const root = e.currentTarget;
  const act = b.dataset.act;
  try {
    if (act === 'sync-save') {
      let data = null;
      if (remembered) data = await readStored();
      else if (canRemember()) {
        try {
          data = await pickAndRemember();
          remembered = await storedHandle();
        } catch (err) {
          if (err.name === 'AbortError') return;
          // Chrome sometimes blocks system folders; fall back to the normal dialog.
          root.querySelector('[data-file]')?.click();
          toast({ kicker: 'NOTE', title: 'The browser will not remember that folder; choose the file here.' });
          return;
        }
      } else {
        root.querySelector('[data-file]')?.click();
        return;
      }
      if (data) await importBytes(data);
    } else if (act === 'forget') {
      await forgetHandle();
      remembered = null;
      update(root);
    } else if (act === 'copy-dir') {
      await navigator.clipboard.writeText(saveDir());
      toast({ kicker: 'COPIED', title: 'Paste it into the file dialog' });
    } else if (act === 'steam') {
      await steamSync(root);
    } else if (act === 'export') {
      const blob = new Blob([JSON.stringify(serializeState(store.state), null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `basementdiary-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } else if (act === 'revoke') {
      await api(`/sessions/${encodeURIComponent(b.dataset.id)}`, { method: 'DELETE' });
      await loadSessions(root);
    } else if (act === 'registration') {
      adminSettings = await api('/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationOpen: b.dataset.open === 'true' }),
      });
      toast({ kicker: 'SAVED', title: adminSettings.registrationOpen ? 'Registration is open' : 'Registration is closed' });
      update(root);
    } else if (act === 'logout') {
      await api('/logout', { method: 'POST' });
      location.reload();
    }
  } catch (err) {
    toast({ kicker: 'FAILED', title: err.message });
  }
}

async function onSubmit(e) {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const root = e.currentTarget;
  const post = (path, method, body) => api(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    if (form.dataset.form === 'steam-id') {
      const res = await post('/account', 'PUT', { steamId: form.steamId.value.trim() || null });
      store.config = { ...store.config, steamId: res.steamId, accountId: res.accountId };
      toast({ kicker: 'SAVED', title: res.steamId ? 'SteamID saved' : 'SteamID cleared' });
      update(root);
    }
  } catch (err) {
    toast({ kicker: 'FAILED', title: err.message });
  }
}

async function onChange(e) {
  if (e.target.matches('[data-file]') && e.target.files[0]) {
    await importBytes(await fromFile(e.target.files[0]));
    e.target.value = '';
  }
  if (e.target.matches('[data-backup]') && e.target.files[0]) {
    try {
      const raw = JSON.parse(await e.target.files[0].text());
      const ok = await modal(`<h3>Restore backup?</h3><p>Your current progress (${store.state.achievements.size} secrets) will be replaced by the one in the backup (${(raw.achievements || []).length} secrets).</p><div class="row"><button class="btn blood" data-result="ok">Restore</button><button class="btn ghost" data-result="no">Cancel</button></div>`);
      if (ok?.result === 'ok') {
        const base = store.base;
        replaceState({ ...raw, updatedAt: base });
        mutate(() => {}, 'restore');
        toast({ kicker: 'RESTORED', title: 'Your backup is back' });
      }
    } catch {
      toast({ kicker: 'FAILED', title: 'That is not a valid backup.' });
    }
    e.target.value = '';
  }
}

// Parse the save, show the difference, and only apply after confirmation.
export async function importBytes({ name, modified, bytes }) {
  const { model, state } = store;
  let save;
  try {
    save = parseSave(bytes);
  } catch (err) {
    toast({ kicker: 'NOT A SAVE', title: err.message });
    return;
  }
  const diff = diffSave(model, state, save);
  const nm = (id) => esc(model.byId.get(id)?.name || `#${id}`);
  const lvl = ['–', 'normal', 'hard'];
  const nothing = !diff.gained.length && !diff.lost.length && !diff.marks.length;
  const res = await modal(`
    <h3>${nothing ? 'Nothing new' : 'This is what changes'}</h3>
    <p class="muted">${esc(name)} · ${esc(save.edition)} · ${save.achievements.length} secrets · modified ${modified ? timeAgo(modified) + ' ago' : 'unknown'}</p>
    ${diff.gained.length ? `<h4><span class="plus">+${diff.gained.length}</span> secrets</h4><ul class="diff-list">${diff.gained.map((id) => `<li>${nm(id)}</li>`).join('')}</ul>` : ''}
    ${diff.marks.length ? `<h4>${diff.marks.length} marks</h4><ul class="diff-list">${diff.marks.map((m) => `<li>${esc(CHAR_BY_KEY[m.char].name)}: ${esc(markName(m.mark))} ${lvl[m.from]} → <b>${lvl[m.to]}</b></li>`).join('')}</ul>` : ''}
    ${diff.lost.length ? `<h4><span class="minus">−${diff.lost.length}</span> not in the save</h4>
      <p class="muted">${diff.lostManual.length ? 'Ticked by hand, but the save does not have them:' : 'These were ticked but are not in the save:'}</p>
      <form><ul class="diff-list">${diff.lost.map((id) => `<li><label><input type="checkbox" name="keep" value="${id}" ${diff.lostManual.includes(id) ? 'checked' : ''}> keep: ${nm(id)}</label></li>`).join('')}</ul></form>` : ''}
    <p class="muted">Counters (Greed machine, donations, kills) are updated too.</p>
    <div class="row"><button class="btn blood" data-result="ok">${nothing ? 'Update counters' : 'Apply'}</button><button class="btn ghost" data-result="no">Cancel</button></div>`);
  if (res?.result !== 'ok') return;
  const keep = res.form ? [...res.form.querySelectorAll('input[name="keep"]:checked')].map((i) => Number(i.value)) : [];
  const gained = mutate((s) => applySave(model, s, save, { keepManual: keep }), 'save');
  if (gained.length) unlockedToasts(model, gained);
  else toast({ kicker: 'SAVE IMPORTED', title: 'Everything is up to date' });
}

async function steamSync(root) {
  steamMsg = '<p class="muted">Asking Steam…</p>';
  update(root);
  const { model } = store;
  let data;
  try {
    data = await api('/steam');
  } catch (err) {
    steamMsg = `<p><b>Failed.</b> ${esc(err.message)}</p>`;
    return update(root);
  }
  if (data.warning) {
    steamMsg = `<p><b>Steam says 0.</b> ${esc(data.warning)}</p>`;
    return update(root);
  }
  const before = store.state.achievements.size;
  // mutate redraws the page; the message is ready by then.
  steamMsg = `<p>${data.count} achievements on Steam.</p>`;
  const gained = mutate((s) => applySteam(model, s, data.ids), 'steam');
  steamMsg = `<p>${data.count} achievements on Steam${gained.length ? `, ${gained.length} newly ticked` : ', nothing new'} (${before} → ${store.state.achievements.size}).</p>`;
  update(root);
  if (gained.length) unlockedToasts(model, gained);
}
