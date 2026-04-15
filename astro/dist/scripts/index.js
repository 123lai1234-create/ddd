/* ── ProteinMPNN Demo — BLOSUM62 × Temperature Softmax ── */
const MPNN_AA = 'ACDEFGHIKLMNPQRSTVWY';

const MPNN_NAMES = {
    A: 'Ala', C: 'Cys', D: 'Asp', E: 'Glu', F: 'Phe', G: 'Gly', H: 'His', I: 'Ile', K: 'Lys', L: 'Leu', M: 'Met', N: 'Asn', P: 'Pro', Q: 'Gln', R: 'Arg', S: 'Ser', T: 'Thr', V: 'Val', W: 'Trp', Y: 'Tyr'
}

    ;

// BLOSUM62 substitution matrix — rows/cols in ACDEFGHIKLMNPQRSTVWY order
const BLM = {
    A: [4, 0, -2, -1, -2, 0, -2, -1, -1, -1, -1, -2, -1, -1, -1, 1, 0, 0, -3, -2],
    C: [0, 9, -3, -4, -2, -3, -3, -1, -3, -1, -1, -3, -3, -3, -3, -1, -1, -1, -2, -2],
    D: [-2, -3, 6, 2, -3, -1, -1, -3, -1, -4, -3, 1, -1, 0, -2, 0, -1, -3, -4, -3],
    E: [-1, -4, 2, 5, -3, -2, 0, -3, 1, -3, -2, 0, -1, 2, 0, 0, -1, -2, -3, -2],
    F: [-2, -2, -3, -3, 6, -3, -1, 0, -3, 0, 0, -3, -4, -3, -3, -2, -2, -1, 1, 3],
    G: [0, -3, -1, -2, -3, 6, -2, -4, -2, -4, -3, 0, -2, -2, -2, 0, -2, -3, -2, -3],
    H: [-2, -3, -1, 0, -1, -2, 8, -3, -1, -3, -2, 1, -2, 0, 0, -1, -2, -3, -2, 2],
    I: [-1, -1, -3, -3, 0, -4, -3, 4, -3, 2, 1, -3, -3, -3, -3, -2, -1, 3, -3, -1],
    K: [-1, -3, -1, 1, -3, -2, -1, -3, 5, -2, -1, 0, -1, 1, 2, 0, -1, -2, -3, -2],
    L: [-1, -1, -4, -3, 0, -4, -3, 2, -2, 4, 2, -3, -3, -2, -2, -2, -1, 1, -2, -1],
    M: [-1, -1, -3, -2, 0, -3, -2, 1, -1, 2, 5, -2, -2, 0, -1, -1, -1, 1, -1, -1],
    N: [-2, -3, 1, 0, -3, 0, 1, -3, 0, -3, -2, 6, -2, 0, 0, 1, 0, -3, -4, -2],
    P: [-1, -3, -1, -1, -4, -2, -2, -3, -1, -3, -2, -2, 7, -1, -2, -1, -1, -2, -4, -3],
    Q: [-1, -3, 0, 2, -3, -2, 0, -3, 1, -2, 0, 0, -1, 5, 1, 0, -1, -2, -2, -1],
    R: [-1, -3, -2, 0, -3, -2, 0, -3, 2, -2, -1, 0, -2, 1, 5, -1, -1, -3, -3, -2],
    S: [1, -1, 0, 0, -2, 0, -1, -2, 0, -2, -1, 1, -1, 0, -1, 4, 1, -2, -3, -2],
    T: [0, -1, -1, -1, -2, -2, -2, -1, -1, -1, -1, 0, -1, -1, -1, 1, 5, 0, -2, -2],
    V: [0, -1, -3, -2, -1, -3, -3, 3, -2, 1, 1, -3, -2, -2, -3, -2, 0, 4, -3, -1],
    W: [-3, -2, -4, -3, 1, -2, -2, -3, -3, -2, -1, -4, -4, -2, -3, -3, -2, -3, 11, 2],
    Y: [-2, -2, -3, -2, 3, -3, 2, -1, -2, -1, -1, -2, -3, -1, -2, -2, -2, -1, 2, 7]
}

    ;

const AA_PROP = {
    A: 'hydrophobic', V: 'hydrophobic', I: 'hydrophobic', L: 'hydrophobic', M: 'hydrophobic', F: 'hydrophobic', W: 'hydrophobic', P: 'hydrophobic', S: 'polar', T: 'polar', N: 'polar', Q: 'polar', Y: 'polar', C: 'polar', R: 'positive', K: 'positive', H: 'positive', D: 'negative', E: 'negative', G: 'special'
}

    ;

const PROP_CSS = {
    hydrophobic: 'aa-hydrophobic', polar: 'aa-polar', positive: 'aa-positive', negative: 'aa-negative', special: 'aa-special'
}

    ;

const PRESETS = {
    hp35: 'LSDEDFKAVFGMTRSAFANLPLWKQQNLKKEKGLF',
    trpcage: 'NLYIQWLKDGGPSSGRPPPS',
    gb1: 'MQYKLILNGKTLKGETTTEAVDAATAEKVFKQYANDNGVDGEWTYDDATKTFTVTE',
    crambim: 'TTCCPSIVARSNFNVCRLPGTPEAICATYTGCIIIPGATCPGDYAN',
    hbb: 'MVHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH',
    ubq: 'MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG',
    lyz: 'KVFGRCELAAAMKRHGLDNYRGYSLGNWVCAAKFESNFNTQATNRNTDGSTDYGILQINSRWWCNDGRTPGSRNLCNIPCSALLSSDITASVNCAKKIVSDGNGMNAWVAWRNRCKGTDVQAWIRGCRL',
    gfp: 'MASKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTLSYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITLGMDELYK',
    myo: 'GLSDGEWQQVLNVWGKVEADIAGHGQEVLIRLFTGHPETLEKFDKFKHLKTEAEMKASEDLKKHGTVVLTALGGILKKKGHHEAELKPLAQSHATKHKIPIKYLEFISDAIIHVLHSRHPGDFGADAQGAMTKALELFRNDIAAKYKELGFQG',
    bpti: 'RPDFCLEPPYTGPCKARIIRYFYNAKAGLCQTFVYGGCRAKRNNFKSAEDCMRTCGGA',
    insulin_b: 'FVNQHLCGSHLVEALYLVCGERGFFYTPKT',
    cyc: 'GDVEKGKKIFVQKCAQCHTVEKGGKHKTGPNLHGLFGRKTGQAPGFSYTDANKNKGITWKEETLMEYLENPKKYIPGTKMIFAGIKKKTEREDLIAYLKKATNE',
    rnasea: 'KETAAAKFERQHMDSSTSAASSSNYCNQMMKSRNLTKDRCKPVNTFVHESLADVQAVCSQKNVACKNGQTNCYQSYSTMSITDCRETGSSKYPNCAYKTTQANKHIIVACEGNPYVPVHFDASV',
    calmodulin: 'ADQLTEEQIAEFKEAFSLFDKDGDGTITTKELGTVMRSLGQNPTEAELQDMINEVDADGNGTIDFPEFLTMMARKMKDTDSEEEIREAFRVFDKDGNGYISAAELRHVMTNLGEKLTDEEVDEMIREADIDGDGQVNYEEFVQMMTAK',
    melittin: 'GIGAVLKVLTTGLPALISWIKRKRQQ',
    defensin: 'ACYCRIPACIAGERRYGTCIYQGRLWAFCC',
    insulin_a: 'GIVEQCCTSICSLYQLENYCN',
    protein_a: 'TADNKFNKEQQNAFYEILHLPNLNEEQRNAFIQSLKDDPSQSANLLAEAKKLNDAQAPK',
    ci2: 'LKTEWPELVGKSVEEAKKVILQDKPEAQIIVLPVGTIVTMEYRIDRVRLFVDKLDNIAEVPRVG',
    barnase: 'AQVINTFDGVADYLQTYHKLPDNYITKSEAQALGWVASKGNLADVAPGKSIGGDIFSNREGKLPGKSGRTWREADINYTSGFRNSDRILYSSDWLIYKTTDHYQTFTKIR',
    thioredoxin: 'SDKIIHLTDDSFDTDVLKADGAILVDFWAEWCGPCKMIAPILDEIADEYQGKLTVAKLNIDQNPGTAPKYGIRGIPTLLLFKNGEVAATKVGALSKGQLKEFLDANLA',
    hras: 'MTEYKLVVVGAGGVGKSALTIQLIQNHFVDEYDPTIEDSYRKQVVIDGETCLLDILDTAGQEEYSAMRDQYMRTGEGFLCVFAINNTKSFEDIHQYREQIKRVKDSDDVPMVLVGNKCDLAARTVESRQAQDLARSYGIPYIETSAKTRQGVEDAFYTLVREIRQH',
    streptavidin: 'AEAGITGTWYNQLGSTFIVTAGADGALTGTYESAVGNAESRYVLTGRYDSAPATDGSGTALGWTVAWKNNYRNAHSATTWSGQYVGGAEARINTQWLLTSGTTEANAWKSTLVGHDTFTKVKPSAAS',
    p53_dbd: 'SSSVPSQKTYQGSYGFRLGFLHSGTAKSVTCTYSPALNKMFCQLAKTCPVQLWVDSTPPPGTRVRAMAIYKQSQHMTEVVRRCPHHERCSDSDGLAPPQHLIRVEGNLRVEYLDDRNTFRHSVVVPYEPPEVGSDCTTIHYNYMCNSSCMGGMNRRPILTIITLEDSSGNLLGRNSFEVRVCACPGRDRRTEEENLRKKGEPHHELPPGSTKRALPNNTSS',
    carbonic_anhydrase: 'SHHWGYGKHNGPEHWHKDFPIAKGERQSPVDIDTKAVVQDPALKPLALVYGEATSRRMVNNGHSFNVEYDDSQDKAVLKDGPLTGTYRLVQFHFHWGSSDDQGSEHTVDRKKYAAELHLVHWNTKYGDFGTAAQQPDGLAVVGVFLKVGDANPALQKVLDALDSIKTKGKSTDFPNFDPGSLLPNVLDYWTYPGSLTTPPLLESVTWIVLKEPISVSSQQMLKFRTLNFNAEGEPELLMLANWRPAQPLKNRQVRGFPK'
}

    ;

