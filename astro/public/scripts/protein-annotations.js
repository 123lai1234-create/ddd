(function () {
    const input = document.getElementById('annotation-pdb');
    const source = document.getElementById('annotation-source');
    const status = document.getElementById('annotation-status');
    const container = document.getElementById('annotation-viewer');
    const entryId = (new URLSearchParams(location.search).get('pdb') ?? '4HHB').trim().toUpperCase();

    input.value = entryId;
    if (!/^[1-9][A-Z0-9]{3}$/.test(entryId)) {
        status.textContent = '請輸入有效的四碼 PDB ID，例如 4HHB。';
        return;
    }
    source.href = `https://www.rcsb.org/3d-sequence/${entryId}`;
    container.src = source.href;
    container.hidden = false;
    status.textContent = `${entryId} · 選取序列區段即可定位 3D 結構；若內嵌檢視器無法顯示，可點上方連結開啟。`;
})();
