import { store, mutate, api, replaceState } from '../store.js';
import { CHAR_BY_KEY } from '../../data/characters.js';
import { parseSave } from '../save-parser.js';
import { diffSave, applySave, applySteam, serializeState } from '../logic.js';
import { canRemember, storedHandle, readStored, pickAndRemember, fromFile, forgetHandle } from '../import.js';
import { esc, toast, modal, timeAgo, unlockedToasts, markName } from '../ui.js';

let remembered = null;
let steamMsg = '';

function saveDir() {
  const id = store.config.accountId || '<account-ID>';
  return `C:\\Program Files (x86)\\Steam\\userdata\\${id}\\250900\\remote\\`;
}

export async function mount(root) {
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
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
}

export function unmount() {}

export function update(root) {
  const { state } = store;
  const s = state.sources;
  const origin = location.origin;
  root.innerHTML = `
    <h1 class="view-title">Sync</h1>
    <p class="view-sub">Je save is de bron van waarheid: daarin staan ook je Hard-marks en tellers. Steam vult alleen aan.</p>

    <div class="grid cols-2">
      <section class="paper tape tilt-l">
        <h3>Save-bestand</h3>
        <p class="muted">${s.save ? `Laatst ingelezen ${timeAgo(s.save.at)} geleden (${esc(s.save.edition || '')}, ${s.save.achievements} geheimen).` : 'Nog nooit ingelezen.'}</p>
        <div class="row">
          <button type="button" class="btn blood" data-act="sync-save">${remembered ? 'Sync save' : 'Kies je save'}</button>
          ${remembered ? '<button type="button" class="btn small ghost" data-act="forget">Ander bestand</button>' : ''}
        </div>
        ${canRemember() ? `<p class="muted">${remembered ? 'De browser onthoudt je bestand: na een sessie is dit één klik.' : 'De eerste keer kies je het bestand; daarna onthoudt deze browser het.'}</p>` : '<p class="muted">Deze browser kan het bestand niet onthouden: kies het elke keer, of sleep het hieronder.</p>'}
        <h4>Waar staat het?</h4>
        <div class="path-box"><code id="save-dir">${esc(saveDir())}</code><button type="button" class="btn small" data-act="copy-dir">Kopieer pad</button></div>
        <p class="muted">Plak het pad in de adresbalk van het bestandsvenster en kies <b>rep+persistentgamedata1.dat</b> (slot 1; 2 en 3 voor de andere slots).
          Weigert de browser die map, kies dan de nieuwste kopie in <i>Documenten\\My Games\\Binding of Isaac Repentance+\\save_backups</i>, of gebruik het script hieronder.</p>
        <div class="drop" style="margin-top:10px">Of sleep het .dat-bestand hierheen<br><input type="file" accept=".dat" data-file aria-label="Save kiezen" style="margin-top:8px;max-width:100%"></div>
      </section>

      <section class="paper tilt-r">
        <h3>Steam</h3>
        <p class="muted">${s.steam ? `Laatst ${timeAgo(s.steam.at)} geleden: ${s.steam.count} achievements.` : 'Nog niet gebruikt.'}</p>
        <p>Haalt je Steam-achievements op en vinkt af wat nog ontbrak. Zet nooit iets terug; marks hooguit op normal.</p>
        <p class="muted">Werkt alleen als in Steam <b>Profiel bewerken → Privacy → Game details</b> op <b>Openbaar</b> staat.${store.config.steamKey ? '' : ' (Zonder STEAM_API_KEY gebruikt de server de publieke profielpagina.)'}</p>
        <button type="button" class="btn" data-act="steam">Sync Steam</button>
        <div id="steam-out">${steamMsg}</div>
      </section>

      <section class="paper">
        <h3>Automatisch na het spelen</h3>
        <p>Het script <code>tools/sync-save.ps1</code> stuurt je save zonder browser naar deze site. Met <code>-AfterGame</code> start het Isaac en synchroniseert het zodra je het spel sluit.</p>
        <pre class="cmd">powershell -ExecutionPolicy Bypass -File tools\\sync-save.ps1 -Server ${esc(origin)} -AfterGame</pre>
        <p class="muted">De PIN vraagt het script één keer; die wordt versleuteld voor jouw Windows-account bewaard. Maak er een snelkoppeling "Isaac + sync" van en je hoeft nooit meer te importeren.</p>
      </section>

      <section class="paper">
        <h3>Back-up</h3>
        <p class="muted">Download je volledige stand als JSON, of zet een back-up terug.</p>
        <div class="row">
          <button type="button" class="btn" data-act="export">Download back-up</button>
          <label class="btn ghost">Back-up terugzetten<input type="file" accept="application/json,.json" data-backup class="sr"></label>
        </div>
        <hr>
        <button type="button" class="btn small ghost" data-act="logout">Uitloggen</button>
      </section>
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
          // Chrome blokkeert soms systeemmappen; val terug op het gewone venster.
          root.querySelector('[data-file]')?.click();
          toast({ kicker: 'LET OP', title: 'De browser wil die map niet onthouden; kies het bestand hier.' });
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
      toast({ kicker: 'GEKOPIEERD', title: 'Plak het in het bestandsvenster' });
    } else if (act === 'steam') {
      await steamSync(root);
    } else if (act === 'export') {
      const blob = new Blob([JSON.stringify(serializeState(store.state), null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `kelderdagboek-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } else if (act === 'logout') {
      await api('/logout', { method: 'POST' });
      location.reload();
    }
  } catch (err) {
    toast({ kicker: 'MISLUKT', title: err.message });
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
      const ok = await modal(`<h3>Back-up terugzetten?</h3><p>Je huidige stand (${store.state.achievements.size} geheimen) wordt vervangen door die uit de back-up (${(raw.achievements || []).length} geheimen).</p><div class="row"><button class="btn blood" data-result="ok">Terugzetten</button><button class="btn ghost" data-result="no">Annuleren</button></div>`);
      if (ok?.result === 'ok') {
        const base = store.base;
        replaceState({ ...raw, updatedAt: base });
        mutate(() => {}, 'restore');
        toast({ kicker: 'TERUGGEZET', title: 'Back-up staat er weer' });
      }
    } catch {
      toast({ kicker: 'MISLUKT', title: 'Dat is geen geldige back-up.' });
    }
    e.target.value = '';
  }
}