let _currentModel = 'v_48_020';

// 序列指紋對應表（序列前 15 字元 → PDB ID）
const KNOWN_SEQ_MAP = {
    'LSDEDFKAVFGMTRS': {
        pdbId: '1VII', name: 'Villin HP35'
    }

    ,
    'NLYIQWLKDGGPSSG': {
        pdbId: '1L2Y', name: 'Trp-cage'
    }

    ,
    'MQYKLILNGKTLKGE': {
        pdbId: '1PGB', name: 'GB1 domain'
    }

    ,
    'TTCCPSIVARSNFNV': {
        pdbId: '1CRN', name: 'Crambin'
    }

    ,
    'MQIFVKTLTGKTITL': {
        pdbId: '1UBQ', name: 'Ubiquitin'
    }

    ,
    'MVHLTPEEKSAVTAL': {
        pdbId: '4HHB', name: '血紅蛋白 β-chain'
    }

    ,
    'MVLSPADKTNVKAAW': {
        pdbId: '4HHB', name: '血紅蛋白 α-chain'
    }

    ,
    'KVFGRCELAAAMKRH': {
        pdbId: '1LYZ', name: 'Lysozyme'
    }

    ,
    'MSKGEELFTGVVPIL': {
        pdbId: '1GFL', name: 'GFP'
    }
}

    ;

const PRESET_PDB = {
    hp35: '1VII', trpcage: '1L2Y', gb1: '1PGB', crambim: '1CRN', hbb: '4HHB',
    ubq: '1UBQ', lyz: '1LYZ', gfp: '1GFL', myo: '1MBN', bpti: '1BPI',
    insulin_b: '4INS', cyc: '1HRC', rnasea: '7RSA', calmodulin: '1CLL',
    melittin: '2MLT', defensin: '1DFN', insulin_a: '4INS',
    protein_a: '1BDD', ci2: '2CI2', barnase: '1BNR',
    thioredoxin: '2TRX', hras: '4Q21', streptavidin: '1STP',
    p53_dbd: '1TUP', carbonic_anhydrase: '1CA2'
}

    ;

const PRESET_INFO = {
    hp35: {
        name: 'Villin HP35', pdb: '1VII', len: 35, note: '超快速折疊蛋白 · 3 條 α-螺旋'
    }

    ,
    trpcage: {
        name: 'Trp-cage', pdb: '1L2Y', len: 20, note: '最小穩定折疊蛋白 · Trp6 疏水核心'
    }

    ,
    gb1: {
        name: 'GB1 domain', pdb: '1PGB', len: 56, note: 'β-sheet + α-helix 經典拓撲'
    }

    ,
    crambim: {
        name: 'Crambin', pdb: '1CRN', len: 46, note: '富含 Cys · 含 3 個二硫鍵'
    }
}

    ;
let _3dmolViewer = null, _spinning = true, _structStyle = 'cartoon', _3dColorMode = 'spectrum';
let _activeStructureRequestId = 0, _activeStructureAbortController = null;
window._mpnnActiveIdx = 0; // 目前在 3D 中顯示的設計序列編號

function _log3dDebug(stage, details) {
    try {
        console.warn('[3D]', stage, details || '');
    } catch (e) { }
}

_log3dDebug('script:loaded', { file: 'scripts/index.js' });

// 通用：直接用 PDB ID 載入結構
function loadPdbById(pdbId) {
    pdbId = pdbId.trim().toUpperCase();
    if (!pdbId) return;
    _log3dDebug('ui:loadPdbById', { pdbId });
    const input = document.getElementById('pdbIdInput');
    if (input) input.value = pdbId;
    _loadStructureByPdbId(pdbId);
}

function loadPdbDirect() {
    const id = document.getElementById('pdbIdInput').value.trim().toUpperCase();
    _log3dDebug('ui:loadPdbDirect', { pdbId: id });

    if (!id || id.length < 3) {
        alert('請輸入 3–6 字元的 PDB ID'); return;
    }

    _loadStructureByPdbId(id);
}

function loadPreset(name) {
    const seq = PRESETS[name] || '';
    document.getElementById('mpnnSeq').value = seq;
    updateMpnnSeqInfo();
    const pdbId = PRESET_PDB[name];
    if (pdbId) loadPdbById(pdbId);
}

function _setStructPlaceholder(html, showInfo = false) {
    const placeholder = document.getElementById('mpnnStructPlaceholder');
    const infoEl = document.getElementById('mpnnStructInfo');
    if (placeholder) {
        placeholder.style.display = 'flex';
        placeholder.innerHTML = html;
    }
    if (infoEl) infoEl.style.display = showInfo ? 'flex' : 'none';
}

const _pdbCache = new Map();

async function _fetchPdbTextWithFallback(pdbId, signal) {
    const cacheKey = pdbId.toUpperCase();
    if (_pdbCache.has(cacheKey)) {
        return _pdbCache.get(cacheKey);
    }
    let resolvedApiBase = '';
    if (typeof resolvePortfolioApiBase === 'function') {
        try {
            resolvedApiBase = await resolvePortfolioApiBase();
        } catch (error) {
            resolvedApiBase = '';
        }
    }

    if (!resolvedApiBase) {
        resolvedApiBase = typeof window.APP_CONFIG?.API_BASE_URL === 'string'
            ? window.APP_CONFIG.API_BASE_URL.trim().replace(/\/+$/, '')
            : '';
    }

    const sources = [
        {
            url: resolvedApiBase ? (resolvedApiBase + '/api/structures/pdb/' + encodeURIComponent(pdbId)) : '',
            format: 'json-proxy',
            isValid: payload => payload && typeof payload.text === 'string' && (
                (payload.format === 'pdb' && (payload.text.includes('ATOM') || payload.text.includes('HETATM'))) ||
                (payload.format === 'cif' && payload.text.includes('_atom_site'))
            )
        },
        {
            url: 'https://models.rcsb.org/v1/' + pdbId + '/full?format=cif',
            format: 'cif',
            isValid: text => text && text.includes('_atom_site')
        },
        {
            url: 'https://files.rcsb.org/download/' + pdbId + '.pdb',
            format: 'pdb',
            isValid: text => text && text.includes('ATOM')
        },
        {
            url: 'https://files.rcsb.org/view/' + pdbId + '.pdb',
            format: 'pdb',
            isValid: text => text && text.includes('ATOM')
        }
    ].filter(source => Boolean(source.url));

    let lastError = null;

    for (const source of sources) {
        try {
            _log3dDebug('fetch:start', { pdbId, url: source.url, format: source.format });
            const response = await fetch(source.url, {
                signal,
                mode: 'cors',
                cache: 'no-store'
            });

            _log3dDebug('fetch:response', {
                pdbId,
                url: source.url,
                format: source.format,
                ok: response.ok,
                status: response.status,
                contentType: response.headers.get('content-type')
            });

            if (!response.ok) {
                throw new Error('HTTP ' + response.status + ' @ ' + source.url);
            }

            if (source.format === 'json-proxy') {
                const structurePayload = await response.json();
                _log3dDebug('fetch:proxy-payload', {
                    pdbId,
                    url: source.url,
                    format: structurePayload?.format,
                    sourceUrl: structurePayload?.sourceUrl,
                    length: structurePayload?.text ? structurePayload.text.length : 0
                });
                if (source.isValid(structurePayload)) {
                    _log3dDebug('fetch:valid', {
                        pdbId,
                        url: source.url,
                        format: structurePayload.format,
                        sourceUrl: structurePayload.sourceUrl
                    });
                    return {
                        text: structurePayload.text,
                        format: structurePayload.format,
                        url: structurePayload.sourceUrl || source.url
                    };
                }

                throw new Error('Invalid structure proxy response @ ' + source.url);
            }

            const structureText = await response.text();
            _log3dDebug('fetch:text', {
                pdbId,
                url: source.url,
                format: source.format,
                length: structureText ? structureText.length : 0,
                preview: structureText ? structureText.slice(0, 80) : ''
            });
            if (source.isValid(structureText)) {
                _log3dDebug('fetch:valid', { pdbId, url: source.url, format: source.format });
                const result = { text: structureText, format: source.format, url: source.url };
                _pdbCache.set(cacheKey, result);
                return result;
            }

            throw new Error('Empty or invalid structure response @ ' + source.url);
        } catch (err) {
            lastError = err;
            _log3dDebug('fetch:error', {
                pdbId,
                url: source.url,
                format: source.format,
                name: err && err.name,
                message: err && err.message
            });
            if (err && err.name === 'AbortError') {
                throw err;
            }
        }
    }

    throw lastError || new Error('No PDB source available');
}

