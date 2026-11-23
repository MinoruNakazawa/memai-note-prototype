const DB_NAME = 'memai-note-patient-github-prototype-v1';
let connection;
export function openDatabase() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('records', { keyPath: 'id' });
      db.createObjectStore('videos', { keyPath: 'id' });
      db.createObjectStore('preferences', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('別のタブを閉じて、もう一度お試しください。'));
  }).catch(error => { connection = null; throw error; });
  return connection;
}
async function read(store, key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = key === undefined ? tx.objectStore(store).getAll() : tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function write(stores, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('保存できませんでした。'));
    try { action(tx); } catch (error) { tx.abort(); reject(error); }
  });
}
export const allRecords = () => read('records');
export const getVideo = id => read('videos', id);
export const getPreference = async id => (await read('preferences', id))?.value;
export const setPreference = (id, value) => write(['preferences'], tx => tx.objectStore('preferences').put({ id, value }));
export const saveRecord = (record, video) => write(['records', 'videos'], tx => {
  tx.objectStore('records').put(record);
  if (video) tx.objectStore('videos').put({ id: record.id, file: video });
  if (!record.videoName) tx.objectStore('videos').delete(record.id);
});
export const seedSamples = records => write(['records', 'preferences'], tx => {
  for (const record of records) tx.objectStore('records').put(record);
  tx.objectStore('preferences').put({ id: 'samplesSeeded', value: true });
});
