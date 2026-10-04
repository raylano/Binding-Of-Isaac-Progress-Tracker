// Save-bestand inlezen, zo makkelijk mogelijk:
//  - Chrome/Edge: de eerste keer kies je het bestand, daarna onthoudt de browser
//    het (handle in IndexedDB) en is "Sync save" één klik.
//  - Elders, of als de browser de map niet wil openen: gewoon bestand kiezen of slepen.

const DB = 'boipt';
const STORE = 'handles';
const KEY = 'save';

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const r = db.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbSet(key, value) {
  try {
    const db = await idb();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      if (value === null) tx.objectStore(STORE).delete(key);
      else tx.objectStore(STORE).put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch {
    /* geen opslag: dan maar elke keer kiezen */
  }
}

export const canRemember = () => typeof window.showOpenFilePicker === 'function';

export async function storedHandle() {
  if (!canRemember()) return null;
  return idbGet(KEY);
}

export async function forgetHandle() {
  await idbSet(KEY, null);
}

// Moet vanuit een klik worden aangeroepen (toestemming vragen mag alleen dan).
export async function readStored() {
  const handle = await storedHandle();
  if (!handle) return null;
  let perm = await handle.queryPermission?.({ mode: 'read' });
  if (perm !== 'granted') perm = await handle.requestPermission?.({ mode: 'read' });
  if (perm !== 'granted') throw new Error('Geen toestemming om het bestand te lezen.');
  const file = await handle.getFile();
  return { name: file.name, modified: file.lastModified, bytes: new Uint8Array(await file.arrayBuffer()) };
}

export async function pickAndRemember() {
  const [handle] = await window.showOpenFilePicker({
    id: 'isaac-save',
    startIn: 'documents',
    multiple: false,
    types: [{ description: 'Isaac-save', accept: { 'application/octet-stream': ['.dat'] } }],
  });
  await idbSet(KEY, handle);
  const file = await handle.getFile();
  return { name: file.name, modified: file.lastModified, bytes: new Uint8Array(await file.arrayBuffer()) };
}

export async function fromFile(file) {
  return { name: file.name, modified: file.lastModified, bytes: new Uint8Array(await file.arrayBuffer()) };
}