// ── ESMFold API：折疊任意序列 ──────────────────────────────────────────
const ESMFOLD_API = 'https://api.esmatlas.com/foldSequence/v1/pdb/';

async function loadSeqWithEsmFold(seq) {
    if (!seq || seq.length < 10) { alert('序列太短（最少 10 個殘基）'); return; }
    if (seq.length > 400) { alert('ESMFold 免費 API 建議序列長度 ≤ 400，請截短後再試。'); return; }

    _log3dDebug('esmfold:start', { seqLen: seq.length });

    _setStructPlaceholder(
        '<div style="font-size:1.6rem;animation:spin3d 1s linear infinite">🧬</div>' +
        '<div style="margin-top:12px;font-size:.88rem;color:var(--muted)">ESMFold 預測結構中（' + seq.length + ' 殘基）…<br>' +
        '<span style="font-size:.75rem;color:var(--dim)">通常需要 10–30 秒</span></div>'
    );

    if (typeof $3Dmol === 'undefined') {
        if (typeof window.load3Dmol === 'function') {
            await new Promise((resolve, reject) => {
                window.load3Dmol(err => err ? reject(err) : resolve());
            });
        }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
        const resp = await fetch(ESMFOLD_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: seq,
            signal: controller.signal,
        });

        if (!resp.ok) throw new Error('ESMFold API HTTP ' + resp.status);
        const pdbText = await resp.text();
        if (!pdbText || !pdbText.includes('ATOM')) throw new Error('ESMFold 回傳無效 PDB');

        _log3dDebug('esmfold:got-pdb', { length: pdbText.length });

        // 建立 viewer
        const viewer3d = document.getElementById('mpnnStruct3d');
        const placeholder = document.getElementById('mpnnStructPlaceholder');
        viewer3d.innerHTML = '';
        if (_3dmolViewer) { try { _3dmolViewer.removeAllModels(); _3dmolViewer.clear(); } catch (e) { } _3dmolViewer = null; }

        await new Promise(r => requestAnimationFrame(r));
        const rect = viewer3d.getBoundingClientRect();
        const w = Math.max(Math.round(rect.width || viewer3d.offsetWidth || 320), 320);
        const h = Math.max(Math.round(rect.height || viewer3d.offsetHeight || 340), 340);
        _3dmolViewer = $3Dmol.createViewer(viewer3d, { backgroundColor: '#080c10', antialias: true, width: w, height: h });

        _3dmolViewer.addModel(pdbText, 'pdb');
        _3dmolViewer.setStyle({}, { cartoon: { color: 'spectrum', opacity: 0.95, thickness: 0.4 } });
        _3dmolViewer.zoomTo();
        _3dmolViewer.resize();
        _3dmolViewer.render();
        _3dmolViewer.spin(true);
        _spinning = true; _structStyle = 'cartoon'; _3dColorMode = 'spectrum';
        requestAnimationFrame(() => { if (placeholder) placeholder.style.display = 'none'; });

        // 更新資訊列
        const infoEl = document.getElementById('mpnnStructInfo');
        if (infoEl) {
            infoEl.style.display = 'flex';
            const nameEl = infoEl.querySelector('.struct-name');
            if (nameEl) nameEl.textContent = 'ESMFold 預測（' + seq.length + ' aa）';
            const lenEl = infoEl.querySelector('.struct-len');
            if (lenEl) lenEl.textContent = seq.length + ' 殘基';
        }

        window._loadedPdbId = null;
        _showToast('🧬 ESMFold 結構預測完成（' + seq.length + ' 殘基）');
        _log3dDebug('esmfold:rendered', { seqLen: seq.length });

    } catch (err) {
        _log3dDebug('esmfold:error', { message: err && err.message });
        const isTimeout = err && err.name === 'AbortError';
        _setStructPlaceholder(
            '<div style="font-size:1.8rem">⚠️</div>' +
            '<div style="font-size:.9rem;color:var(--muted)">ESMFold 預測失敗</div>' +
            '<div style="font-size:.75rem;color:var(--dim)">' +
            (isTimeout ? '請求逾時（60s），ESMFold API 可能暫時繁忙，請稍後再試。' :
                (err && err.message) || '未知錯誤') + '</div>'
        );
    } finally {
        clearTimeout(timeout);
    }
}