// Save parsen, verschil tonen, en pas na bevestiging toepassen.
export async function importBytes({ name, modified, bytes }) {
  const { model, state } = store;
  let save;
  try {
    save = parseSave(bytes);
  } catch (err) {
    toast({ kicker: 'GEEN SAVE', title: err.message });
    return;
  }
  const diff = diffSave(model, state, save);
  const nm = (id) => esc(model.byId.get(id)?.name || `#${id}`);
  const lvl = ['–', 'normal', 'hard'];
  const nothing = !diff.gained.length && !diff.lost.length && !diff.marks.length;
  const res = await modal(`
    <h3>${nothing ? 'Niets nieuws' : 'Dit verandert er'}</h3>
    <p class="muted">${esc(name)} · ${esc(save.edition)} · ${save.achievements.length} geheimen · gewijzigd ${modified ? timeAgo(modified) + ' geleden' : 'onbekend'}</p>
    ${diff.gained.length ? `<h4><span class="plus">+${diff.gained.length}</span> geheimen</h4><ul class="diff-list">${diff.gained.map((id) => `<li>${nm(id)}</li>`).join('')}</ul>` : ''}
    ${diff.marks.length ? `<h4>${diff.marks.length} marks</h4><ul class="diff-list">${diff.marks.map((m) => `<li>${esc(CHAR_BY_KEY[m.char].name)}: ${esc(markName(m.mark))} ${lvl[m.from]} → <b>${lvl[m.to]}</b></li>`).join('')}</ul>` : ''}
    ${diff.lost.length ? `<h4><span class="minus">−${diff.lost.length}</span> niet in de save</h4>
      <p class="muted">${diff.lostManual.length ? 'Met de hand afgevinkt, maar de save kent ze niet:' : 'Deze stonden afgevinkt maar zitten niet in de save:'}</p>
      <form><ul class="diff-list">${diff.lost.map((id) => `<li><label><input type="checkbox" name="keep" value="${id}" ${diff.lostManual.includes(id) ? 'checked' : ''}> houden: ${nm(id)}</label></li>`).join('')}</ul></form>` : ''}
    <p class="muted">Tellers (Greed-machine, donaties, kills) worden ook bijgewerkt.</p>
    <div class="row"><button class="btn blood" data-result="ok">${nothing ? 'Tellers bijwerken' : 'Toepassen'}</button><button class="btn ghost" data-result="no">Annuleren</button></div>`);
  if (res?.result !== 'ok') return;
  const keep = res.form ? [...res.form.querySelectorAll('input[name="keep"]:checked')].map((i) => Number(i.value)) : [];
  const gained = mutate((s) => applySave(model, s, save, { keepManual: keep }), 'save');
  if (gained.length) unlockedToasts(model, gained);
  else toast({ kicker: 'SAVE INGELEZEN', title: 'Alles is bijgewerkt' });
}

async function steamSync(root) {
  steamMsg = '<p class="muted">Steam vragen…</p>';
  update(root);
  const { model } = store;
  let data;
  try {
    data = await api('/steam');
  } catch (err) {
    steamMsg = `<p><b>Mislukt.</b> ${esc(err.message)}</p>`;
    return update(root);
  }
  if (data.warning) {
    steamMsg = `<p><b>Steam zegt 0.</b> ${esc(data.warning)}</p>`;
    return update(root);
  }
  const before = store.state.achievements.size;
  // mutate tekent de pagina opnieuw; de melding staat dan al klaar.
  steamMsg = `<p>${data.count} achievements op Steam.</p>`;
  const gained = mutate((s) => applySteam(model, s, data.ids), 'steam');
  steamMsg = `<p>${data.count} achievements op Steam${gained.length ? `, ${gained.length} nieuw afgevinkt` : ', niets nieuws'} (${before} → ${store.state.achievements.size}).</p>`;
  update(root);
  if (gained.length) unlockedToasts(model, gained);
}
