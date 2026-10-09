// Read the save file, as easily as possible:
//  - Chrome/Edge: the first time you pick the file, after that the browser
//    remembers it (handle in IndexedDB) and "Sync save" is a single click.
//  - Elsewhere, or if the browser refuses to open the folder: just pick or drag the file.

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
    /* no storage: just pick it every time then */
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

// Must be called from a click (asking for permission is only allowed then).
export async function readStored() {
  const handle = await storedHandle();
  if (!handle) return null;
  let perm = await handle.queryPermission?.({ mode: 'read' });
  if (perm !== 'granted') perm = await handle.requestPermission?.({ mode: 'read' });
  if (perm !== 'granted') throw new Error('No permission to read the file.');
  const file = await handle.getFile();
  return { name: file.name, modified: file.lastModified, bytes: new Uint8Array(await file.arrayBuffer()) };
}

export async function pickAndRemember() {
  const [handle] = await window.showOpenFilePicker({
    id: 'isaac-save',
    startIn: 'documents',
    multiple: false,
    types: [{ description: 'Isaac save', accept: { 'application/octet-stream': ['.dat'] } }],
  });
  await idbSet(KEY, handle);
  const file = await handle.getFile();
  return { name: file.name, modified: file.lastModified, bytes: new Uint8Array(await file.arrayBuffer()) };
}

export async function fromFile(file) {
  return { name: file.name, modified: file.lastModified, bytes: new Uint8Array(await file.arrayBuffer()) };
}