async function _loadStructureByPdbId(pdbId) {
    const placeholder = document.getElementById('mpnnStructPlaceholder');
    const viewer3d = document.getElementById('mpnnStruct3d');
    const infoEl = document.getElementById('mpnnStructInfo');
    const requestId = ++_activeStructureRequestId;

    _log3dDebug('load:start', { pdbId, requestId });

    _setStructPlaceholder('<div style="font-size:1.6rem;animation:spin3d 1s linear infinite">⏳</div><div style="margin-top:12px;font-size:.88rem;color:var(--muted)">從 RCSB PDB 載入 <strong>' + pdbId + '</strong>…</div>');

    if (typeof $3Dmol === 'undefined') {
        _log3dDebug('3dmol:missing', { pdbId, requestId, hasLoader: typeof window.load3Dmol === 'function' });
        if (typeof window.load3Dmol === 'function') {
            window.load3Dmol(function (err) {
                _log3dDebug('3dmol:loader-callback', {
                    pdbId,
                    requestId,
                    error: err ? (err.message || String(err)) : null,
                    loaded: typeof $3Dmol !== 'undefined'
                });
                if (err || typeof $3Dmol === 'undefined') {
                    _setStructPlaceholder('<div style="font-size:1.8rem">⚠️</div><div style="font-size:.9rem;color:var(--muted)">3D 渲染引擎載入失敗</div><div style="font-size:.75rem;color:var(--dim)">請檢查網路或 CDN 存取，再重試一次。</div>');
                    return;
                }

                _loadStructureByPdbId(pdbId);
            });
            return;
        }

        _setStructPlaceholder('<div style="font-size:1.8rem">⚠️</div><div style="font-size:.9rem;color:var(--muted)">3D 載入器不存在</div><div style="font-size:.75rem;color:var(--dim)">頁面初始化不完整，請重新整理。</div>');
        return;
    }

    viewer3d.innerHTML = '';
    infoEl.style.display = 'none';

    if (_activeStructureAbortController) {
        try {
            _log3dDebug('load:abort-previous', { pdbId, requestId });
            _activeStructureAbortController.abort();
        } catch (e) { }
    }

    _activeStructureAbortController = new AbortController();
    const localAbortController = _activeStructureAbortController;

    if (_3dmolViewer) {
        try {
            _3dmolViewer.removeAllModels(); _3dmolViewer.clear();
        }

        catch (e) { }

        _3dmolViewer = null;
    }

    await new Promise(resolve => requestAnimationFrame(resolve));

    const rect = viewer3d.getBoundingClientRect();
    const viewerWidth = Math.max(Math.round(rect.width || viewer3d.offsetWidth || viewer3d.clientWidth || 320), 320);
    const viewerHeight = Math.max(Math.round(rect.height || viewer3d.offsetHeight || viewer3d.clientHeight || 340), 340);

    _log3dDebug('viewer:size', {
        pdbId,
        requestId,
        rectWidth: rect.width,
        rectHeight: rect.height,
        offsetWidth: viewer3d.offsetWidth,
        offsetHeight: viewer3d.offsetHeight,
        clientWidth: viewer3d.clientWidth,
        clientHeight: viewer3d.clientHeight,
        viewerWidth,
        viewerHeight
    });

    _3dmolViewer = $3Dmol.createViewer(viewer3d, {
        backgroundColor: '#080c10', antialias: false,
        width: viewerWidth, height: viewerHeight
    });
    try {
        if (_3dmolViewer.renderer && typeof _3dmolViewer.renderer.setPixelRatio === 'function') {
            _3dmolViewer.renderer.setPixelRatio(1);
        }
    } catch (e) { }
    _log3dDebug('viewer:created', { pdbId, requestId, hasViewer: !!_3dmolViewer });
    _spinning = true; _structStyle = 'cartoon'; _3dColorMode = 'spectrum';

    const fetchTimeout = setTimeout(() => {
        try {
            localAbortController.abort();
        } catch (e) { }
    }, 18000);

    try {
        const structure = await _fetchPdbTextWithFallback(pdbId, localAbortController.signal);

        _log3dDebug('load:structure-ready', {
            pdbId,
            requestId,
            format: structure.format,
            url: structure.url,
            textLength: structure.text.length
        });

        if (requestId !== _activeStructureRequestId || !_3dmolViewer) {
            _log3dDebug('load:stale-request', { pdbId, requestId, activeRequestId: _activeStructureRequestId, hasViewer: !!_3dmolViewer });
            return;
        }

        _setStructPlaceholder('<div style="font-size:1.6rem;animation:spin3d 1s linear infinite">🧬</div><div style="margin-top:12px;font-size:.88rem;color:var(--muted)">正在渲染 <strong>' + pdbId + '</strong> 結構…</div>');
        _3dmolViewer.addModel(structure.text, structure.format);
        _log3dDebug('viewer:model-added', { pdbId, requestId, format: structure.format });
        let primaryChain = 'A';
        try {
            const m = _3dmolViewer.getModel();
            if (m && m.atoms && m.atoms.length) {
                const chains = new Set();
                m.atoms.forEach(a => { if (a.chain) chains.add(a.chain); });
                if (!chains.has('A')) primaryChain = [...chains][0] || 'A';
            }
        } catch (e) { }
        _3dmolViewer.setStyle({}, {});
        _3dmolViewer.setStyle({ chain: primaryChain }, { cartoon: { color: 'spectrum', opacity: 0.95, thickness: 0.3, arrows: false } });
        _3dmolViewer.setStyle({ chain: primaryChain, hetflag: true }, { stick: { radius: 0.12, colorscheme: 'Jmol' } });
        _3dmolViewer.resize();
        _3dmolViewer.zoomTo({ chain: primaryChain });
        _3dmolViewer.render();
        _3dmolViewer.spin('y', 0.4);
        _log3dDebug('viewer:rendered', { pdbId, requestId });
        requestAnimationFrame(function () { placeholder.style.display = 'none'; });

        let resCount = 0;
        try {
            const m = _3dmolViewer.getModel();
            if (m) {
                const seen = new Set();
                m.atoms.forEach(a => seen.add(a.resi));
                resCount = seen.size;
            }
        } catch (e) { }

        infoEl.style.display = 'flex';
        infoEl.innerHTML = '<span style="color:var(--teal);font-weight:600;font-family:var(--mono)">PDB: ' + pdbId + '</span>' +
            (resCount ? '<span style="color:var(--dim)"> ' + resCount + ' 殘基</span>' : '') +
            '<span style="color:var(--dim);margin-left:8px">來源: ' + structure.format.toUpperCase() + '</span>' +
            '<div style="margin-left:auto;display:flex;gap:6px"><button class="expand-btn" id="spinBtn" onclick="toggleSpin()">⏸ 停止旋轉</button> <button class="expand-btn" id="styleBtn" onclick="toggleStyle()">棒狀模式</button></div>';
        _log3dDebug('load:success', { pdbId, requestId, resCount, format: structure.format, sourceUrl: structure.url });
        window._loadedPdbId = pdbId;
        const _curSeq = document.getElementById('mpnnSeq').value.toUpperCase().replace(/\s/g, '');
        if (_curSeq.length) _checkSeqPdbMatch(_curSeq);
    } catch (err) {
        if (requestId !== _activeStructureRequestId) {
            _log3dDebug('load:ignored-error-stale', { pdbId, requestId, activeRequestId: _activeStructureRequestId });
            return;
        }

        console.error('3D structure fetch failed:', err);
        _log3dDebug('load:failed', {
            pdbId,
            requestId,
            name: err && err.name,
            message: err && err.message
        });
        _3dmolViewer = null;
        viewer3d.innerHTML = '';
        const isTimeout = err && err.name === 'AbortError';
        _setStructPlaceholder(
            '<div style="font-size:1.8rem">⚠️</div>' +
            '<div style="font-size:.9rem;color:var(--muted)">結構載入失敗：<strong>' + pdbId + '</strong></div>' +
            '<div style="font-size:.75rem;color:var(--dim)">' +
            (isTimeout ? '請求逾時 (18s)，請檢查網路後重試。' : '結構來源回應或解析異常，已嘗試多個下載端點。') +
            '</div>'
        );
    } finally {
        clearTimeout(fetchTimeout);
    }
}

function toggleSpin() {
    if (!_3dmolViewer) return;
    _spinning = !_spinning;
    _3dmolViewer.spin(_spinning);
    const btn = document.getElementById('spinBtn');
    if (btn) btn.textContent = _spinning ? '⏸ 停止旋轉' : '▶ 開始旋轉';
}

const _STRUCT_STYLES = ['cartoon', 'stick', 'sphere'];

const _STYLE_NEXT = {
    cartoon: '棒狀模式', stick: '球體模式', sphere: '卡通模式'
}

    ;

function toggleStyle() {
    if (!_3dmolViewer) return;
    _structStyle = _STRUCT_STYLES[(_STRUCT_STYLES.indexOf(_structStyle) + 1) % _STRUCT_STYLES.length];

    _3dmolViewer.setStyle({}

        , {});

    if (_structStyle === 'cartoon') {
        if (_3dColorMode === 'design') applyDesignColoring();

        else _3dmolViewer.setStyle({}

            , {
                cartoon: {
                    color: 'spectrum', opacity: 0.95
                }
            });
    }

    else if (_structStyle === 'stick') {
        _3dmolViewer.setStyle({}

            , {
                stick: {
                    radius: 0.12, colorscheme: 'amino'
                }
            });

        _3dmolViewer.setStyle({
            hetflag: true
        }

            , {
                stick: {
                    radius: 0.18, colorscheme: 'Jmol'
                }
            });
    }

    else {
        _3dmolViewer.setStyle({}

            , {
                sphere: {
                    scale: 0.32, colorscheme: 'amino'
                }
            });
    }

    _3dmolViewer.render();
    const btn = document.getElementById('styleBtn');
    const next = _STRUCT_STYLES[(_STRUCT_STYLES.indexOf(_structStyle) + 1) % _STRUCT_STYLES.length];
    if (btn) btn.textContent = _STYLE_NEXT[next];
}

// 切換 3D 顯示到指定設計序列
function viewSeqIn3D(idx) {
    if (!_3dmolViewer) {
        if (window._mpnnResults && window._mpnnResults[idx]) {
            if (confirm('尚未載入 PDB 結構。\n是否用 ESMFold 預測此設計序列的結構？')) {
                loadSeqWithEsmFold(window._mpnnResults[idx].seq);
            }
        } else {
            alert('請先載入 PDB 結構或執行序列設計');
        }
        return;
    }

    if (!window._mpnnResults) {
        alert('請先執行「設計序列」'); return;
    }

    window._mpnnActiveIdx = idx;
    _3dColorMode = 'design'; _structStyle = 'cartoon';
    applyDesignColoring();

    // 高亮對應列
    document.querySelectorAll('#mpnnTableBody tr').forEach((tr, i) => {
        tr.style.background = i === idx ? 'rgba(57,208,240,.07)' : '';
    });

    // 重置所有 🔬 按鈕，高亮選中的
    document.querySelectorAll('.view3d-btn').forEach((b, i) => {
        b.style.background = i === idx ? 'rgba(57,208,240,.2)' : '';
        b.style.borderColor = i === idx ? '#39d0f0' : '';
    });

    // 同步大按鈕外觀
    const mainBtn = document.getElementById('esmFoldBtn');

    if (mainBtn) {
        mainBtn.innerHTML = '🌈 還原 Spectrum';
        mainBtn.style.borderColor = '#f0883e';
        mainBtn.style.color = '#f0883e';
        mainBtn.style.background = 'linear-gradient(135deg,#1f1008,#3a1f08)';
    }

    // 更新圖例
    const infoEl = document.getElementById('mpnnStructInfo');

    if (infoEl) {
        let legend = infoEl.querySelector('.design-legend');

        if (!legend) {
            legend = document.createElement('div'); legend.className = 'design-legend'; infoEl.appendChild(legend);
        }

        const r = window._mpnnResults[idx];
        const inputSeq = window._mpnnInputSeq || '';
        const nMut = r.seq.split('').filter((c, j) => c !== (inputSeq[j] || '')).length;
        // 建立突變明細列表（如 L25V）
        const fixedSet = window._mpnnFixedSet || new Set();

        const mutList = r.seq.split('').map((c, j) => {
            if (!fixedSet.has(j) && c !== (inputSeq[j] || '')) return `${inputSeq[j] || '?'
                }

                        ${j + 1
                }

                        ${c
                }

                        `;
            return null;
        }).filter(Boolean);
        legend.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:8px;font-size:.72rem;padding-top:8px;border-top:1px solid var(--border)';

        legend.innerHTML = ` <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap" > <span style="color:var(--teal);font-weight:700" >序列 #${idx + 1
            }

                </span> <span><span style="color:#ff6a00;margin-right:3px" >■</span>突變 (${nMut

            })</span> <span><span style="color:#39d0f0;margin-right:3px" >■</span>不變</span> <span><span style="color:#484f58;margin-right:3px" >■</span>固定</span> </div> ${mutList.length ? `< div style = "font-family:var(--mono);color:#ffb347;font-size:.70rem;line-height:1.6" > ${mutList.slice(0, 10).join(' · ')
                }

                    ${mutList.length > 10 ? ` <span style="color:var(--muted)" >…+${mutList.length - 10
                    }

                        </span>` : ''
                }

                    </div > ` : ` < div style = "color:var(--muted);font-size:.70rem" > 與輸入序列完全相同（teal 著色）</div > `
            }

                `;
    }

    _showToast(`🔬 3D 顯示序列 #${idx + 1
        }

                （${window._mpnnResults[idx].seq.split('').filter((c, j) => c !== (window._mpnnInputSeq || '')[j]).length
        }

                個突變）`);
}

