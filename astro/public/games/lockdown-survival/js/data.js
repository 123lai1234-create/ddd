/* =====================================================================
 * 禁閉逃殺 Lockdown Survival — 靜態資料層
 * 房間 / 物品 / 連接 / 地圖座標 / 成就 / 機器人政策
 * ---------------------------------------------------------------------
 * 規則原型參考 https://lockdown-survival.ksever.com/
 * 本檔為純資料，不含任何網路請求。
 * ===================================================================== */
(function (global) {
    'use strict';

    const LS = (global.LS = global.LS || {});

    /* ── 樓層順序（由上到下）──────────────────────────────────────── */
    LS.FLOOR_ORDER = ['2F', '1F', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'];

    /* ── 樓層分組（畫地圖用；B501 橫跨 B4+B5）─────────────────────── */
    LS.FLOOR_BANDS = [
        { id: '2F', label: '2F', y: 44, h: 70 },
        { id: '1F', label: '1F', y: 129, h: 70 },
        { id: 'B1', label: 'B1', y: 201, h: 70 },
        { id: 'B2', label: 'B2', y: 273, h: 70 },
        { id: 'B3', label: 'B3', y: 347, h: 70 },
        { id: 'B4B5', label: 'B4 / B5', y: 419, h: 141 },
        { id: 'B6', label: 'B6', y: 562, h: 70 },
        { id: 'B7', label: 'B7', y: 633, h: 70 },
    ];

    /* ── 道具 ────────────────────────────────────────────────────── */
    // category: consumable(消耗品) / equipment(裝備) / other(其他)
    // usableInResolution: 是否能在「道具卡使用」結算步驟主動使用
    LS.ITEMS = {
        water: { id: 'water', name: '水', category: 'consumable', attackBonus: 0, isFirearm: false, usableInResolution: false },
        food: { id: 'food', name: '糧食', category: 'consumable', attackBonus: 0, isFirearm: false, usableInResolution: false },
        survival_kit: { id: 'survival_kit', name: '生存補給', category: 'consumable', attackBonus: 0, isFirearm: false, usableInResolution: false },
        pill: { id: 'pill', name: '藥片', category: 'consumable', attackBonus: 0, isFirearm: false, usableInResolution: true },
        adrenaline: { id: 'adrenaline', name: '腎上腺素', category: 'consumable', attackBonus: 0, isFirearm: false, usableInResolution: true },
        wine: { id: 'wine', name: '酒', category: 'consumable', attackBonus: 0, isFirearm: false, usableInResolution: true },
        fine_wine: { id: 'fine_wine', name: '美酒', category: 'consumable', attackBonus: 0, isFirearm: false, usableInResolution: true },
        gold_bar: { id: 'gold_bar', name: '金條', category: 'consumable', attackBonus: 0, isFirearm: false, usableInResolution: false },
        knife: { id: 'knife', name: '刀', category: 'equipment', attackBonus: 2, isFirearm: false, usableInResolution: false },
        pistol: { id: 'pistol', name: '手槍', category: 'equipment', attackBonus: 2, isFirearm: true, usableInResolution: false },
        shotgun: { id: 'shotgun', name: '霰彈槍', category: 'equipment', attackBonus: 4, isFirearm: true, usableInResolution: false },
        bayonet: { id: 'bayonet', name: '軍用刺刀', category: 'equipment', attackBonus: 4, isFirearm: false, usableInResolution: false },
        rope: { id: 'rope', name: '繩索', category: 'equipment', attackBonus: 0, isFirearm: false, usableInResolution: false },
        gas_mask: { id: 'gas_mask', name: '防毒面具', category: 'equipment', attackBonus: 0, isFirearm: false, usableInResolution: false },
        rocket_launcher: { id: 'rocket_launcher', name: '火箭筒', category: 'equipment', attackBonus: 0, isFirearm: false, usableInResolution: false },
        dimension_pocket: { id: 'dimension_pocket', name: '次元口袋', category: 'equipment', attackBonus: 0, isFirearm: false, usableInResolution: false },
        recycler: { id: 'recycler', name: '循環回收裝置', category: 'equipment', attackBonus: 0, isFirearm: false, usableInResolution: false },
        junk: { id: 'junk', name: '垃圾', category: 'other', attackBonus: 0, isFirearm: false, usableInResolution: false },
    };

    LS.ITEM_HELP = {
        water: '抵銷脫水的 1 點生命損失。不能替代糧食。',
        food: '抵銷飢餓的 1 點生命損失。不能替代水。',
        survival_kit: '等同一個水加一個糧食。',
        pill: '回復 2 點生命，不超過上限。',
        adrenaline: '速度提升為 10；狀態期間任何傷害都讓你的生命值保底 1 點、不會變暗影。持續到下一次結算結束，只保護使用之後發生的傷害。',
        wine: '擲一次骰：1 = 所有道具丟失（進棄置堆，不可回收）、2 = 無事發生、3 = 武力永久 +1、4 = 速度永久 +1、5 = 負重永久 +1、6 = 生命 +2。',
        fine_wine: '效果同酒，但 3~6 的數值加倍（武力／速度／負重 +2、生命 +4）；擲出 1、2 與酒相同。',
        gold_bar: '花 1 張直接攤開這個地點的物資自己挑一項（不能挑金條；只剩金條就空手而歸）。次數不限，也不佔用抽取次數。跑完 6 回合結束時，身上每張折算 +1 生命（不超過上限 10）。',
        knife: '武力 +2。',
        pistol: '武力 +2。槍械：在場有人持槍時，沒持槍的人攻擊力視為 0。',
        shotgun: '武力 +4。槍械：在場有人持槍時，沒持槍的人攻擊力視為 0。',
        bayonet: '武力 +4。不是槍械。',
        rope: '上下樓層不需要爬梯，可以走沒有梯子的垂直通道。',
        gas_mask: '不受毒氣傷害。',
        rocket_launcher: '行動階段選一個房間，結算步驟 5 對該房停留的每位存活玩家造成 4 點傷害（暗影不受影響）。不是消耗品，可以重複使用；結算時要還持有才會發射。',
        dimension_pocket: '只要還有至少 1 點負重額度，就能無限攜帶物資不會超重。道具本身佔 1 點負重。',
        recycler: '行動階段可從待回收堆（被用掉的道具）隨機抽一張，每回合一次。棄置堆的東西抽不到。',
        junk: '沒有任何效果，純佔負重。',
    };

    /* ── 房間 ────────────────────────────────────────────────────── */
    // special: 特殊房間功能 id；resourcePool: 初始物資池；drawLimit: 停留後最多抽幾張
    // spawn: 出生點；helipad: 可用停機坪飛行抵達；gasImmune: 永久免疫毒氣
    // laser: 經過或停留受 1 點傷害；goldBarDisabled: 不能在此使用金條
    // maxNonJunkPickup: 非垃圾最多保留幾件（垃圾場）
    const R = (o) => Object.assign({
        name: '(空房)', special: null, resourcePool: null, drawLimit: 0,
        goldBarDisabled: false, maxNonJunkPickup: null,
        spawn: false, helipad: false, gasImmune: false, laser: false,
    }, o);

    LS.ROOMS = [
        /* 2F */
        R({ id: '201', name: '基因庫', floors: ['2F'], special: 'gene_bank', helipad: true }),
        R({ id: '202', name: '停機坪', floors: ['2F'], special: 'helipad', gasImmune: true, resourcePool: [], drawLimit: 'all' }),
        /* 1F */
        R({ id: '101', name: '水塔', floors: ['1F'], helipad: true, resourcePool: [{ itemId: 'water', quantity: 10 }], drawLimit: 4 }),
        R({ id: '102', name: '激光室', floors: ['1F'], laser: true }),
        R({ id: '103', floors: ['1F'], spawn: true }),
        R({ id: '104', floors: ['1F'] }),
        /* B1 */
        R({ id: 'B101', name: '控制室', floors: ['B1'], special: 'control_room', helipad: true }),
        R({ id: 'B102', floors: ['B1'] }),
        R({ id: 'B103', floors: ['B1'], spawn: true, helipad: true }),
        R({ id: 'B104', floors: ['B1'] }),
        R({ id: 'B105', name: '回收站', floors: ['B1'], helipad: true }),
        R({ id: 'B106', floors: ['B1'] }),
        R({ id: 'B107', name: '武器庫', floors: ['B1'], resourcePool: [{ itemId: 'knife', quantity: 5 }, { itemId: 'pistol', quantity: 2 }, { itemId: 'shotgun', quantity: 1 }], drawLimit: 2 }),
        /* B2 */
        R({ id: 'B201', floors: ['B2'] }),
        R({ id: 'B202', name: '手術室', floors: ['B2'], special: 'operating_room' }),
        R({ id: 'B203', floors: ['B2'] }),
        R({ id: 'B204', name: '餐廳', floors: ['B2'], special: 'dining_hall' }),
        R({ id: 'B205', floors: ['B2'] }),
        R({ id: 'B206', name: '金庫', floors: ['B2'], resourcePool: [{ itemId: 'gold_bar', quantity: 4 }], drawLimit: 2 }),
        /* B3 */
        R({ id: 'B301', name: '藥房', floors: ['B3'], resourcePool: [{ itemId: 'pill', quantity: 3 }, { itemId: 'adrenaline', quantity: 3 }], drawLimit: 2 }),
        R({ id: 'B302', floors: ['B3'] }),
        R({ id: 'B303', floors: ['B3'], spawn: true }),
        R({ id: 'B304', name: '操作室', floors: ['B3'], special: 'console_room' }),
        R({ id: 'B305', floors: ['B3'] }),
        R({ id: 'B306', floors: ['B3'] }),
        R({ id: 'B307', floors: ['B3'], spawn: true }),
        R({ id: 'B308', floors: ['B3'] }),
        /* B4 */
        R({ id: 'B401', floors: ['B4'] }),
        R({ id: 'B402', floors: ['B4'], spawn: true }),
        R({ id: 'B403', name: '傳送室', floors: ['B4'], special: 'teleport_room' }),
        R({ id: 'B404', floors: ['B4'] }),
        R({ id: 'B405', floors: ['B4'] }),
        /* B5 */
        R({ id: 'B501', name: '大倉庫', floors: ['B4', 'B5'], resourcePool: [{ itemId: 'water', quantity: 5 }, { itemId: 'food', quantity: 5 }, { itemId: 'knife', quantity: 3 }, { itemId: 'wine', quantity: 2 }, { itemId: 'gold_bar', quantity: 1 }, { itemId: 'pill', quantity: 2 }, { itemId: 'adrenaline', quantity: 2 }, { itemId: 'pistol', quantity: 1 }, { itemId: 'shotgun', quantity: 1 }], drawLimit: 3 }),
        R({ id: 'B502', floors: ['B5'] }),
        R({ id: 'B503', name: '垃圾場', floors: ['B5'], resourcePool: [{ itemId: 'junk', quantity: 20 }, { itemId: 'gas_mask', quantity: 1 }, { itemId: 'recycler', quantity: 1 }, { itemId: 'rocket_launcher', quantity: 1 }, { itemId: 'dimension_pocket', quantity: 1 }, { itemId: 'rope', quantity: 1 }], drawLimit: 5, goldBarDisabled: true, maxNonJunkPickup: 2 }),
        R({ id: 'B504', floors: ['B5'] }),
        R({ id: 'B505', name: '糧倉', floors: ['B5'], resourcePool: [{ itemId: 'food', quantity: 10 }], drawLimit: 4 }),
        /* B6 */
        R({ id: 'B601', name: '酒窖', floors: ['B6'], resourcePool: [{ itemId: 'wine', quantity: 6 }], drawLimit: 2 }),
        R({ id: 'B602', floors: ['B6'] }),
        R({ id: 'B603', floors: ['B6'], spawn: true }),
        R({ id: 'B604', floors: ['B6'] }),
        /* B7 */
        R({ id: 'B701', name: '停屍間', floors: ['B7'], special: 'morgue', resourcePool: [], drawLimit: 3 }),
    ];

    LS.ROOM_MAP = new Map(LS.ROOMS.map((r) => [r.id, r]));
    LS.ROOM_HELP = {
        '201': '停留後武力、負重、速度各永久 +1，並可查看所有玩家目前的基因面板。',
        '202': '每回合空投一張道具卡並累積在這裡，停留時攤開選取、最多帶走 1 張。停留後，下回合移動的第一步可直接飛到 H 標記的房間。戶外，不受毒氣影響。',
        '101': '水 ×10。停留後最多抽 4 張。',
        '102': '經過或停留受 1 點傷害。',
        B101: '停留者二選一：① 自己這回合的毒氣票以 10 票計算（可在這裡改投哪一層）；② 讓一個目前有毒的房間永久解毒。解毒是隱藏資訊，只有你和主持人知道；同一個房間你不能解第二次。',
        B105: '經過這裡可以一步移動到垃圾場。',
        B107: '刀 ×5、手槍 ×2、霰彈槍 ×1。停留後最多抽 2 張。',
        B202: '剛好 2 人停留：兩人各 +4 生命，而且該回合這間房不結算戰鬥。3 人以上：沒有手術，照常亂鬥。1 人：無事發生。',
        B204: '停留後，本回合結算的脫水與飢餓共 2 點生命不會扣。',
        B206: '金條 ×4。停留後最多抽 2 張。金條只能靠抽取取得——攤開挑選時金條不可選。',
        B301: '藥片 ×3、腎上腺素 ×3。停留後最多抽 2 張。',
        B304: '停留後可重新分配基因面板，總點數等於你目前的總和（不會變多）。按「完成本回合行動」才定案。',
        B403: '經過或停留可以一步傳送到任意空房（沒有特殊功能的房間）。',
        B501: '水 ×5、糧食 ×5、刀 ×3、酒 ×2、金條 ×1、藥片 ×2、腎上腺素 ×2、手槍 ×1、霰彈槍 ×1。停留後最多抽 3 張。橫跨 B4 與 B5，兩層都下毒才會有毒氣；與 B401 之間不相通。',
        B503: '垃圾 ×20 與 6 件裝備。停留後翻開 5 張：翻到的垃圾強制帶走（回合結束前可以丟回），非垃圾最多留 2 件。這裡不能使用金條。',
        B505: '糧食 ×10。停留後最多抽 4 張。',
        B601: '酒 ×6。停留後最多抽 2 張。',
        B701: '生命值歸 0 的玩家在這裡成為暗影，身上的道具全部留在這間房的資源池。停留後最多抽 3 張。',
    };

    /* ── 房間標籤（地圖上直接顯示）────────────────────────────────── */
    LS.ROOM_TAGS = {
        '201': '三項能力 +1', '202': '空投物資、飛行移動', '101': '水', B101: '毒氣票 ×10 或解毒',
        B105: '一步到垃圾場', B107: '武器', B202: '剛好兩人停留則手術成功，各 +4 生命',
        B204: '這天免繳水糧', B206: '金條', B301: '藥片、腎上腺素', B304: '重配能力',
        B403: '傳送到空房', B501: '大雜貨', B503: '翻牌找神器', B505: '糧食', B601: '酒',
        B701: '暗影誕生',
    };

    /* ── 連接 ────────────────────────────────────────────────────── */
    // type 'walk' = 一般通道；type 'climb' = 需要繩索或已是暗影才能走的垂直通道
    // type 'link' = 特殊直達（回收站 → 垃圾場）
    const link = (a, b, type) => ({ from: a, to: b, type: type || 'walk' });
    const chain = (ids, type) => {
        const out = [];
        for (let i = 0; i < ids.length - 1; i++) {
            out.push(link(ids[i], ids[i + 1], type));
            out.push(link(ids[i + 1], ids[i], type));
        }
        return out;
    };

    LS.EDGES = [].concat(
        chain(['103', '104']),
        chain(['B101', 'B102', 'B103', 'B104', 'B105', 'B106', 'B107']),
        chain(['B201', 'B202', 'B203', 'B204', 'B205']),
        chain(['B301', 'B302', 'B303', 'B304', 'B305', 'B306', 'B307', 'B308']),
        chain(['B401', 'B402']),
        chain(['B403', 'B404', 'B405']),
        chain(['B501', 'B502', 'B503']),
        chain(['B504', 'B505']),
        chain(['B601', 'B602', 'B603', 'B604']),
        chain(['101', 'B102']),
        chain(['B102', 'B201']),
        chain(['B501', 'B601']),
        chain(['201', '102']),
        chain(['102', 'B104']),
        chain(['B105', 'B205']),
        chain(['B204', 'B305']),
        chain(['B304', 'B401']),
        chain(['B402', 'B503']),
        chain(['B602', 'B701']),
        chain(['202', '104']),
        chain(['103', 'B106']),
        chain(['B106', 'B206']),
        chain(['B206', 'B308']),
        chain(['B307', 'B404']),
        chain(['B405', 'B505']),
        chain(['B504', 'B604']),
        // 需要繩索或暗影的垂直通道
        chain(['B101', 'B201'], 'climb'),
        chain(['B103', 'B202'], 'climb'),
        chain(['B201', 'B301'], 'climb'),
        chain(['B201', 'B302'], 'climb'),
        chain(['B202', 'B303'], 'climb'),
        chain(['B301', 'B501'], 'climb'),
        chain(['B302', 'B501'], 'climb'),
        chain(['B303', 'B501'], 'climb'),
        chain(['B104', 'B203'], 'climb'),
        chain(['B104', 'B204'], 'climb'),
        chain(['B205', 'B305'], 'climb'),
        chain(['B203', 'B304'], 'climb'),
        chain(['B401', 'B502'], 'climb'),
        chain(['B401', 'B503'], 'climb'),
        chain(['B502', 'B601'], 'climb'),
        chain(['B503', 'B601'], 'climb'),
        chain(['B305', 'B402'], 'climb'),
        chain(['B503', 'B602'], 'climb'),
        chain(['202', '103'], 'climb'),
        chain(['104', 'B107'], 'climb'),
        chain(['B107', 'B206'], 'climb'),
        chain(['B206', 'B306'], 'climb'),
        chain(['B206', 'B307'], 'climb'),
        chain(['B306', 'B403'], 'climb'),
        chain(['B308', 'B405'], 'climb'),
        chain(['B403', 'B504'], 'climb'),
        chain(['B404', 'B504'], 'climb'),
        chain(['B102', 'B202'], 'climb'),
        chain(['B202', 'B302'], 'climb'),
        chain(['B203', 'B303'], 'climb'),
        chain(['B204', 'B304'], 'climb'),
        chain(['B404', 'B505'], 'climb'),
        chain(['B401', 'B305'], 'climb'),
        chain(['B307', 'B403'], 'climb'),
        chain(['B106', '104'], 'climb'),
        // 回收站可一步直達垃圾場
        link('B105', 'B503', 'link')
    );

    /* ── 地圖座標（與原版 1568 × 721 版面一致）───────────────────── */
    LS.MAP_WIDTH = 1568;
    LS.MAP_HEIGHT = 721;
    LS.MAP_BOXES = {
        '201': { x: 556, y: 59, w: 192, h: 70 },
        '202': { x: 977, y: 59, w: 236, h: 70 },
        '101': { x: 437, y: 129, w: 66, h: 70 },
        '102': { x: 556, y: 129, w: 192, h: 70 },
        '103': { x: 977, y: 130, w: 77, h: 70 },
        '104': { x: 1055, y: 130, w: 158, h: 70 },
        B101: { x: 362, y: 201, w: 75, h: 70 },
        B102: { x: 437, y: 201, w: 66, h: 70 },
        B103: { x: 506, y: 201, w: 52, h: 70 },
        B104: { x: 558, y: 201, w: 190, h: 70 },
        B105: { x: 748, y: 201, w: 112, h: 70 },
        B106: { x: 1027, y: 201, w: 67, h: 70 },
        B107: { x: 1096, y: 201, w: 118, h: 70 },
        B201: { x: 362, y: 273, w: 118, h: 70 },
        B202: { x: 481, y: 273, w: 76, h: 70 },
        B203: { x: 558, y: 273, w: 82, h: 70 },
        B204: { x: 640, y: 273, w: 110, h: 70 },
        B205: { x: 750, y: 273, w: 73, h: 70 },
        B206: { x: 977, y: 273, w: 236, h: 70 },
        B301: { x: 362, y: 347, w: 83, h: 70 },
        B302: { x: 446, y: 347, w: 69, h: 70 },
        B303: { x: 516, y: 347, w: 77, h: 70 },
        B304: { x: 594, y: 347, w: 79, h: 70 },
        B305: { x: 674, y: 347, w: 151, h: 70 },
        B306: { x: 977, y: 347, w: 53, h: 70 },
        B307: { x: 1031, y: 347, w: 104, h: 70 },
        B308: { x: 1136, y: 347, w: 77, h: 70 },
        B501: { x: 362, y: 419, w: 232, h: 141 },
        B401: { x: 595, y: 419, w: 153, h: 70 },
        B402: { x: 748, y: 419, w: 71, h: 70 },
        B403: { x: 977, y: 419, w: 77, h: 70 },
        B404: { x: 1056, y: 419, w: 77, h: 70 },
        B405: { x: 1135, y: 419, w: 78, h: 70 },
        B502: { x: 595, y: 490, w: 113, h: 70 },
        B503: { x: 710, y: 490, w: 151, h: 70 },
        B504: { x: 977, y: 490, w: 121, h: 70 },
        B505: { x: 1100, y: 490, w: 113, h: 70 },
        B601: { x: 558, y: 562, w: 188, h: 70 },
        B602: { x: 748, y: 562, w: 114, h: 70 },
        B603: { x: 863, y: 562, w: 116, h: 70 },
        B604: { x: 980, y: 562, w: 114, h: 70 },
        B701: { x: 748, y: 633, w: 114, h: 70 },
    };

    /* ── 基因 ────────────────────────────────────────────────────── */
    LS.GENE_INFO = {
        might: { name: '武力', desc: '戰鬥時比大小，輸的人扣相差的點數。' },
        weight: { name: '負重', desc: '能帶幾件物品。' },
        speed: { name: '速度', desc: '每回合最多走幾步。' },
    };
    LS.DEFAULT_GENES = { might: 4, weight: 3, speed: 3 };
    LS.MAX_HP = 10;
    LS.TOTAL_ROUNDS = 6;

    /* 每回合在毒氣房間停留所受的傷害 */
    LS.GAS_DAMAGE_BY_ROUND = [1, 2, 2, 3, 3, 4];

    /* ── 特殊房間效果 ────────────────────────────────────────────── */
    LS.SPECIAL_INFO = {
        gene_bank: { name: '基因庫', desc: '停留後武力、負重、速度各永久 +1，並可查看所有玩家目前的基因面板。' },
        helipad: { name: '停機坪', desc: '每回合空投一張道具卡並累積在這裡，停留時攤開選取、最多帶走 1 張。停留後，下回合移動的第一步可直接飛到 H 標記的房間。戶外，不受毒氣影響。' },
        control_room: { name: '控制室', desc: '停留者二選一：① 毒氣票以 10 票計算；② 讓一個目前有毒的房間永久解毒。' },
        operating_room: { name: '手術室', desc: '剛好 2 人停留：兩人各 +4 生命，而且該回合這間房不結算戰鬥。3 人以上：沒有手術，照常亂鬥。1 人：無事發生。' },
        dining_hall: { name: '餐廳', desc: '停留後，本回合結算的脫水與飢餓共 2 點生命不會扣。' },
        console_room: { name: '操作室', desc: '停留後可重新分配基因面板，總點數等於你目前的總和（不會變多）。' },
        teleport_room: { name: '傳送室', desc: '經過或停留可以一步傳送到任意空房（沒有特殊功能的房間）。' },
        morgue: { name: '停屍間', desc: '生命值歸 0 的玩家在這裡成為暗影，身上的道具全部留在這間房的資源池。停留後最多抽 3 張。' },
    };

    /* ── 機器人政策 ──────────────────────────────────────────────── */
    LS.BOT_POLICIES = [
        { id: 'gunner', label: '槍手', hint: '金庫拿金條 → 武器庫換霰彈槍；有槍才主動找人打' },
        { id: 'hoarder', label: '拾荒', hint: '大倉庫抽好抽滿，垃圾丟回去；避開人多的地方' },
        { id: 'gambler', label: '賭徒', hint: '垃圾場翻神器，不怕跟人擠' },
        { id: 'medic', label: '醫者', hint: '藥房囤藥片 → 操作室重配點；血低就躲' },
        { id: 'ranger', label: '游擊', hint: '糧倉拿糧 → 傳送室四散；很怕撞到人' },
        { id: 'drunkard', label: '酒鬼', hint: '酒窖囤酒；有酒就喝，賭屬性成長' },
        { id: 'warden', label: '操控者', hint: '反覆進控制室：解毒保隊友、投 10 票操控毒氣' },
        { id: 'brute', label: '莽夫A', hint: '點數全押武力打落地戰，第 1 天去操作室換成補給型' },
        { id: 'brute_b', label: '莽夫B', hint: '點數全押武力打落地戰，第 1 天重配後保住武力，繞著餐廳纏鬥' },
        { id: 'hydro', label: '水行俠', hint: '水塔包水，和包糧的互換；補夠了就躲餐廳、不碰功能房' },
        { id: 'grain', label: '糧山泊', hint: '糧倉包糧，和包水的互換；補夠了就躲餐廳、不碰功能房' },
        { id: 'mule', label: '馱夫', hint: '水塔包水，自己不吃，全部轉給主將' },
        { id: 'marshal', label: '主將', hint: '糧倉包糧，水由馱夫供給；武力留給名次' },
    ];

    LS.DIFFICULTIES = [
        { id: 'easy', label: '新手', hint: '像第一次玩的人：到處逛，也不會互相幫忙' },
        { id: 'normal', label: '一般', hint: '各有拿手的開局，會兩兩組隊：互通物資、分頭搜刮' },
        { id: 'boss', label: '魔王', hint: '各有拿手的開局，而且全體聯手對付真人玩家' },
    ];

    /* ── 成就 ────────────────────────────────────────────────────── */
    // tier: common / rare / epic / legendary
    LS.ACHIEVEMENTS = [
        { id: 'perfect', name: '完美生存', group: 'survival', tier: 'epic' },
        { id: 'onlyHunger', name: '毫髮無傷', group: 'survival', tier: 'common' },
        { id: 'fullHp', name: 'ㄅ級分', group: 'survival', tier: 'legendary' },
        { id: 'goldFullHp', name: '老子有錢', group: 'survival', tier: 'epic' },
        { id: 'supply5Both', name: '豐衣足食', group: 'survival', tier: 'legendary' },
        { id: 'supply4Both', name: '衣食無憂', group: 'survival', tier: 'epic' },
        { id: 'supply5Water', name: '行走的水庫', group: 'survival', tier: 'rare' },
        { id: 'supply5Food', name: '家中有糧', group: 'survival', tier: 'epic' },
        { id: 'loner', name: '獨行俠', group: 'survival', tier: 'common' },
        { id: 'fasting', name: '辟穀仙人', group: 'survival', tier: 'common' },
        { id: 'junkieFan', name: '拾荒狂熱者', group: 'resource', tier: 'common' },
        { id: 'junkKing', name: '垃圾王', group: 'resource', tier: 'rare' },
        { id: 'treasure', name: '寶物獵人', group: 'resource', tier: 'common' },
        { id: 'gold5', name: '全球首富', group: 'resource', tier: 'legendary' },
        { id: 'gold4', name: '我爸郭X銘', group: 'resource', tier: 'epic' },
        { id: 'gold3', name: '土豪', group: 'resource', tier: 'rare' },
        { id: 'goldGot4', name: '我家有礦', group: 'resource', tier: 'rare' },
        { id: 'goldGot3', name: '掏金客', group: 'resource', tier: 'rare' },
        { id: 'freeGot4', name: '我全都要', group: 'resource', tier: 'rare' },
        { id: 'freeGot3', name: 'Sugar Baby', group: 'resource', tier: 'rare' },
        { id: 'freeGave4', name: '大慈善家', group: 'resource', tier: 'epic' },
        { id: 'freeGave3', name: '糖果爸爸', group: 'resource', tier: 'rare' },
        { id: 'onePunch', name: '一拳超人', group: 'combat', tier: 'rare' },
        { id: 'blade', name: '拔刀齋', group: 'combat', tier: 'epic' },
        { id: 'warlord', name: '軍火之王', group: 'combat', tier: 'common' },
        { id: 'stalker', name: '跟蹤狂', group: 'combat', tier: 'legendary' },
        { id: 'warmonger', name: '好戰分子', group: 'combat', tier: 'rare' },
        { id: 'prey', name: '專屬獵物', group: 'combat', tier: 'epic' },
        { id: 'enemyOfAll', name: '全民公敵', group: 'combat', tier: 'rare' },
        { id: 'peacemaker', name: '和平大使', group: 'combat', tier: 'rare' },
        { id: 'rocketPerfect', name: '彈無虛發', group: 'combat', tier: 'epic' },
        { id: 'rocketKing', name: '砲王之王', group: 'combat', tier: 'rare' },
        { id: 'rocketAce', name: '神射手', group: 'combat', tier: 'rare' },
        { id: 'masochist', name: '自虐狂', group: 'combat', tier: 'common' },
        { id: 'tough9', name: '金剛不壞', group: 'combat', tier: 'rare' },
        { id: 'tough8', name: '銅皮鐵骨', group: 'combat', tier: 'rare' },
        { id: 'bigHit10', name: '血肉模糊', group: 'combat', tier: 'common' },
        { id: 'onehit', name: '皮開肉綻', group: 'combat', tier: 'common' },
        { id: 'bombed3', name: '炸彈磁鐵', group: 'combat', tier: 'legendary' },
        { id: 'bombed2', name: '人形標靶', group: 'combat', tier: 'rare' },
        { id: 'purifier', name: '淨化大師', group: 'gas', tier: 'legendary' },
        { id: 'gasCommander', name: '毒氣指揮官', group: 'gas', tier: 'epic' },
        { id: 'oracle6', name: '毒氣預言家', group: 'gas', tier: 'common' },
        { id: 'oracle5', name: '毒氣算命師', group: 'gas', tier: 'rare' },
        { id: 'blackJack', name: '怪醫黑傑克', group: 'medical', tier: 'legendary' },
        { id: 'resident', name: '住院醫師', group: 'medical', tier: 'rare' },
        { id: 'needle5', name: '重度針癮', group: 'medical', tier: 'epic' },
        { id: 'needle4', name: '針不能停', group: 'medical', tier: 'rare' },
        { id: 'needle3', name: '針不離手', group: 'medical', tier: 'rare' },
        { id: 'save5', name: '閻王不收', group: 'medical', tier: 'epic' },
        { id: 'save4', name: '不死之身', group: 'medical', tier: 'rare' },
        { id: 'save3', name: '打不死的蟑螂', group: 'medical', tier: 'rare' },
        { id: 'save2', name: '命還挺硬', group: 'medical', tier: 'rare' },
        { id: 'pill6', name: '藥神', group: 'medical', tier: 'legendary' },
        { id: 'pill5', name: '藥罐子', group: 'medical', tier: 'legendary' },
        { id: 'pill4', name: '久病成醫', group: 'medical', tier: 'epic' },
        { id: 'pill3', name: '小病自理', group: 'medical', tier: 'rare' },
        { id: 'drainedDead', name: '精盡人亡', group: 'life', tier: 'rare' },
        { id: 'drainedAlive', name: '血牛', group: 'life', tier: 'legendary' },
        { id: 'haunt', name: 'X地縛靈', group: 'life', tier: 'common' },
        { id: 'vampireKing', name: '吸血鬼之王', group: 'life', tier: 'epic' },
        { id: 'vampire', name: '狂吸猛吸', group: 'life', tier: 'rare' },
        { id: 'phoenix', name: '不死鳳凰', group: 'life', tier: 'legendary' },
        { id: 'ninelives', name: '九命怪貓', group: 'life', tier: 'epic' },
        { id: 'comeback', name: '逆轉人生', group: 'life', tier: 'rare' },
        { id: 'deadRevenge', name: '亡者逆襲', group: 'life', tier: 'legendary' },
        { id: 'lyingWin', name: '躺贏玩家', group: 'life', tier: 'epic' },
        { id: 'thriceDead', name: '三生三逝', group: 'life', tier: 'legendary' },
        { id: 'jumper', name: '跳躍者', group: 'movement', tier: 'common' },
        { id: 'slider', name: '滑梯愛好者', group: 'movement', tier: 'rare' },
        { id: 'airportVip', name: '機場 VIP', group: 'movement', tier: 'legendary' },
        { id: 'frequentFlyer', name: '機場常客', group: 'movement', tier: 'epic' },
        { id: 'miles', name: '累積里程', group: 'movement', tier: 'rare' },
        { id: 'runner35', name: '馬拉松跑者', group: 'movement', tier: 'rare' },
        { id: 'runner30', name: '跑步愛好者', group: 'movement', tier: 'common' },
        { id: 'plainWater', name: '這是水吧', group: 'luck', tier: 'legendary' },
        { id: 'unlucky4', name: '地獄倒楣鬼', group: 'luck', tier: 'legendary' },
        { id: 'unlucky3', name: '倒楣鬼', group: 'luck', tier: 'legendary' },
        { id: 'drunk5', name: '千杯不醉', group: 'luck', tier: 'epic' },
        { id: 'drunk4', name: '嗜酒如命', group: 'luck', tier: 'epic' },
    ];

    LS.ACHIEVEMENT_GROUPS = {
        survival: '生存', resource: '資源', combat: '戰鬥',
        gas: '毒氣', medical: '醫療', life: '生死', movement: '移動', luck: '運氣',
    };

    LS.TIER_LABEL = { common: '普通', rare: '稀有', epic: '史詩', legendary: '傳說' };

    /* ── 出生點 ──────────────────────────────────────────────────── */
    LS.SPAWN_POINTS = [
        { id: '103', near: '武器庫、金庫、停機坪', tip: '1F 中樞，往上下都方便，但離水糧最遠。' },
        { id: 'B103', near: '水塔、控制室', tip: '水塔在手邊，但糧食要走一趟 B3 以下。' },
        { id: 'B303', near: '藥房、操作室', tip: '藥品與重配點近，適合醫者路線。' },
        { id: 'B307', near: '金庫、糧倉', tip: '金條與糧食都在附近，泛用性最高。' },
        { id: 'B402', near: '垃圾場、大倉庫', tip: '物資最雜，水糧武器通通有，但人容易擠。' },
        { id: 'B603', near: '大倉庫、糧倉、酒窖', tip: '下半場補給點，近但離安全區遠。' },
    ];

    /* 各 policy 適合的出生點 */
    LS.POLICY_HOME = {
        gunner: 'B307', hoarder: 'B402', gambler: 'B402', medic: 'B303',
        ranger: 'B603', drunkard: 'B603', warden: 'B103',
        hydro: 'B103', grain: 'B603', mule: 'B103', marshal: 'B603',
        brute: 'B307', brute_b: 'B307', rookie: 'B603',
    };

    /* ── 勝利條件 ────────────────────────────────────────────────── */
    LS.END_REASONS = {
        last_survivor: '僅剩一名存活玩家，直接獲勝',
        all_shadow: '全員化為暗影，以各自生前一輪的生命值排名',
        six_rounds: '六回合結束',
    };
})(typeof window !== 'undefined' ? window : globalThis);
