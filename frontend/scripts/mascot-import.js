// Local GLB imports stay on this browser; no model is uploaded to a server.
export async function validateMascot(file) {
  if (!file || !/\.glb$/i.test(file.name)) throw new Error('請選擇 .glb 模型檔。');
  if (file.size > 30 * 1024 * 1024) throw new Error('模型需小於 30 MB，請先減面或壓縮貼圖。');
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength < 20) throw new Error('GLB 檔案不完整。');
  const header = new DataView(buffer);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 ||
      header.getUint32(8, true) !== buffer.byteLength || header.getUint32(16, true) !== 0x4e4f534a) {
    throw new Error('請使用有效的 glTF 2.0 GLB 檔案。');
  }
  const length = header.getUint32(12, true);
  if (20 + length > buffer.byteLength) throw new Error('GLB 資料長度不正確。');
  let model;
  try { model = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length))); }
  catch { throw new Error('無法讀取模型資料。'); }
  if (model.asset?.version !== '2.0' || !model.meshes?.length) throw new Error('模型沒有可顯示的網格。');
  for (const resource of [...(model.buffers || []), ...(model.images || [])]) {
    if (resource.uri && !resource.uri.startsWith('data:')) {
      throw new Error('請將貼圖與網格嵌入 GLB，不能引用外部檔案。');
    }
  }
  return file;
}

function storedModel(mode, value) {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('donttalk-mascot', 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('models');
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const tx = db.transaction('models', mode);
      const store = tx.objectStore('models');
      const request = mode === 'readonly' ? store.get('custom') : store.put(value, 'custom');
      tx.oncomplete = () => { db.close(); resolve(request.result); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}

export function initMascotImport({ viewer, apply, restore, wantsRestore }) {
  const input = document.getElementById('mascot-file');
  const status = document.getElementById('mascot-import-status');
  const button = document.getElementById('mascot-import');
  let objectUrl;
  let revision = 0;
  let cancelPending = () => {};
  const report = message => { status.textContent = message; };
  viewer.addEventListener('error', () => {
    if (objectUrl && viewer.getAttribute('src') === objectUrl) {
      cancelPending();
      restore();
      report('模型無法顯示，已恢復內建人偶。');
    }
  });
  function show(file) {
    const oldUrl = objectUrl;
    objectUrl = URL.createObjectURL(file);
    apply(objectUrl, file.name.replace(/\.glb$/i, ''));
    if (oldUrl) URL.revokeObjectURL(oldUrl);
  }
  button.addEventListener('click', event => { event.stopPropagation(); input.click(); });
  document.getElementById('page-mascot-import')?.addEventListener('click', () => {
    document.getElementById('chatbot-anchor').classList.add('panel-open');
    input.click();
  });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    const currentRevision = ++revision;
    cancelPending();
    button.disabled = true;
    try {
      await validateMascot(file);
      if (revision !== currentRevision) return;
      show(file);
      const importingUrl = objectUrl;
      report('載入模型中…');
      // Commit only after the renderer accepts the model.
      const loaded = () => {
        if (viewer.getAttribute('src') !== importingUrl) { cleanup(); return; }
        cleanup();
        storedModel('readwrite', file).then(
          () => { if (revision === currentRevision) report('已套用並保存在此瀏覽器，其他訪客不會看到。'); },
          () => { if (revision === currentRevision) report('已套用；瀏覽器無法儲存，重新整理後需再次匯入。'); }
        );
      };
      const failed = () => {
        if (viewer.getAttribute('src') !== importingUrl) { cleanup(); return; }
        cleanup(); restore(); report('模型無法顯示，已恢復內建人偶。');
      };
      const cleanup = () => {
        viewer.removeEventListener('load', loaded);
        viewer.removeEventListener('error', failed);
        clearTimeout(timer);
      };
      cancelPending = cleanup;
      viewer.addEventListener('load', loaded);
      viewer.addEventListener('error', failed);
      const timer = setTimeout(() => {
        cleanup();
        if (viewer.getAttribute('src') === importingUrl) {
          restore(); report('模型載入逾時，請縮小模型後重試。');
        }
      }, 60000);
    } catch (error) { report(error.message); }
    finally { button.disabled = false; }
  });
  storedModel('readonly').then(async file => {
    if (!file || revision || !wantsRestore()) return;
    await validateMascot(file);
    if (!revision && wantsRestore()) show(file);
  }).catch(() => { /* Storage unavailable: importing still works for this page. */ });
}