function applyDesignColoring(idxOverride) {
    if (!_3dmolViewer || !window._mpnnResults) return;
    const idx = (idxOverride !== undefined) ? idxOverride : (window._mpnnActiveIdx || 0);
    const designSeq = window._mpnnResults[idx].seq;
    const inputSeq = window._mpnnInputSeq || '';
    const fixedSet = window._mpnnFixedSet || new Set();

    try {
        const model = _3dmolViewer.getModel();
        if (!model) throw new Error('no model');
        const seen = new Set(), sortedResi = [];

        model.atoms.forEach(a => {
            if (!seen.has(a.resi)) {
                seen.add(a.resi); sortedResi.push(a.resi);
            }
        });
        sortedResi.sort((a, b) => a - b);

        const mutated = [], unchanged = [], fixed = [];
        const mutDetails = [];

        for (let i = 0; i < Math.min(designSeq.length, sortedResi.length); i++) {
            const pdbR = sortedResi[i];
            if (fixedSet.has(i)) fixed.push(pdbR);
            else if (designSeq[i] === inputSeq[i]) unchanged.push(pdbR);

            else {
                mutated.push(pdbR);

                mutDetails.push({
                    resi: pdbR, from: inputSeq[i] || '?', to: designSeq[i]
                });
            }
        }

        // 清除舊形狀和標籤
        _3dmolViewer.removeAllShapes();
        _3dmolViewer.removeAllLabels();

        if (mutated.length === 0) {

            // 0 突變：全場迄青——和其他序列明顯不同
            _3dmolViewer.setStyle({}

                , {
                    cartoon: {
                        color: '#39d0f0', opacity: 0.80
                    }
                });

            if (fixed.length) _3dmolViewer.setStyle({
                resi: fixed
            }

                , {
                    cartoon: {
                        color: '#2a2d35', opacity: 0.50
                    }
                });
            _3dmolViewer.zoomTo();
        }

        else {

            // Cartoon 底色
            _3dmolViewer.setStyle({}

                , {
                    cartoon: {
                        color: '#1e3a4a', opacity: 0.45
                    }
                });

            if (unchanged.length) _3dmolViewer.setStyle({
                resi: unchanged
            }

                , {
                    cartoon: {
                        color: '#2a5f7a', opacity: 0.60
                    }
                });

            if (fixed.length) _3dmolViewer.setStyle({
                resi: fixed
            }

                , {
                    cartoon: {
                        color: '#2a2d35', opacity: 0.40
                    }
                });

            // 突變殘基：亮橙 cartoon + stick 側鏈
            _3dmolViewer.setStyle({
                resi: mutated
            }

                , {
                    cartoon: {
                        color: '#ff6a00', opacity: 1.0
                    }

                    ,
                    stick: {
                        radius: 0.20, color: '#ffb347'
                    }
                });

            // 每個突變 Cα：发光球 + 浮動標籤
            const showLabels = mutDetails.length <= 12;

            model.atoms.forEach(a => {
                if (a.atom !== 'CA' || !mutated.includes(a.resi)) return;

                _3dmolViewer.addSphere({
                    center: {
                        x: a.x, y: a.y, z: a.z
                    }

                    ,
                    radius: 0.60, color: '#ff6a00', opacity: 0.90
                });

                if (showLabels) {
                    const md = mutDetails.find(m => m.resi === a.resi);

                    if (md) {
                        _3dmolViewer.addLabel(`${md.from}${a.resi}${md.to}`, {
                            position: {
                                x: a.x, y: a.y + 1.4, z: a.z
                            }

                            ,
                            backgroundColor: '#0d0500',
                            fontColor: '#ffb347',
                            fontSize: 12,
                            borderColor: '#ff6a00',
                            borderThickness: 1,
                            inFront: true
                        });
                    }
                }
            });

            // 鎡頭移轉到突變中心
            _3dmolViewer.zoomTo({
                resi: mutated
            }

                , 800);
        }

        _3dmolViewer.render();
    }

    catch (e) {
        _3dmolViewer.setStyle({}

            , {
                cartoon: {
                    color: 'spectrum', opacity: 0.95
                }
            });
        _3dmolViewer.render();
    }
}

function recolorStructureByDesign() {
    // 設計完成後自動顯示第 1 條（index 0）
    window._mpnnActiveIdx = 0;
    viewSeqIn3D(0);
}

