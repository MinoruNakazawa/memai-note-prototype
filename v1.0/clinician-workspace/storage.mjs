let connection;
function open() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('memai-note-clinician-github-prototype-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('workspace', { keyPath: 'id' });
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('別のタブを閉じて開き直してください。'));
  }).catch(error => { connection = null; throw error; });
  return connection;
}
export async function loadWorkspace() {
  const db = await open();
  return new Promise((resolve,reject) => {
    const req = db.transaction('workspace','readonly').objectStore('workspace').get('main');
    req.onsuccess = () => resolve(req.result?.data || null); req.onerror = () => reject(req.error);
  });
}
export async function saveWorkspace(next, expectedRevision) {
  const db = await open();
  return new Promise((resolve,reject) => {
    const tx = db.transaction('workspace','readwrite'); const store = tx.objectStore('workspace');
    let result; let conflict;
    const req = store.get('main');
    req.onsuccess = () => {
      const actual = req.result?.data?.revision ?? -1;
      if (actual !== expectedRevision) { conflict = new Error('別のタブで記録が更新されています。再読込してから保存してください。'); conflict.name = 'RevisionConflict'; tx.abort(); return; }
      result = { ...next, revision: actual + 1 }; store.put({ id: 'main', data: result });
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(conflict || tx.error || new Error('保存できませんでした。'));
  });
}