function selectModel(btn, model) {
    document.querySelectorAll('.mpnn-model-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _currentModel = model;

    const descs = {
        'v_48_020': '邊緣數 48，偏差 0.2Å — 標準精確度模型（論文推薦）',
        'v_48_030': '邊緣數 48，偏差 0.3Å — 更高多樣性，適合靈活結構',
        'soluble': 'SolubleMPNN — 僅以可溶蛋白訓練，設計可溶性序列首選'
    }

        ;
    document.getElementById('modelDesc').textContent = descs[model];
}

function validMpnnSeq(s) {
    return s.length > 0 && /^[ACDEFGHIKLMNPQRSTVWY]+$/.test(s);
}

function updateMpnnSeqInfo() {
    const seq = document.getElementById('mpnnSeq').value.toUpperCase().replace(/\s/g, '');
    document.getElementById('mpnnLen').textContent = seq.length + ' 殘基';
    const v = document.getElementById('mpnnValid');

    if (!seq.length) {
        v.textContent = ''; v.className = '';
        const el = document.getElementById('seqPdbSuggest'); if (el) el.style.display = 'none';
    }

    else if (validMpnnSeq(seq)) {
        v.textContent = '✓ 有效序列'; v.className = 'mpnn-valid';
        _checkSeqPdbMatch(seq);
    }

    else {
        v.textContent = '✗ 含無效字元'; v.className = 'mpnn-invalid';
        const el = document.getElementById('seqPdbSuggest'); if (el) el.style.display = 'none';
    }
}

let _seqSearchTimer = null;

function _checkSeqPdbMatch(seq) {
    // ── ① 已知序列：直接自動載入 ──────────────────────────
    const fp = seq.substring(0, 15);
    const match = KNOWN_SEQ_MAP[fp];

    if (match) {
        if (window._loadedPdbId !== match.pdbId) {
            loadPdbById(match.pdbId);

            _showToast(`🔬 自動載入 ${match.name
                }

                        （${match.pdbId
                }

                        ）`);
        }

        const el = document.getElementById('seqPdbSuggest');
        if (el) el.style.display = 'none';
        return;
    }

    // ── ② 未知序列：RCSB 序列搜尋（防抖 800ms）────────────
    if (seq.length < 20) {
        const el = document.getElementById('seqPdbSuggest');
        if (el) el.style.display = 'none';
        return;
    }

    clearTimeout(_seqSearchTimer);
    _seqSearchTimer = setTimeout(() => _searchPdbBySeq(seq), 800);
}

async function _searchPdbBySeq(seq) {
    const el = document.getElementById('seqPdbSuggest');
    if (!el) return;
    el.style.display = 'flex';
    el.innerHTML = `⏳ 查詢序列資料庫快取…`;

    // ── ① 先查 DB 快取 ────────────────────────────────────────
    try {
        const apiBase = (typeof resolvePortfolioApiBase === 'function')
            ? await resolvePortfolioApiBase() : '';
        if (apiBase) {
            const dbResp = await fetch(
                `${apiBase}/api/sequences/search?q=${encodeURIComponent(seq.substring(0, 20))}&limit=3`,
                { signal: AbortSignal.timeout(4000) }
            );
            if (dbResp.ok) {
                const dbData = await dbResp.json();
                const dbHit = (dbData.hits || [])[0];
                if (dbHit && dbHit.sourceId) {
                    const pdbId = dbHit.sourceId.toUpperCase();
                    if (window._loadedPdbId !== pdbId) {
                        loadPdbById(pdbId);
                        _showToast(`🗄️ 從 DB 快取載入 ${dbHit.displayName || pdbId}（${pdbId}）`);
                    }
                    el.style.display = 'none';
                    return;
                }
            }
        }
    } catch (_) { /* DB 失敗直接 fallback RCSB */ }

    // ── ② DB 無結果 → RCSB 搜尋 ──────────────────────────────
    el.innerHTML = `⏳ 搜尋 RCSB 相似序列中…`;
    try {
        const resp = await fetch('https://search.rcsb.org/rcsbsearch/v2/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: {
                    type: 'terminal', service: 'sequence',
                    parameters: {
                        evalue_cutoff: 1, identity_cutoff: 0.5,
                        target: 'pdb_protein_sequence', value: seq
                    }
                },
                result_type: 'entry',
                request_options: { paginate: { start: 0, rows: 3 } }
            })
        });
        if (!resp.ok) throw new Error('search failed');
        const data = await resp.json();
        const hits = data.result_set || [];

        if (!hits.length) {
            el.innerHTML = `⚠️ 找不到相似的已知結構`;
            setTimeout(() => { el.style.display = 'none'; }, 3000);
            return;
        }

        const topPdb = hits[0].identifier;
        const identity = hits[0].services?.[0]?.nodes?.[0]?.match_context?.[0]?.sequence_identity;
        const idStr = identity ? `（相似度 ${(identity * 100).toFixed(0)}%）` : '';

        if (window._loadedPdbId === topPdb) { el.style.display = 'none'; return; }

        const _doLoadAndCache = async (pdbId) => {
            loadPdbById(pdbId);
            // ── ③ 存回 DB 快取 ─────────────────────────────────
            try {
                const apiBase = (typeof resolvePortfolioApiBase === 'function')
                    ? await resolvePortfolioApiBase() : '';
                if (apiBase) {
                    fetch(`${apiBase}/api/sequences/upsert-one`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            source_id: pdbId,
                            display_name: pdbId,
                            sequence: seq,
                            query_term: seq.substring(0, 20),
                            source_name: 'RCSB',
                            sequence_type: 'protein',
                            record_url: `https://www.rcsb.org/structure/${pdbId}`,
                            description: `RCSB search result${identity ? ', identity=' + (identity * 100).toFixed(1) + '%' : ''}`
                        })
                    }).catch(() => { });
                }
            } catch (_) { }
        };

        if (identity && identity >= 0.9) {
            await _doLoadAndCache(topPdb);
            el.style.display = 'none';
            _showToast(`🔬 自動載入最相似結構 ${topPdb} ${idStr}`);
        } else {
            el.innerHTML = `💡 最相似結構：<strong>${topPdb}</strong>${idStr} <button onclick="(async()=>{document.getElementById('seqPdbSuggest').style.display='none';loadPdbById('${topPdb}')})()">載入 ${topPdb} →</button>`;
        }
    } catch (e) {
        el.style.display = 'none';
    }
}

let _seqInputRaf = null;
const _mpnnSeqInput = document.getElementById('mpnnSeq');
if (_mpnnSeqInput) {
    _mpnnSeqInput.addEventListener('input', function () {
        if (_seqInputRaf) cancelAnimationFrame(_seqInputRaf);
        _seqInputRaf = requestAnimationFrame(updateMpnnSeqInfo);
    });
}

function parseMpnnFixed(str, len) {
    const fixed = new Set();
    if (!str.trim()) return fixed;

    str.split(',').forEach(p => {
        p = p.trim();

        if (p.includes('-')) {
            const [a, b] = p.split('-').map(Number);
            for (let i = a; i <= Math.min(b, len); i++) fixed.add(i - 1);
        }

        else {
            const n = Number(p); if (!isNaN(n) && n > 0) fixed.add(n - 1);
        }
    });
    return fixed;
}

// ── ESM-2 HuggingFace fill-mask engine ──────────────────────────────
// Uses facebook/esm2_t6_8M_UR50D (smallest, fastest ESM-2 variant).
// For each free residue position, masks that position and queries the
// fill-mask API to get real per-residue AA probability distributions.
// Results are temperature-sampled to produce design sequences.

const _ESM2_MODEL = 'facebook/esm2_t6_8M_UR50D';

// Returns profiles[i] = { AA: logProb } for each position i via the backend
// ESM-2 proxy (server holds HF_TOKEN). Visitors never see a token.
// Throws on any failure — caller decides whether to fall back to BLOSUM62.
async function computeESM2Profiles(seq, fixedSet, onProgress) {
    const freePos = [];
    for (let i = 0; i < seq.length; i++) { if (!fixedSet.has(i)) freePos.push(i); }
    const profiles = new Array(seq.length).fill(null);

    let apiBase = '';
    if (typeof resolvePortfolioApiBase === 'function') {
        try { apiBase = await resolvePortfolioApiBase(); } catch (e) { /* ignore */ }
    }
    if (!apiBase && typeof window.APP_CONFIG?.API_BASE_URL === 'string') {
        apiBase = window.APP_CONFIG.API_BASE_URL.trim().replace(/\/+$/, '');
    }
    if (!apiBase) throw new Error('後端 API base 未設定，無法呼叫 ESM-2 代理。');

    onProgress(0, `ESM-2 → 後端 proxy（${_ESM2_MODEL}）批次評分中...`);
    const resp = await fetch(`${apiBase}/api/esm2/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence: seq, positions: freePos })
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        if (resp.status === 503) throw new Error('ESM-2 模型正在冷啟動或後端未設定 HF_TOKEN（503）。');
        throw new Error(err.detail || `ESM-2 proxy HTTP ${resp.status}`);
    }
    const data = await resp.json();
    for (const [posStr, dist] of Object.entries(data.profiles || {})) {
        profiles[parseInt(posStr, 10)] = dist;
    }
    onProgress(1, `後端 ESM-2 評分完成（${Object.keys(data.profiles || {}).length} 個位置）`);
    return profiles;
}

function designOneSeqESM(seq, fixedSet, temp, profiles) {
    let designed = '';
    const ll = [];
    for (let i = 0; i < seq.length; i++) {
        const aa = seq[i];
        if (fixedSet.has(i) || !profiles[i]) {
            designed += aa;
            ll.push(-0.08);
            continue;
        }
        const logits = MPNN_AA.split('').map((a) => profiles[i][a] / temp);
        const { idx, prob } = softmaxSample(logits);
        designed += MPNN_AA[idx];
        ll.push(Math.log(Math.max(prob, 1e-10)));
    }
    const identity = seq.split('').filter((c, i) => c === designed[i]).length / seq.length;
    return { seq: designed, identity, score: ll.reduce((a, b) => a + b, 0) / ll.length, ll };
}

function softmaxSample(logits) {
    // 用 reduce 取代 spread 對 Math.max，避免長序列 stack overflow
    const mx = logits.reduce((a, b) => a > b ? a : b);
    const exps = logits.map(l => Math.exp(l - mx));
    const sum = exps.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum, cum = 0;

    for (let i = 0; i < exps.length; i++) {
        cum += exps[i];

        if (r <= cum) return {
            idx: i, prob: exps[i] / sum
        }

            ;
    }

    return {
        idx: exps.length - 1, prob: exps[exps.length - 1] / sum
    }

        ;
}

function designOneSeq(seq, fixedSet, temp, modelNoise) {
    let designed = '';
    const ll = [];

    for (let i = 0; i < seq.length; i++) {
        const aa = seq[i];

        if (fixedSet.has(i)) {
            designed += aa; ll.push(-0.08); continue;
        }

        const row = BLM[aa] || BLM['A'];
        const t = Math.max(temp + modelNoise * (Math.random() * 2 - 1), 0.05);
        const logits = row.map(s => s / t);

        const {
            idx, prob
        }

            = softmaxSample(logits);
        designed += MPNN_AA[idx];
        ll.push(Math.log(prob + 1e-10));
    }

    const identity = seq.split('').filter((c, i) => c === designed[i]).length / seq.length;

    return {
        seq: designed, identity, score: ll.reduce((a, b) => a + b, 0) / ll.length, ll
    }

        ;
}

function appendMpnnLog(html) {
    const el = document.getElementById('mpnnLog');

    if (el) {
        el.innerHTML += `<div>${html
            }

                </div>`; el.scrollTop = el.scrollHeight;
    }
}

async function runMPNN() {
    const raw = document.getElementById('mpnnSeq').value.toUpperCase().replace(/\s/g, '');

    if (!validMpnnSeq(raw)) {
        alert('請輸入有效的蛋白質序列（20 種標準胺基酸單字母代碼）'); return;
    }

    const seq = raw;
    const numSeq = parseInt(document.getElementById('mpnnNumSeq').value);
    const temp = parseFloat(document.getElementById('mpnnTemp').value);
    const fixedSet = parseMpnnFixed(document.getElementById('mpnnFixed').value, seq.length);

    const noiseMap = {
        'v_48_020': 0.02, 'v_48_030': 0.05, 'soluble': 0.015
    }

        ;
    const noise = noiseMap[_currentModel] || 0.02;

    // 切換到進度 UI
    document.getElementById('mpnnPlaceholder').style.display = 'none';
    document.getElementById('mpnnResults').style.display = 'none';
    document.getElementById('mpnnResiduePanel').style.display = 'none';
    document.getElementById('mpnnProgress').style.display = 'block';
    document.getElementById('mpnnLog').innerHTML = '';
    document.getElementById('mpnnRunBtn').disabled = true;
    document.getElementById('mpnnBtnText').textContent = '運算中…';

    let results;
    // ── ESM-2 path (always real, via backend proxy) ──
    appendMpnnLog(`<span style="color:var(--teal)">[ESM-2]</span> 透過後端代理呼叫 ${_ESM2_MODEL} 進行真實機率評分...`);
    appendMpnnLog(`<span style="color:var(--teal)">[ESM-2]</span> 序列長度 ${seq.length} 殘基，需查詢 ${seq.length - fixedSet.size} 個自由位置`);
    try {
        const profiles = await computeESM2Profiles(seq, fixedSet, (pct, msg) => {
            const pctInt = Math.round(10 + pct * 80);
            document.getElementById('mpnnProgressFill').style.width = pctInt + '%';
            document.getElementById('mpnnProgressLabel').textContent = msg;
            appendMpnnLog(`<span style="color:var(--teal)">[ESM-2]</span> ${msg}`);
        });
        document.getElementById('mpnnProgressFill').style.width = '92%';
        document.getElementById('mpnnProgressLabel').textContent = `ESM-2 掃描完成，溫度 T=${temp.toFixed(2)} 取樣 ${numSeq} 條序列...`;
        appendMpnnLog(`<span style="color:var(--teal)">[ESM-2]</span> 所有位置機率分佈就緒，開始取樣...`);
        await new Promise((r) => setTimeout(r, 200));
        results = Array.from({ length: numSeq }, () => designOneSeqESM(seq, fixedSet, temp, profiles));
    } catch (esmErr) {
        appendMpnnLog(`<span style="color:#f85149">[ESM-2 ERROR]</span> ${esmErr.message} — 後端暫時不可用，暫時退回 BLOSUM62 模擬`);
        results = Array.from({ length: numSeq }, () => designOneSeq(seq, fixedSet, temp, noise));
    }

    results.sort((a, b) => b.score - a.score);

    // 顯示結果
    document.getElementById('mpnnProgress').style.display = 'none';
    document.getElementById('mpnnResults').style.display = 'block';

    const avgId = results.reduce((s, r) => s + r.identity, 0) / results.length;

    document.getElementById('statSeqs').textContent = `${numSeq
        }

        條設計序列`;

    document.getElementById('statAvgId').textContent = `平均相似度 ${(avgId * 100).toFixed(1)
        }

        %`;

    document.getElementById('statBestScore').textContent = `最佳 ll ${results[0].score.toFixed(3)
        }

        `;

    document.getElementById('statTemp').textContent = `溫度 T=${temp.toFixed(2)
        }

        `;

    const tbody = document.getElementById('mpnnTableBody');
    tbody.innerHTML = '';
    const frag = document.createDocumentFragment();

    results.forEach((r, i) => {
        const idPct = (r.identity * 100).toFixed(1);
        const rankCls = ['rank-1', 'rank-2', 'rank-3'][i] || '';
        const idClr = r.identity > 0.7 ? '#3fb950' : r.identity > 0.4 ? '#f0883e' : '#f85149';
        const tr = document.createElement('tr');

        tr.innerHTML = ` <td><span class="mpnn-badge-rank ${rankCls}" >${i + 1}</span></td> <td><div class="mpnn-seq-cell" title="${r.seq}" >${r.seq}</div></td> <td><div class="mpnn-id-bar" > <div class="mpnn-id-fill" style="width:${Math.round(r.identity * 80)}px;background:${idClr}" ></div> <span class="mpnn-id-text" style="color:${idClr}" >${idPct}%</span> </div></td> <td><span class="mpnn-score-cell" style="color:var(--purple)" >${r.score.toFixed(4)}</span></td> <td><button class="expand-btn view3d-btn" id="view3dBtn-${i}" onclick="viewSeqIn3D(${i})" title="突變著色（需先載入PDB）">🔬</button> <button class="expand-btn" onclick="loadSeqWithEsmFold(window._mpnnResults[${i}].seq)" title="ESMFold 結構預測" style="font-size:.75rem;padding:2px 7px;opacity:.85">🧬 折疊</button></td> <td><button class="expand-btn" onclick="showMpnnResidue(${i})" >詳情</button></td>`;
        frag.appendChild(tr);
    });
    tbody.appendChild(frag);

    window._mpnnResults = results;
    window._mpnnInputSeq = seq;
    window._mpnnFixedSet = fixedSet;
    recolorStructureByDesign();
    document.getElementById('mpnnRunBtn').disabled = false;
    document.getElementById('mpnnBtnText').textContent = '▶ 重新設計';
}

function showMpnnResidue(idx) {
    const results = window._mpnnResults;
    const inputSeq = window._mpnnInputSeq || '';
    const fixedSet = window._mpnnFixedSet || new Set();
    if (!results || !results[idx]) return;
    // 同步 3D 視圖顯示此序列
    viewSeqIn3D(idx);
    const r = results[idx];

    document.getElementById('residuePanelInfo').textContent = `設計序列 #${idx + 1
        }

            相似度 ${(r.identity * 100).toFixed(1)
        }

            % score ${r.score.toFixed(4)
        }

            `;

    const seqFrag = document.createDocumentFragment();
    r.seq.split('').forEach((aa, i) => {
        const prop = AA_PROP[aa] || 'special';
        const isFixed = fixedSet.has(i);
        const changed = aa !== (inputSeq[i] || '').toUpperCase();

        const title = `${aa
            }

                    (${MPNN_NAMES[aa] || aa

            }) 位置${i + 1
            }

                    ${isFixed ? ' [固定]' : changed ? ' [突變]' : ''
            }

                    `;

        const sp = document.createElement('span');
        sp.className = `aa-chip ${PROP_CSS[prop]}${isFixed ? ' fixed' : ''}`;
        sp.title = title;
        sp.textContent = aa;
        seqFrag.appendChild(sp);
    });
    const seqDisplay = document.getElementById('residueSeqDisplay');
    seqDisplay.innerHTML = '';
    seqDisplay.appendChild(seqFrag);

    // 用 reduce 取代 spread，防止超長序列 stack overflow
    const minLL = r.ll.reduce((a, b) => a < b ? a : b);
    const maxLL = r.ll.reduce((a, b) => a > b ? a : b);

    const heatFrag = document.createDocumentFragment();
    r.ll.forEach((ll, i) => {
        const norm = (ll - minLL) / (maxLL - minLL + 1e-8);
        const rC = Math.round(248 * (1 - norm));
        const gC = Math.round(185 * norm);

        const bg = `rgb(${rC
            }

                        , ${gC
            }

                        , 50)`;

        const hc = document.createElement('div');
        hc.className = 'heat-cell';
        hc.style.background = bg;
        hc.title = `位置 ${i + 1} (${r.seq[i]}): ll=${ll.toFixed(3)}`;
        hc.textContent = r.seq[i];
        heatFrag.appendChild(hc);
    });
    const heatmap = document.getElementById('residueHeatmap');
    heatmap.innerHTML = '';
    heatmap.appendChild(heatFrag);

    document.getElementById('mpnnResiduePanel').style.display = 'block';
}

// ─── REF2015 + 疏水性查表（Rosetta 評分用）──────────────────────────
const REF2015_SCORE = {
    A: -0.358, C: 2.059, D: -1.368, E: -2.038, F: 0.800,
    G: 0.000, H: 0.652, I: 0.430, K: -2.138, L: 0.430,
    M: 0.431, N: -1.194, P: -1.176, Q: -1.636, R: -1.474,
    S: -0.793, T: -0.777, V: 0.430, W: 2.143, Y: 1.200
}

    ;

const HYDRO_KD = {
    A: 1.8, C: 2.5, D: -3.5, E: -3.5, F: 2.8, G: -0.4,
    H: -3.2, I: 4.5, K: -3.9, L: 3.8, M: 1.9, N: -3.5,
    P: -1.6, Q: -3.5, R: -4.5, S: -0.8, T: -0.7, V: 4.2,
    W: -0.9, Y: -1.3
}

    ;

// 著色切換：突變著色 ↔ Spectrum（每次點擊都有明顯效果）
function toggleDesignColor(btn) {
    if (!_3dmolViewer) {
        alert('請先載入 PDB 結構'); return;
    }

    if (!window._mpnnResults) {
        alert('請先執行「設計序列」'); return;
    }

    const infoEl = document.getElementById('mpnnStructInfo');

    if (_3dColorMode === 'design') {
        // 切換回 Spectrum
        _3dColorMode = 'spectrum'; _structStyle = 'cartoon';
        _3dmolViewer.removeAllShapes();

        _3dmolViewer.setStyle({}

            , {
                cartoon: {
                    color: 'spectrum', opacity: 0.95
                }
            });
        _3dmolViewer.render();
        btn.innerHTML = '🎨 突變著色';
        btn.style.borderColor = '#3fb950';
        btn.style.color = '#3fb950';
        btn.style.background = 'linear-gradient(135deg,#0d1f0d,#1a3a1a)';
        // 移除設計圖例
        infoEl.querySelector('.design-legend')?.remove();
        _showToast('已切換至 Spectrum 著色');
    }

    else {
        // 套用突變著色
        _3dColorMode = 'design'; _structStyle = 'cartoon';
        applyDesignColoring();
        btn.innerHTML = '🌈 還原 Spectrum';
        btn.style.borderColor = '#f0883e';
        btn.style.color = '#f0883e';
        btn.style.background = 'linear-gradient(135deg,#1f1008,#3a1f08)';
        // 更新圖例
        let legend = infoEl.querySelector('.design-legend');

        if (!legend) {
            legend = document.createElement('div'); legend.className = 'design-legend'; infoEl.appendChild(legend);
        }

        const nMut = window._mpnnResults[0].seq.split('').filter((c, i) => c !== (window._mpnnInputSeq || '')[i]).length;
        legend.style.cssText = 'display:flex;gap:12px;align-items:center;margin-top:8px;font-size:.72rem;width:100%;flex-wrap:wrap;padding-top:8px;border-top:1px solid var(--border)';

        legend.innerHTML = `<span style="color:var(--muted);font-weight:600" >突變著色：</span> <span><span style="color:#f0883e;margin-right:3px" >■</span>突變殘基 (${nMut
            })</span> <span><span style="color:#39d0f0;margin-right:3px" >■</span>不變殘基</span> <span><span style="color:#484f58;margin-right:3px" >■</span>固定位置</span>`;

        _showToast(`✓ 突變著色套用 · ${nMut
            }

                個突變殘基`);
    }
}

function _showToast(msg) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:9px 18px;background:#21262d;border:1px solid var(--border);color:var(--fg);border-radius:8px;font-size:.8rem;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.5);transition:opacity .4s';
    t.textContent = msg;
    document.body.appendChild(t);

    setTimeout(() => {
        t.style.opacity = '0'; setTimeout(() => t.remove(), 400);
    }

        , 2000);
}

// _esmFallbackTemplate 保留給 recolorStructureByDesign 呼叫（不再暴露給按鈕）
function _esmFallbackTemplate() {
    toggleDesignColor(document.getElementById('esmFoldBtn'));
}

// ─── Rosetta 簡化能量評分（REF2015-like）────────────────────────────
function showRosettaScore() {
    const results = window._mpnnResults;
    const inputSeq = window._mpnnInputSeq || '';

    if (!results?.length) {
        alert('請先執行「設計序列」'); return;
    }

    const panel = document.getElementById('rosettaPanel');
    const content = document.getElementById('rosettaContent');
    panel.style.display = 'block';

    panel.scrollIntoView({
        behavior: 'smooth', block: 'nearest'
    });

    const wtScore = _rosettaScore(inputSeq);
    const topScore = _rosettaScore(results[0].seq);
    const dTotal = (parseFloat(topScore.total) - parseFloat(wtScore.total)).toFixed(2);
    const dClr = parseFloat(dTotal) < 0 ? '#3fb950' : '#f85149';

    const badge = (lbl, val, c) => `<span style="padding:4px 12px;border-radius:20px;background:color-mix(in srgb,${c} 12%,transparent);border:1px solid color-mix(in srgb,${c} 35%,transparent);color:${c};font-family:var(--mono);font-size:.8rem" >${lbl
        }

        : ${val
        }

        </span>`;

    const diff = (a, b) => {
        const d = parseFloat(b) - parseFloat(a); return `<span style="color:${d < 0 ? '#3fb950' : '#f85149'}" >${(d >= 0 ? '+' : '') + d.toFixed(2)
            }

            </span>`;
    }

        ;

    const cell = (txt, right, extra) => `<td style="padding:6px 10px;${right ? 'text-align:right;' : ''}font-family:var(--mono);font-size:.8rem;${extra || ''}" >${txt
        }

        </td>`;

    const row = (label, wt, top) => ` <tr style="border-bottom:1px solid var(--border)" > <td style="padding:6px 10px;font-size:.8rem;color:var(--muted)" >${label
        }

        </td> ${cell(wt, true, 'color:var(--fg)')
        }

        ${cell(top, true, 'color:var(--teal)')
        }

        ${cell(diff(wt, top), true)
        }

        </tr>`;

    content.innerHTML = ` <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px" > ${badge('野生型 REU', wtScore.total, '#7d8590')
        }

        ${badge('設計序列 #1', topScore.total, '#39d0f0')
        }

        ${badge('Δ total', (parseFloat(dTotal) >= 0 ? '+' : '') + dTotal, dClr)
        }

        </div> <table style="width:100%;border-collapse:collapse;border:1px solid var(--border);border-radius:8px;overflow:hidden" > <thead> <tr style="background:var(--surface);border-bottom:1px solid var(--border)" > <th style="padding:7px 10px;text-align:left;font-size:.75rem;color:var(--muted);font-weight:600" >能量項</th> <th style="padding:7px 10px;text-align:right;font-size:.75rem;color:var(--muted);font-weight:600" >野生型</th> <th style="padding:7px 10px;text-align:right;font-size:.75rem;color:var(--teal);font-weight:600" >設計序列 #1</th> <th style="padding:7px 10px;text-align:right;font-size:.75rem;color:var(--muted);font-weight:600" >Δ</th> </tr> </thead> <tbody> ${row('ref（殘基傾向）', wtScore.ref, topScore.ref)
        }

        ${row('fa_sol（疏水溶解）', wtScore.faSol, topScore.faSol)
        }

        ${row('hbond（氫鍵估算）', wtScore.hbond, topScore.hbond)
        }

        <tr><td style="padding:6px 10px;font-size:.8rem;font-weight:700;color:var(--fg)" >total</td> ${cell(wtScore.total, true, 'color:var(--fg);font-weight:700')
        }

        ${cell(topScore.total, true, 'color:var(--teal);font-weight:700')
        }

        ${cell(diff(wtScore.total, topScore.total), true)
        }

        </tr> </tbody> </table>`;
}

function _rosettaScore(seq) {
    let ref = 0, faSol = 0, hbond = 0;

    for (const aa of seq) {
        ref += REF2015_SCORE[aa] ?? 0;
        const h = HYDRO_KD[aa] ?? 0;
        if (h > 0) faSol -= h * 0.15;
    }

    const DONOR = new Set(['D', 'E', 'N', 'Q', 'S', 'T', 'Y', 'H']);
    const ACCEPTOR = new Set(['K', 'R', 'H']);
    for (let i = 0; i < seq.length - 4; i++) for (let j = i + 4; j < Math.min(i + 10, seq.length); j++) if ((DONOR.has(seq[i]) && ACCEPTOR.has(seq[j])) || (DONOR.has(seq[j]) && ACCEPTOR.has(seq[i]))) hbond -= 0.5;
    hbond = Math.max(hbond, -10);

    return {
        ref: ref.toFixed(2), faSol: faSol.toFixed(2), hbond: hbond.toFixed(2), total: (ref + faSol + hbond).toFixed(2)
    }

        ;
}

// 頁面載入後等 3Dmol.js 確認可用再預載 HP35
function _waitAndLoadHP35(tries) {
    if (!document.getElementById('mpnnSeq') || !document.getElementById('mpnnStruct3d')) {
        return;
    }

    if (typeof $3Dmol !== 'undefined') {
        loadPdbById('1VII');
    }

    else if (tries > 0) {
        setTimeout(() => _waitAndLoadHP35(tries - 1), 400);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('mpnnSeq')) {
        return;
    }

    if (typeof window.load3Dmol === 'function') {
        window.load3Dmol(function (err) {
            if (!err) {
                _waitAndLoadHP35(10);
            }
        });
        return;
    }

    _waitAndLoadHP35(10);
});
