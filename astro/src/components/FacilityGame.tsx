import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

// 「封鎖設施求生」多人連線遊戲前端（多人完整規則版）。
// 地圖與規則移植自本站自有資產 /games/lockdown-survival/ 單人版
// （42 房、9 樓層、6 回合），後端是 /api/games（Neon 房間）。
// 伺服器權威狀態：前端每 2 秒輪詢 /api/games/rooms/:code，不用 WebSocket。
// 房間 12 小時後過期。帳號服務（B 組）：先出登入／註冊面板，支援顯示名稱
// 帳號＋訪客帳號＋恢復碼登入；Google 登入待接（按鈕停用，不寫假憑證）。
// 房型分娛樂（信譽 80）與競技（信譽 90）；觀戰只讀不佔名額。
// 舊版相容：只有房間 token、沒有帳號的舊流程仍可走娛樂房（後端放行），
// 但新版前端一律先登入（訪客即登入的一種）才顯示建房／加入。

type FloorId = '2F' | '1F' | 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6' | 'B7';

interface Item {
  id: string;
  kind: string;
}

interface PlayerView {
  id: string;
  name: string;
  accountProfile?: {
    displayName: string;
    reputation: number;
    games: number;
    wins: number;
    losses: number;
    achievements: string[];
  } | null;
  isAI: boolean;
  isHost: boolean;
  might: number;
  carry: number;
  speed: number;
  adrenalineActive: boolean;
  helicopter: boolean;
  hp: number;
  alive: boolean;
  shadowHp: number;
  lastAliveHp: number;
  room: string;
  ready: boolean;
  hasSetup: boolean;
  itemCount: number;
  itemKinds: string[];
  items?: Item[];
  isSelf: boolean;
}

interface TradeView {
  id: string;
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  offerKind: string;
  wantKind: string;
}

interface PendingDrawView {
  roomId: string;
  options: { index: number; kind: string; forced: boolean; junk: boolean }[];
  rules: { maxNonJunk: number | null; maxTotal: number | null };
  airdrop: boolean;
  keepDeadline: number | null;
}

interface RoomView {
  code: string;
  status: 'lobby' | 'playing' | 'finished';
  day: number;
  phase: 'free' | 'action' | 'keep';
  roomType?: 'casual' | 'ranked';
  spectators?: { id: string; name: string }[];
  isSpectator?: boolean;
  selfSpectatorId?: string | null;
  players: PlayerView[];
  submittedCount: number;
  submittedPlayerIds: string[];
  settlementOrder: { playerId: string; name: string; card: number }[];
  pendingDrawPlayerIds: string[];
  pendingDraw: PendingDrawView | null;
  goldOptions: string[];
  gassedFloors: string[];
  detoxedRooms: string[];
  poolCounts: Record<string, number>;
  airdropCount: number;
  usedPileCount: number;
  discardCount: number;
  lastGasTally: { floorId: string; votes: number; all: Record<string, number> } | null;
  log: { day: number; text: string }[];
  trades: TradeView[];
  ranking: { playerId: string; finalHp: number; might: number; alive: boolean; rank: number }[];
  selfId: string | null;
}

interface Session {
  code: string;
  playerId: string;
  token: string;
  isSpectator?: boolean;
}

interface AccountInfo {
  id: string;
  displayName: string;
  kind: 'named' | 'guest';
  reputation: number;
  cooldownUntil: number;
  cooldownRemainingMs: number;
  token: string;
}

interface MeData {
  account: AccountInfo;
  record: { games: number; wins: number; losses: number; bestFinalHp: number; achievements: string[] };
}

const SESSION_KEY = 'facility-game-session';
const ACCOUNT_KEY = 'facility-game-account';

function loadAccount(): AccountInfo | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as AccountInfo) : null;
  } catch {
    return null;
  }
}
const POLL_MS = 2000;

interface RoomDef {
  id: string;
  floors: FloorId[];
  name: string;
  tag: string;
  spawn?: boolean;
  pool?: boolean;
}

const ROOM_DEFS: RoomDef[] = [
  { id: '201', floors: ['2F'], name: '201 基因庫', tag: '三項能力 +1' },
  { id: '202', floors: ['2F'], name: '202 停機坪', tag: '空投物資、飛行移動', pool: true },
  { id: '101', floors: ['1F'], name: '101 水塔', tag: '水', pool: true },
  { id: '102', floors: ['1F'], name: '102 激光室', tag: '經過扣 1 血' },
  { id: '103', floors: ['1F'], name: '103', tag: '空房', spawn: true },
  { id: '104', floors: ['1F'], name: '104', tag: '空房' },
  { id: 'B101', floors: ['B1'], name: 'B101 控制室', tag: '毒氣票 ×10 或解毒' },
  { id: 'B102', floors: ['B1'], name: 'B102', tag: '空房' },
  { id: 'B103', floors: ['B1'], name: 'B103', tag: '空房', spawn: true },
  { id: 'B104', floors: ['B1'], name: 'B104', tag: '空房' },
  { id: 'B105', floors: ['B1'], name: 'B105 回收站', tag: '一步到垃圾場' },
  { id: 'B106', floors: ['B1'], name: 'B106', tag: '空房' },
  { id: 'B107', floors: ['B1'], name: 'B107 武器庫', tag: '武器', pool: true },
  { id: 'B201', floors: ['B2'], name: 'B201', tag: '空房' },
  { id: 'B202', floors: ['B2'], name: 'B202 手術室', tag: '剛好兩人各 +4 血' },
  { id: 'B203', floors: ['B2'], name: 'B203', tag: '空房' },
  { id: 'B204', floors: ['B2'], name: 'B204 餐廳', tag: '這天免繳水糧' },
  { id: 'B205', floors: ['B2'], name: 'B205', tag: '空房' },
  { id: 'B206', floors: ['B2'], name: 'B206 金庫', tag: '金條', pool: true },
  { id: 'B301', floors: ['B3'], name: 'B301 藥房', tag: '藥片、腎上腺素', pool: true },
  { id: 'B302', floors: ['B3'], name: 'B302', tag: '空房' },
  { id: 'B303', floors: ['B3'], name: 'B303', tag: '空房', spawn: true },
  { id: 'B304', floors: ['B3'], name: 'B304 操作室', tag: '重配能力' },
  { id: 'B305', floors: ['B3'], name: 'B305', tag: '空房' },
  { id: 'B306', floors: ['B3'], name: 'B306', tag: '空房' },
  { id: 'B307', floors: ['B3'], name: 'B307', tag: '空房', spawn: true },
  { id: 'B308', floors: ['B3'], name: 'B308', tag: '空房' },
  { id: 'B401', floors: ['B4'], name: 'B401', tag: '空房' },
  { id: 'B402', floors: ['B4'], name: 'B402', tag: '空房', spawn: true },
  { id: 'B403', floors: ['B4'], name: 'B403 傳送室', tag: '傳送到空房' },
  { id: 'B404', floors: ['B4'], name: 'B404', tag: '空房' },
  { id: 'B405', floors: ['B4'], name: 'B405', tag: '空房' },
  { id: 'B501', floors: ['B4', 'B5'], name: 'B501 大倉庫', tag: '大雜貨（兩層都毒才有毒）', pool: true },
  { id: 'B502', floors: ['B5'], name: 'B502', tag: '空房' },
  { id: 'B503', floors: ['B5'], name: 'B503 垃圾場', tag: '翻牌找神器（垃圾強制帶走）', pool: true },
  { id: 'B504', floors: ['B5'], name: 'B504', tag: '空房' },
  { id: 'B505', floors: ['B5'], name: 'B505 糧倉', tag: '糧食', pool: true },
  { id: 'B601', floors: ['B6'], name: 'B601 酒窖', tag: '酒', pool: true },
  { id: 'B602', floors: ['B6'], name: 'B602', tag: '空房' },
  { id: 'B603', floors: ['B6'], name: 'B603', tag: '空房', spawn: true },
  { id: 'B604', floors: ['B6'], name: 'B604', tag: '空房' },
  { id: 'B701', floors: ['B7'], name: 'B701 停屍間', tag: '暗影誕生', pool: true },
];

const ROOM_NAME: Record<string, string> = Object.fromEntries(ROOM_DEFS.map((r) => [r.id, r.name]));
const ROOM_FLOORS: Record<string, FloorId[]> = Object.fromEntries(ROOM_DEFS.map((r) => [r.id, r.floors]));
const FLOOR_ROWS: { floor: FloorId; label: string; rooms: string[] }[] = [
  { floor: '2F', label: '頂樓 2F', rooms: ['201', '202'] },
  { floor: '1F', label: '地面 1F', rooms: ['101', '102', '103', '104'] },
  { floor: 'B1', label: '地下 B1', rooms: ['B101', 'B102', 'B103', 'B104', 'B105', 'B106', 'B107'] },
  { floor: 'B2', label: '地下 B2', rooms: ['B201', 'B202', 'B203', 'B204', 'B205', 'B206'] },
  { floor: 'B3', label: '地下 B3', rooms: ['B301', 'B302', 'B303', 'B304', 'B305', 'B306', 'B307', 'B308'] },
  { floor: 'B4', label: '地下 B4', rooms: ['B401', 'B402', 'B403', 'B404', 'B405'] },
  { floor: 'B5', label: '地下 B5', rooms: ['B501', 'B502', 'B503', 'B504', 'B505'] },
  { floor: 'B6', label: '地下 B6', rooms: ['B601', 'B602', 'B603', 'B604'] },
  { floor: 'B7', label: '地下 B7', rooms: ['B701'] },
];
const ALL_FLOORS: FloorId[] = ['2F', '1F', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'];
const HELIPAD_ROOMS = ['201', '101', 'B101', 'B103', 'B105'];
// 與後端 isEmptyRoom 一致：無特殊功能、非資源房、非激光室
// （含出生點房；B501、B206 等資源房不算空房）。
const EMPTY_ROOMS = new Set([
  '103', '104',
  'B102', 'B103', 'B104', 'B106',
  'B201', 'B203', 'B205',
  'B302', 'B303', 'B305', 'B306', 'B307', 'B308',
  'B401', 'B402', 'B404', 'B405',
  'B502', 'B504',
  'B602', 'B603', 'B604',
]);

// 與後端 game-engine.ts 的 EDGES 一致（walk＋climb＋B105→B503 直達）。
function buildAdj(): { walk: Record<string, string[]>; climb: Record<string, string[]> } {
  const walk: Record<string, string[]> = {};
  const climb: Record<string, string[]> = {};
  const chain = (ids: string[], table: Record<string, string[]>) => {
    for (let i = 0; i < ids.length - 1; i++) {
      const a = ids[i] as string;
      const b = ids[i + 1] as string;
      (table[a] ??= []).push(b);
      (table[b] ??= []).push(a);
    }
  };
  const w = (ids: string[]) => chain(ids, walk);
  const c = (ids: string[]) => chain(ids, climb);
  w(['103', '104']);
  w(['B101', 'B102', 'B103', 'B104', 'B105', 'B106', 'B107']);
  w(['B201', 'B202', 'B203', 'B204', 'B205']);
  w(['B301', 'B302', 'B303', 'B304', 'B305', 'B306', 'B307', 'B308']);
  w(['B401', 'B402']);
  w(['B403', 'B404', 'B405']);
  w(['B501', 'B502', 'B503']);
  w(['B504', 'B505']);
  w(['B601', 'B602', 'B603', 'B604']);
  w(['101', 'B102']);
  w(['B102', 'B201']);
  w(['B501', 'B601']);
  w(['201', '102']);
  w(['102', 'B104']);
  w(['B105', 'B205']);
  w(['B204', 'B305']);
  w(['B304', 'B401']);
  w(['B402', 'B503']);
  w(['B602', 'B701']);
  w(['202', '104']);
  w(['103', 'B106']);
  w(['B106', 'B206']);
  w(['B206', 'B308']);
  w(['B307', 'B404']);
  w(['B405', 'B505']);
  w(['B504', 'B604']);
  c(['B101', 'B201']);
  c(['B103', 'B202']);
  c(['B201', 'B301']);
  c(['B201', 'B302']);
  c(['B202', 'B303']);
  c(['B301', 'B501']);
  c(['B302', 'B501']);
  c(['B303', 'B501']);
  c(['B104', 'B203']);
  c(['B104', 'B204']);
  c(['B205', 'B305']);
  c(['B203', 'B304']);
  c(['B401', 'B502']);
  c(['B401', 'B503']);
  c(['B502', 'B601']);
  c(['B503', 'B601']);
  c(['B305', 'B402']);
  c(['B503', 'B602']);
  c(['202', '103']);
  c(['104', 'B107']);
  c(['B107', 'B206']);
  c(['B206', 'B306']);
  c(['B206', 'B307']);
  c(['B306', 'B403']);
  c(['B308', 'B405']);
  c(['B403', 'B504']);
  c(['B404', 'B504']);
  c(['B102', 'B202']);
  c(['B202', 'B302']);
  c(['B203', 'B303']);
  c(['B204', 'B304']);
  c(['B404', 'B505']);
  c(['B401', 'B305']);
  c(['B307', 'B403']);
  c(['B106', '104']);
  return { walk, climb };
}
const { walk: WALK, climb: CLIMB } = buildAdj();

function neighborsOf(
  from: string,
  opts: { hasRope: boolean; isShadow: boolean; helicopterFirstStep: boolean },
): string[] {
  const out = new Set<string>(WALK[from] ?? []);
  if (from === 'B105') out.add('B503');
  if (opts.isShadow || opts.hasRope) {
    for (const nb of CLIMB[from] ?? []) out.add(nb);
  }
  if (from === 'B403') {
    for (const id of EMPTY_ROOMS) out.add(id);
  }
  if (opts.helicopterFirstStep) {
    for (const h of HELIPAD_ROOMS) out.add(h);
  }
  out.delete(from);
  return [...out];
}

const ITEM_NAME: Record<string, string> = {
  water: '水',
  food: '糧食',
  survival_kit: '生存補給',
  pill: '藥片',
  adrenaline: '腎上腺素',
  wine: '酒',
  fine_wine: '陳年美酒',
  gold_bar: '金條',
  knife: '刀',
  pistol: '手槍',
  shotgun: '霰彈槍',
  bayonet: '軍用刺刀',
  rope: '繩索',
  gas_mask: '防毒面具',
  rocket_launcher: '火箭筒',
  dimension_pocket: '次元口袋',
  recycler: '循環回收裝置',
  junk: '垃圾',
};

const SPAWN_TIPS: Record<string, string> = {
  '103': '1F 中樞，往上下都方便，但離水糧最遠。',
  B103: '水塔在手邊，但糧食要走一趟 B3 以下。',
  B303: '藥品與重配點近，適合醫者路線。',
  B307: '金條與糧食都在附近，泛用性最高。',
  B402: '物資最雜，水糧武器通通有，但人容易擠。',
  B603: '下半場補給點，近但離安全區遠。',
};

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

async function api(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; room?: RoomView };
  if (!res.ok) throw new Error(data.error || `請求失敗（${res.status}）`);
  return data;
}

const btn: CSSProperties = {
  minHeight: 44,
  padding: '10px 16px',
  borderRadius: 10,
  border: '1px solid #334155',
  background: '#1e293b',
  color: '#f1f5f9',
  fontSize: 16,
  cursor: 'pointer',
};

const btnPrimary: CSSProperties = { ...btn, background: '#0e7490', borderColor: '#0e7490' };
const btnDisabled: CSSProperties = { ...btn, opacity: 0.45, cursor: 'not-allowed' };

function FacilityGamePage() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [room, setRoom] = useState<RoomView | null>(null);
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [account, setAccount] = useState<AccountInfo | null>(() => loadAccount());
  const [me, setMe] = useState<MeData | null>(null);
  const [loginTab, setLoginTab] = useState<'guest' | 'register' | 'login' | 'recover'>('guest');
  const [loginName, setLoginName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [recoveryShown, setRecoveryShown] = useState<string | null>(null);
  const [roomType, setRoomType] = useState<'casual' | 'ranked'>('casual');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // 大廳配點
  const [might, setMight] = useState(4);
  const [carry, setCarry] = useState(3);
  const [speed, setSpeed] = useState(3);
  const [spawn, setSpawn] = useState('103');
  // 行動階段
  const [path, setPath] = useState<string[]>([]);
  const [vote, setVote] = useState<FloorId | ''>('');
  const [controlMode, setControlMode] = useState<'' | 'vote' | 'detox'>('');
  const [detoxTarget, setDetoxTarget] = useState('');
  const [rm, setRm] = useState(4);
  const [rc, setRc] = useState(3);
  const [rs, setRs] = useState(3);
  const [rocketTarget, setRocketTarget] = useState('');
  const [itemUses, setItemUses] = useState<string[]>([]);
  // 交易（自由階段與行動階段結算內交易共用同一組輸入）
  const [tradeTo, setTradeTo] = useState('');
  const [tradeOffer, setTradeOffer] = useState('');
  const [tradeWant, setTradeWant] = useState('');
  // 選留階段
  const [keepSelected, setKeepSelected] = useState<number[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = '封鎖設施求生｜多人連線生存遊戲';
  }, []);

  useEffect(() => {
    if (!account) {
      setMe(null);
      return;
    }
    api(`/api/games/accounts/me?accountToken=${encodeURIComponent(account.token)}`)
      .then((d) => setMe(d as MeData))
      .catch(() => setMe(null));
  }, [account]);

  const saveAccount = (a: AccountInfo) => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(a));
    setAccount(a);
  };

  const logoutAccount = async () => {
    if (account) {
      try {
        await api('/api/games/accounts/logout', { accountToken: account.token });
      } catch {
        // 登出失敗也清掉本機登入態。
      }
    }
    localStorage.removeItem(ACCOUNT_KEY);
    setAccount(null);
    setMe(null);
    setRecoveryShown(null);
  };

  const handleAccountResponse = (data: {
    account: Omit<AccountInfo, 'token'>;
    token: string;
    recoveryCode?: string;
  }) => {
    saveAccount({ ...data.account, token: data.token });
    // 恢復碼只顯示一次：顯示後即從 state 清掉的按鈕由使用者按「我已抄下」關閉，
    // 伺服器只存雜湊，關閉後無法再查回明文。
    setRecoveryShown(data.recoveryCode ?? null);
    setError('');
  };

  const submitGuest = async () => {
    setBusy(true);
    setError('');
    try {
      const data = (await api('/api/games/accounts/guest', { displayName: loginName.trim() || undefined })) as {
        account: Omit<AccountInfo, 'token'>;
        token: string;
        recoveryCode: string;
      };
      handleAccountResponse(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '訪客登入失敗');
    } finally {
      setBusy(false);
    }
  };

  const submitRegister = async () => {
    setBusy(true);
    setError('');
    try {
      const data = (await api('/api/games/accounts/register', { displayName: loginName.trim(), password: loginPassword })) as {
        account: Omit<AccountInfo, 'token'>;
        token: string;
        recoveryCode: string;
      };
      handleAccountResponse(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '註冊失敗');
    } finally {
      setBusy(false);
    }
  };

  const submitLogin = async () => {
    setBusy(true);
    setError('');
    try {
      const data = (await api('/api/games/accounts/login', { displayName: loginName.trim(), password: loginPassword })) as {
        account: Omit<AccountInfo, 'token'>;
        token: string;
      };
      handleAccountResponse(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '登入失敗');
    } finally {
      setBusy(false);
    }
  };

  const submitRecover = async () => {
    setBusy(true);
    setError('');
    try {
      const data = (await api('/api/games/accounts/recover', { displayName: loginName.trim(), recoveryCode: recoveryInput.trim() })) as {
        account: Omit<AccountInfo, 'token'>;
        token: string;
      };
      handleAccountResponse(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '恢復登入失敗');
    } finally {
      setBusy(false);
    }
  };

  const fetchRoom = useCallback(
    async (s: Session) => {
      try {
        const data = (await api(`/api/games/rooms/${s.code}?token=${encodeURIComponent(s.token)}`)) as {
          room: RoomView;
        };
        setRoom(data.room);
        setError('');
      } catch (e) {
        const msg = e instanceof Error ? e.message : '連線失敗';
        if (msg.includes('找不到房間')) {
          localStorage.removeItem(SESSION_KEY);
          setSession(null);
          setRoom(null);
        }
        setError(msg);
      }
    },
    [],
  );

  useEffect(() => {
    if (!session) return;
    fetchRoom(session);
    const timer = setInterval(() => fetchRoom(session), POLL_MS);
    return () => clearInterval(timer);
  }, [session, fetchRoom]);

  // 階段切換時清空行動輸入
  const phaseKey = room ? `${room.day}-${room.phase}` : '';
  useEffect(() => {
    setPath([]);
    setVote('');
    setControlMode('');
    setDetoxTarget('');
    setRocketTarget('');
    setItemUses([]);
    setTradeTo('');
    setTradeOffer('');
    setTradeWant('');
    setKeepSelected([]);
  }, [phaseKey]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [room?.log.length]);

  const self = room?.players.find((p) => p.id === room.selfId) ?? null;

  // 進操作室時把重配步進器預設為目前基因
  useEffect(() => {
    if (self) {
      setRm(self.might);
      setRc(self.carry);
      setRs(self.speed);
    }
  }, [self?.might, self?.carry, self?.speed]);

  const post = useCallback(
    async (path2: string, body: Record<string, unknown>) => {
      if (!session) return;
      setBusy(true);
      setError('');
      try {
        const data = (await api(path2, { ...body, token: session.token })) as { room: RoomView };
        setRoom(data.room);
      } catch (e) {
        setError(e instanceof Error ? e.message : '操作失敗');
      } finally {
        setBusy(false);
      }
    },
    [session],
  );

  const createRoom = async () => {
    if (!name.trim() && !account) {
      setError('請先輸入名字');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = (await api('/api/games/rooms', { name: name.trim(), accountToken: account?.token, roomType })) as {
        code: string;
        playerId: string;
        token: string;
        room: RoomView;
        accountNote?: string;
      };
      if (data.accountNote) setError(data.accountNote);
      const s: Session = { code: data.code, playerId: data.playerId, token: data.token };
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      setSession(s);
      setRoom(data.room);
    } catch (e) {
      setError(e instanceof Error ? e.message : '建房失敗');
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async () => {
    if ((!name.trim() && !account) || !joinCode.trim()) {
      setError('請輸入名字與房間碼');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = (await api(`/api/games/rooms/${joinCode.trim().toUpperCase()}/join`, {
        name: name.trim(),
        accountToken: account?.token,
      })) as { playerId: string; token: string; room: RoomView; accountNote?: string };
      if (data.accountNote) setError(data.accountNote);
      const s: Session = { code: joinCode.trim().toUpperCase(), playerId: data.playerId, token: data.token };
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      setSession(s);
      setRoom(data.room);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加入失敗');
    } finally {
      setBusy(false);
    }
  };

  const leaveRoom = () => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setRoom(null);
  };

  const spectateRoom = async () => {
    if (!joinCode.trim()) {
      setError('請輸入房間碼');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = (await api(`/api/games/rooms/${joinCode.trim().toUpperCase()}/spectate`, {
        name: account?.displayName ?? name.trim(),
        accountToken: account?.token,
      })) as { spectatorId: string; token: string; room: RoomView };
      const s2: Session = { code: joinCode.trim().toUpperCase(), playerId: data.spectatorId, token: data.token, isSpectator: true };
      localStorage.setItem(SESSION_KEY, JSON.stringify(s2));
      setSession(s2);
      setRoom(data.room);
    } catch (e) {
      setError(e instanceof Error ? e.message : '觀戰加入失敗');
    } finally {
      setBusy(false);
    }
  };

  const quitRoom = async () => {
    if (!session || !room) return;
    setBusy(true);
    try {
      await api(`/api/games/rooms/${room.code}/quit`, { token: session.token });
    } catch (e) {
      setError(e instanceof Error ? e.message : '棄權失敗');
    } finally {
      setBusy(false);
      leaveRoom();
    }
  };

  const wrap: CSSProperties = {
    maxWidth: 980,
    margin: '0 auto',
    padding: '20px 14px 60px',
    color: '#e2e8f0',
    fontSize: 16,
    lineHeight: 1.6,
  };

  if (!account) {
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>封鎖設施求生</h1>
        <p style={{ color: '#94a3b8' }}>
          最多 8 名玩家受困於 9 層、42 間房的設施，撐過 6 回合。請先登入：訪客帳號不用密碼、
          也是一種正式登入；顯示名稱帳號可用密碼登入，忘記密碼可用恢復碼登入。
        </p>
        <p style={{ color: '#f59e0b', fontSize: 14 }}>
          恢復碼只在建立帳號時顯示一次，伺服器只存雜湊、無法幫你查回明文，請務必抄下。
          Google 登入尚未接通（需站長另外提供 Google Cloud 憑證），目前按鈕為停用狀態。
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          {(['guest', 'register', 'login', 'recover'] as const).map((t) => (
            <button
              key={t}
              type="button"
              style={loginTab === t ? btnPrimary : btn}
              onClick={() => setLoginTab(t)}
            >
              {t === 'guest' ? '訪客登入' : t === 'register' ? '註冊' : t === 'login' ? '登入' : '恢復碼登入'}
            </button>
          ))}
        </div>
        <label style={{ display: 'block', marginTop: 16 }}>
          顯示名稱
          <input
            value={loginName}
            onChange={(e) => setLoginName(e.target.value)}
            placeholder={loginTab === 'guest' ? '留空自動產生訪客名稱' : '例如：阿哲'}
            maxLength={12}
            style={{ display: 'block', width: '100%', minHeight: 44, marginTop: 6, padding: '8px 12px', borderRadius: 10, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', fontSize: 16 }}
          />
        </label>
        {(loginTab === 'register' || loginTab === 'login') && (
          <label style={{ display: 'block', marginTop: 12 }}>
            密碼（至少 4 個字元）
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              style={{ display: 'block', width: '100%', minHeight: 44, marginTop: 6, padding: '8px 12px', borderRadius: 10, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', fontSize: 16 }}
            />
          </label>
        )}
        {loginTab === 'recover' && (
          <label style={{ display: 'block', marginTop: 12 }}>
            恢復碼
            <input
              value={recoveryInput}
              onChange={(e) => setRecoveryInput(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX"
              style={{ display: 'block', width: '100%', minHeight: 44, marginTop: 6, padding: '8px 12px', borderRadius: 10, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', fontSize: 16 }}
            />
          </label>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <button
            type="button"
            style={busy ? btnDisabled : btnPrimary}
            disabled={busy}
            onClick={loginTab === 'guest' ? submitGuest : loginTab === 'register' ? submitRegister : loginTab === 'login' ? submitLogin : submitRecover}
          >
            {loginTab === 'guest' ? '以訪客身分登入' : loginTab === 'register' ? '註冊' : loginTab === 'login' ? '登入' : '用恢復碼登入'}
          </button>
          <button type="button" style={btnDisabled} disabled title="Google 登入尚未接通：需站長在 Google Cloud 建立 OAuth 憑證後才開放">
            Google 登入（尚未接通）
          </button>
        </div>
        {recoveryShown && (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 10, border: '1px solid #f59e0b', background: '#422006' }}>
            <strong>你的恢復碼（只顯示一次，請立即抄下）：{recoveryShown}</strong>
            <div style={{ marginTop: 8 }}>
              <button type="button" style={btn} onClick={() => setRecoveryShown(null)}>
                我已抄下
              </button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" style={{ color: '#f87171', marginTop: 16 }}>
            {error}
          </p>
        )}
      </main>
    );
  }

  if (!session || !room) {
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>封鎖設施求生</h1>
        <p style={{ color: '#94a3b8' }}>
          最多 8 名玩家受困於 9 層、42 間房的設施，撐過 6 回合。配點、搜刮水糧、投票毒樓層、
          同房戰鬥、手術室、火箭筒、控制室、操作室重配、暗影吸血復活，6 回合後按生命排名。
          本遊戲為原創作品，規則移植自本站單人版《禁閉逃殺》玩法。
        </p>
        <p style={{ color: '#f59e0b', fontSize: 14 }}>
          注意：房間存在伺服器資料庫裡，12 小時後過期；房間碼就是入場憑證，不要公開給不想一起玩的人。
        </p>
        <section aria-label="個人檔案" style={{ marginTop: 16, padding: 12, borderRadius: 12, border: '1px solid #334155', background: '#0f172a' }}>
          <div>
            👤 {account.displayName}（{account.kind === 'guest' ? '訪客' : '顯示名稱'}帳號）· 信譽 {me?.account.reputation ?? account.reputation} 分
            {me && <> · 戰績 {me.record.wins} 勝 / {me.record.losses} 負（共 {me.record.games} 場）</>}
            {me && me.record.achievements.length > 0 && <> · 成就：{me.record.achievements.join('、')}</>}
          </div>
          {me && me.account.cooldownRemainingMs > 0 && (
            <div style={{ color: '#f87171', fontSize: 14 }}>
              冷卻中：約 {Math.ceil(me.account.cooldownRemainingMs / 60000)} 分鐘後才能加入新房間（對局中棄權的冷卻）。
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <button type="button" style={btn} onClick={logoutAccount}>
              登出
            </button>
          </div>
        </section>
        <label style={{ display: 'block', marginTop: 16 }}>
          你的名字
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：阿哲"
            maxLength={12}
            style={{ display: 'block', width: '100%', minHeight: 44, marginTop: 6, padding: '8px 12px', borderRadius: 10, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', fontSize: 16 }}
          />
        </label>
        <label style={{ display: 'block', marginTop: 14 }}>
          房型
          <select
            value={roomType}
            onChange={(e) => setRoomType(e.target.value as 'casual' | 'ranked')}
            style={{ display: 'block', width: '100%', minHeight: 44, marginTop: 6, padding: '8px 12px', borderRadius: 10, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', fontSize: 16 }}
          >
            <option value="casual">娛樂房（需信譽 80 分）</option>
            <option value="ranked">競技房（需信譽 90 分）</option>
          </select>
        </label>
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <button type="button" style={busy ? btnDisabled : btnPrimary} disabled={busy} onClick={createRoom}>
            建立房間
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ flex: 1, minWidth: 160 }}>
            房間碼
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="6 碼英數"
              maxLength={6}
              style={{ display: 'block', width: '100%', minHeight: 44, marginTop: 6, padding: '8px 12px', borderRadius: 10, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', fontSize: 16, textTransform: 'uppercase' }}
            />
          </label>
          <button type="button" style={busy ? btnDisabled : btn} disabled={busy} onClick={joinRoom}>
            加入房間
          </button>
          <button type="button" style={busy ? btnDisabled : btn} disabled={busy} onClick={spectateRoom}>
            觀戰加入（只讀）
          </button>
        </div>
        {error && (
          <p role="alert" style={{ color: '#f87171', marginTop: 16 }}>
            {error}
          </p>
        )}
      </main>
    );
  }

  const sum = might + carry + speed;
  const setupValid = sum === 10 && speed >= 1;
  const submitted = self ? room.submittedPlayerIds.includes(self.id) : false;

  // 行動路徑：起點是自己目前房間，點相鄰房前進，點最後一格退回
  const pathStart = self?.room ?? '';
  const pathLast = path.length > 0 ? (path[path.length - 1] as string) : pathStart;
  const visited = new Set([pathStart, ...path]);
  const hasRope = (self?.items ?? []).some((it) => it.kind === 'rope');
  const isShadow = self ? !self.alive : false;
  const candidates = new Set(
    isShadow
      ? ROOM_DEFS.map((r) => r.id).filter((r) => !visited.has(r))
      : neighborsOf(pathLast, {
          hasRope,
          isShadow: false,
          helicopterFirstStep: path.length === 0 && !!self?.helicopter,
        }).filter((r) => !visited.has(r)),
  );
  const maxSteps = self ? (self.adrenalineActive ? 10 : self.speed) : 0;
  const finalRoom = path.length > 0 ? (path[path.length - 1] as string) : pathStart;
  const geneTotal = self ? self.might + self.carry + self.speed : 10;
  const reallocValid = rm + rc + rs === geneTotal && rs >= 1 && rm >= 0 && rc >= 0;
  const hasRocket = (self?.items ?? []).some((it) => it.kind === 'rocket_launcher');
  const usableItems = (self?.items ?? []).filter((it) => ['pill', 'adrenaline', 'wine', 'fine_wine'].includes(it.kind));
  const canSubmitAction =
    self &&
    room.phase === 'action' &&
    !submitted &&
    (self.alive
      ? path.length >= 1 && path.length <= maxSteps && vote !== '' && (finalRoom !== 'B304' || reallocValid)
      : true);

  const roomIsGassed = (id: string) => {
    const floors = ROOM_FLOORS[id] ?? [];
    if (floors.length === 0) return false;
    if (room.detoxedRooms.includes(id)) return false;
    if (id === '202') return false;
    return floors.every((f) => room.gassedFloors.includes(f));
  };

  const stepper = (label: string, value: number, set: (n: number) => void) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 52 }}>{label}</span>
      <button type="button" style={btn} onClick={() => set(Math.max(0, value - 1))} aria-label={`${label}減一`}>
        −
      </button>
      <strong style={{ minWidth: 28, textAlign: 'center', fontSize: 18 }}>{value}</strong>
      <button type="button" style={btn} onClick={() => set(value + 1)} aria-label={`${label}加一`}>
        ＋
      </button>
    </div>
  );

  if (session?.isSpectator && room) {
    return (
      <main style={wrap}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h1 style={{ fontSize: 26, margin: 0 }}>封鎖設施求生（觀戰）</h1>
          <button type="button" style={btn} onClick={leaveRoom}>
            離開觀戰
          </button>
        </div>
        <p style={{ color: '#94a3b8' }}>
          房間碼：<strong style={{ color: '#fbbf24', fontSize: 22, letterSpacing: 2 }}>{room.code}</strong>
        {room.roomType === 'ranked' ? ' · 競技房' : ' · 娛樂房'}
        {(room.spectators?.length ?? 0) > 0 && <> · 👀 觀戰者：{room.spectators?.map((sp) => sp.name).join('、')}</>}
          {room.roomType === 'ranked' ? ' · 競技房' : ' · 娛樂房'}
          {room.status === 'playing' && ` · 第 ${room.day} / 6 回合`}
          {room.status === 'finished' && ' · 遊戲結束'}
        </p>
        <p style={{ color: '#f59e0b', fontSize: 14 }}>觀戰模式為只讀：不能行動、交易或投票，也不會佔玩家名額。</p>
        <section aria-label="玩家狀態" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {room.players.map((pl) => (
            <div key={pl.id} style={{ border: '1px solid #334155', borderRadius: 12, padding: 12, background: '#0f172a' }}>
              <div style={{ fontWeight: 700 }}>
                {pl.name} {pl.isAI && '(AI)'} {pl.isHost && '👑'}
              </div>
              <div style={{ fontSize: 14, color: '#94a3b8' }}>
                {pl.alive ? `❤️ ${pl.hp} / 10` : `👻 暗影（累積 ${pl.shadowHp} 血）`} · 📍 {ROOM_NAME[pl.room] ?? '？'}
              </div>
              {pl.accountProfile && (
                <div style={{ fontSize: 13, color: '#94a3b8' }}>
                  信譽 {pl.accountProfile.reputation} · {pl.accountProfile.wins} 勝 / {pl.accountProfile.losses} 負
                  {pl.accountProfile.achievements.length > 0 && ` · ${pl.accountProfile.achievements.join('、')}`}
                </div>
              )}
            </div>
          ))}
        </section>
        {(room.spectators?.length ?? 0) > 0 && (
          <p style={{ color: '#94a3b8', fontSize: 14 }}>觀戰者：{room.spectators?.map((sp) => sp.name).join('、')}</p>
        )}
        <div ref={logRef} style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #334155', borderRadius: 12, padding: 12, marginTop: 16, fontSize: 14 }}>
          {room.log.slice(-100).map((e, i) => (
            <div key={i}>
              第 {e.day} 天：{e.text}
            </div>
          ))}
        </div>
        {error && (
          <p role="alert" style={{ color: '#f87171' }}>
            {error}
          </p>
        )}
      </main>
    );
  }

  return (
    <main style={wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>封鎖設施求生</h1>
        <button type="button" style={btn} onClick={leaveRoom}>
          離開房間
        </button>
        <button type="button" style={btn} disabled={busy} onClick={quitRoom} title="對局中棄權改由 AI 託管並扣信譽 10 分，第一位棄權者冷卻 15 分鐘；大廳棄權不扣分">
          棄權（對局中扣分）
        </button>
      </div>
      <p style={{ color: '#94a3b8' }}>
        房間碼：<strong style={{ color: '#fbbf24', fontSize: 22, letterSpacing: 2 }}>{room.code}</strong>
        {room.status === 'playing' && (
          <>
            {' '}
            · 第 {room.day} / 6 回合 · {room.phase === 'free' ? '自由階段' : room.phase === 'keep' ? '選留階段' : '行動階段'}
          </>
        )}
        {room.status === 'playing' && room.settlementOrder.length > 0 && (
          <>
            {' '}
            · 📋 行動順序：{room.settlementOrder.map((o) => `${o.name}(${o.card})`).join(' → ')}
          </>
        )}
        {room.status === 'finished' && ' · 遊戲結束'}
        {room.gassedFloors.length > 0 && <> · ☣️ 已中毒樓層：{room.gassedFloors.join('、')}</>}
        {room.lastGasTally && (
          <>
            {' '}
            · 上回合投票最高：{room.lastGasTally.floorId}（{room.lastGasTally.votes} 票）
          </>
        )}
      </p>
      {error && (
        <p role="alert" style={{ color: '#f87171' }}>
          {error}
        </p>
      )}

      {/* 玩家面板 */}
      <section aria-label="玩家狀態" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        {room.players.map((p) => (
          <div
            key={p.id}
            style={{
              border: p.isSelf ? '2px solid #0e7490' : '1px solid #334155',
              borderRadius: 12,
              padding: 12,
              background: p.alive ? '#0f172a' : '#1c1917',
            }}
          >
            <div style={{ fontWeight: 700 }}>
              {p.name} {p.isAI && '(AI)'} {p.isHost && '👑'} {p.isSelf && '← 你'}
            </div>
            {p.accountProfile && (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>
                信譽 {p.accountProfile.reputation} · {p.accountProfile.wins} 勝 / {p.accountProfile.losses} 負（{p.accountProfile.games} 場）
                {p.accountProfile.achievements.length > 0 && ` · ${p.accountProfile.achievements.join('、')}`}
              </div>
            )}
            <div style={{ fontSize: 14, color: '#94a3b8' }}>
              {p.alive ? `❤️ ${p.hp} / 10` : `👻 暗影（累積 ${p.shadowHp} 血）`}
              {p.helicopter && p.alive ? ' ✈️ 下回合可飛行' : ''}
              {p.adrenalineActive && p.alive ? ' 💉 腎上腺素生效中' : ''}
            </div>
            <div
              style={{
                height: 8,
                borderRadius: 4,
                background: '#334155',
                overflow: 'hidden',
                margin: '6px 0',
              }}
            >
              <div
                style={{
                  width: `${p.alive ? p.hp * 10 : Math.min(100, p.shadowHp * 50)}%`,
                  height: '100%',
                  background: p.alive ? (p.hp <= 3 ? '#ef4444' : '#22c55e') : '#a78bfa',
                }}
              />
            </div>
            <div style={{ fontSize: 13 }}>
              📍 {ROOM_NAME[p.room] ?? '？'} · 武 {p.might}／負 {p.carry}／速 {p.speed}
            </div>
            <div style={{ fontSize: 13 }}>
              🎒 {p.itemCount} / {p.carry} 件
              {p.isSelf && p.items && p.items.length > 0 && `：${p.items.map((it) => ITEM_NAME[it.kind]).join('、')}`}
              {!p.isSelf && p.itemKinds.length > 0 && `：${p.itemKinds.map((k) => ITEM_NAME[k] ?? k).join('、')}`}
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>
              {room.status === 'playing' && room.phase === 'free' && (p.ready ? '✅ 已準備' : '⏳ 自由階段中')}
              {room.status === 'playing' && room.phase === 'action' && (room.submittedPlayerIds.includes(p.id) ? '✅ 已行動' : '⏳ 行動中')}
              {room.status === 'playing' && room.phase === 'keep' && (room.pendingDrawPlayerIds.includes(p.id) ? '🎴 選留中' : '✅ 已選留')}
              {room.status === 'lobby' && (p.hasSetup ? '✅ 已配點' : '⏳ 尚未配點')}
              {room.status === 'playing' &&
                room.settlementOrder.find((o) => o.playerId === p.id) &&
                ` · 順序 #${room.settlementOrder.find((o) => o.playerId === p.id)?.card}`}
            </div>
          </div>
        ))}
      </section>

      {/* 大廳：配點＋出生點 */}
      {room.status === 'lobby' && self && (
        <section style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 20 }}>角色創建</h2>
          <p style={{ fontSize: 14, color: '#94a3b8' }}>
            武力／負重／速度總和必須剛好 10 點，速度至少 1 點。負重是背包上限；速度是每回合最多步數。
            走到資源房會攤開物資讓你選留：垃圾場垃圾強制帶走、非垃圾最多 2 件、停機坪空投最多 1 件、
            超出背包容量不能選；60 秒內未選由伺服器自動保留。
          </p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {stepper('武力', might, setMight)}
            {stepper('負重', carry, setCarry)}
            {stepper('速度', speed, setSpeed)}
          </div>
          <p>
            總和：<strong style={{ color: setupValid ? '#22c55e' : '#f87171' }}>{sum} / 10</strong>
            {!setupValid && '（總和必須是 10，且速度至少 1）'}
          </p>
          <p style={{ marginBottom: 6 }}>出生點（同出生點者落地即戰鬥）：</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ROOM_DEFS.filter((r) => r.spawn).map((r) => (
              <button
                key={r.id}
                type="button"
                style={spawn === r.id ? btnPrimary : btn}
                onClick={() => setSpawn(r.id)}
              >
                {r.name}
              </button>
            ))}
          </div>
          {SPAWN_TIPS[spawn] && <p style={{ fontSize: 14, color: '#94a3b8' }}>{SPAWN_TIPS[spawn]}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button
              type="button"
              style={busy || !setupValid ? btnDisabled : btnPrimary}
              disabled={busy || !setupValid}
              onClick={() => post(`/api/games/rooms/${room.code}/setup`, { might, carry, speed, spawn })}
            >
              確認配點與出生點
            </button>
            {self.isHost && (
              <button
                type="button"
                style={busy ? btnDisabled : btnPrimary}
                disabled={busy}
                onClick={() => post(`/api/games/rooms/${room.code}/start`, {})}
              >
                開始遊戲（未滿 8 人由 AI 補滿）
              </button>
            )}
          </div>
          {!self.isHost && <p style={{ fontSize: 14, color: '#94a3b8' }}>等房主開始遊戲。未配點者開局時會用預設值（武 4／負 3／速 3）。</p>}
        </section>
      )}

      {/* 遊戲中：地圖 */}
      {room.status === 'playing' && self && (
        <section style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 20 }}>
            設施地圖
            {room.phase === 'action' && !submitted && (
              <span style={{ fontSize: 15, color: '#fbbf24' }}>
                {' '}
                · 輪到你行動：已走 {path.length} / {maxSteps} 步
              </span>
            )}
            {room.phase === 'action' && submitted && (
              <span style={{ fontSize: 15, color: '#22c55e' }}> · 你已提交，等待其他玩家（{room.submittedCount} / {room.players.length}）</span>
            )}
            {room.phase === 'free' && (
              <span style={{ fontSize: 15, color: '#94a3b8' }}>
                {' '}
                · 全員按準備完成後進入行動階段（{room.players.filter((p) => p.alive && p.ready).length} /{' '}
                {room.players.filter((p) => p.alive).length} 已準備；暗影不需準備）
              </span>
            )}
          </h2>
          {FLOOR_ROWS.map((row) => (
            <div key={row.floor} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {row.label}
                {room.gassedFloors.includes(row.floor) && <span style={{ color: '#f87171' }}> ☣️ 已中毒</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${row.rooms.length}, minmax(0, 1fr))`, gap: 6 }}>
                {row.rooms.map((id) => {
                  const def = ROOM_DEFS.find((r) => r.id === id) as RoomDef;
                  const occupants = room.players.filter((p) => p.room === id);
                  const isCurrent = self.room === id;
                  const isLastPath = path.length > 0 && path[path.length - 1] === id;
                  const clickable = room.phase === 'action' && !submitted && (candidates.has(id) || isLastPath);
                  const poolLeft = def.pool ? room.poolCounts[id] : undefined;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={!clickable}
                      onClick={() => {
                        if (isLastPath) setPath(path.slice(0, -1));
                        else if (candidates.has(id)) setPath([...path, id]);
                      }}
                      style={{
                        minHeight: 64,
                        padding: '6px 4px',
                        borderRadius: 10,
                        border: isCurrent ? '2px solid #0e7490' : isLastPath ? '2px solid #f59e0b' : '1px solid #334155',
                        background: roomIsGassed(id) ? '#450a0a' : '#0f172a',
                        color: '#f1f5f9',
                        cursor: clickable ? 'pointer' : 'default',
                        opacity: clickable || isCurrent || occupants.length > 0 ? 1 : 0.75,
                        fontSize: 13,
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{def.name}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{def.tag}</div>
                      {poolLeft !== undefined && <div style={{ fontSize: 11 }}>物資剩 {poolLeft} 張{id === '202' ? `（空投 ${room.airdropCount} 張）` : ''}</div>}
                      {room.detoxedRooms.includes(id) && <div style={{ fontSize: 11 }}>🛡️ 已解毒</div>}
                      {roomIsGassed(id) && <div style={{ fontSize: 11, color: '#f87171' }}>☣️ 毒氣中</div>}
                      {occupants.length > 0 && (
                        <div style={{ fontSize: 12, color: '#fbbf24' }}>{occupants.map((p) => p.name).join('、')}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p style={{ fontSize: 13, color: '#94a3b8' }}>
            點相鄰房間前進（黃框為路徑最後一格，再點一次可退回）；每回合至少走 1 步、不可重複進房；
            垂直通道（爬梯）需繩索或暗影；經過傳送室 B403 後可點任一空房傳送；上一回合停在停機坪者第一步可飛到 H 房（201、101、B101、B103、B105）。
            {self.alive ? '' : '暗影不受地形限制，可直接點任一房間移動，也可停留不動（提交空路徑）以吸血。'}
          </p>

          {/* 自由階段操作 */}
          {room.phase === 'free' && self.alive && (
            <div style={{ border: '1px solid #334155', borderRadius: 12, padding: 14, marginTop: 12 }}>
              <h3 style={{ marginTop: 0 }}>自由階段</h3>
              {self.items && self.items.filter((it) => ['pill', 'wine', 'fine_wine', 'adrenaline', 'recycler'].includes(it.kind)).length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <span>使用道具：</span>
                  {self.items
                    .filter((it) => ['pill', 'wine', 'fine_wine', 'adrenaline', 'recycler'].includes(it.kind))
                    .map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        style={{ ...btn, margin: '4px' }}
                        disabled={busy || (it.kind === 'recycler' && room.usedPileCount === 0)}
                        onClick={() => post(`/api/games/rooms/${room.code}/use-item`, { itemId: it.id })}
                      >
                        {ITEM_NAME[it.kind]}
                        {it.kind === 'pill' && '（+2 血）'}
                        {it.kind === 'wine' && '（擲骰）'}
                        {it.kind === 'fine_wine' && '（擲骰加倍）'}
                        {it.kind === 'adrenaline' && '（下回合速度 10、傷害保底）'}
                        {it.kind === 'recycler' && `（從用掉的堆抽 1 張，剩 ${room.usedPileCount} 張）`}
                      </button>
                    ))}
                </div>
              )}
              {(self.items ?? []).some((it) => it.kind === 'gold_bar') && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ marginBottom: 6 }}>
                    金條攤開挑選：花 1 張金條，直接從目前房間（{ROOM_NAME[self.room] ?? self.room}）的物資池挑 1 項（不能挑金條，不佔抽取次數）：
                  </div>
                  {room.goldOptions.length > 0 ? (
                    room.goldOptions.map((k) => (
                      <button
                        key={k}
                        type="button"
                        style={{ ...btn, margin: '4px' }}
                        disabled={busy}
                        onClick={() => post(`/api/games/rooms/${room.code}/gold-pick`, { kind: k })}
                      >
                        花金條換「{ITEM_NAME[k] ?? k}」
                      </button>
                    ))
                  ) : (
                    <span style={{ fontSize: 14, color: '#94a3b8' }}>
                      這裡沒有可換的物資（物資池只剩金條、不是資源房，或垃圾場禁用金條），金條不會被扣。
                    </span>
                  )}
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <div style={{ marginBottom: 6 }}>交易（一物換一物，對方接受才成交）：</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    value={tradeTo}
                    onChange={(e) => {
                      setTradeTo(e.target.value);
                      setTradeWant('');
                    }}
                    style={{ minHeight: 44, borderRadius: 10, background: '#0f172a', color: '#f1f5f9', fontSize: 15 }}
                  >
                    <option value="">選對象</option>
                    {room.players
                      .filter((p) => p.alive && p.id !== self.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.isAI ? '（AI）' : ''}
                        </option>
                      ))}
                  </select>
                  <select
                    value={tradeOffer}
                    onChange={(e) => setTradeOffer(e.target.value)}
                    style={{ minHeight: 44, borderRadius: 10, background: '#0f172a', color: '#f1f5f9', fontSize: 15 }}
                  >
                    <option value="">我出</option>
                    {(self.items ?? []).map((it) => (
                      <option key={it.id} value={it.id}>
                        {ITEM_NAME[it.kind]}
                      </option>
                    ))}
                  </select>
                  <span>換</span>
                  <select
                    value={tradeWant}
                    onChange={(e) => setTradeWant(e.target.value)}
                    style={{ minHeight: 44, borderRadius: 10, background: '#0f172a', color: '#f1f5f9', fontSize: 15 }}
                  >
                    <option value="">對方出</option>
                    {tradeTo &&
                      Array.from(
                        new Set(room.players.find((p) => p.id === tradeTo)?.itemKinds ?? []),
                      ).map((k) => (
                        <option key={k} value={k}>
                          {ITEM_NAME[k] ?? k}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    style={busy || !tradeTo || !tradeOffer || !tradeWant ? btnDisabled : btn}
                    disabled={busy || !tradeTo || !tradeOffer || !tradeWant}
                    onClick={() => post(`/api/games/rooms/${room.code}/trade`, { toId: tradeTo, offerItemId: tradeOffer, wantKind: tradeWant })}
                  >
                    提出交易
                  </button>
                </div>
              </div>
              {room.trades
                .filter((t) => t.toId === self.id)
                .map((t) => (
                  <div key={t.id} style={{ marginBottom: 8 }}>
                    {t.fromName} 想用你的「{ITEM_NAME[t.wantKind] ?? t.wantKind}」換他的「{ITEM_NAME[t.offerKind] ?? t.offerKind}」
                    <button
                      type="button"
                      style={{ ...btnPrimary, marginLeft: 8 }}
                      disabled={busy}
                      onClick={() => post(`/api/games/rooms/${room.code}/trade/respond`, { tradeId: t.id, accept: true })}
                    >
                      接受
                    </button>
                    <button
                      type="button"
                      style={{ ...btn, marginLeft: 6 }}
                      disabled={busy}
                      onClick={() => post(`/api/games/rooms/${room.code}/trade/respond`, { tradeId: t.id, accept: false })}
                    >
                      拒絕
                    </button>
                  </div>
                ))}
              <button
                type="button"
                style={busy || self.ready ? btnDisabled : btnPrimary}
                disabled={busy || self.ready}
                onClick={() => post(`/api/games/rooms/${room.code}/ready`, {})}
              >
                {self.ready ? '已準備，等待其他玩家' : '準備完成，進入行動階段'}
              </button>
            </div>
          )}

          {/* 選留階段操作 */}
          {room.phase === 'keep' && self && (
            <div style={{ border: '1px solid #f59e0b', borderRadius: 12, padding: 14, marginTop: 12 }}>
              <h3 style={{ marginTop: 0 }}>🎴 抽取攤開選留</h3>
              {room.pendingDraw ? (
                <>
                  <p style={{ fontSize: 14 }}>
                    你在 {ROOM_NAME[room.pendingDraw.roomId] ?? room.pendingDraw.roomId} 攤開了{' '}
                    {room.pendingDraw.options.length} 張，點卡片決定帶不帶走。
                    {room.pendingDraw.rules.maxNonJunk !== null && `（垃圾場：非垃圾最多 ${room.pendingDraw.rules.maxNonJunk} 件）`}
                    {room.pendingDraw.rules.maxTotal !== null && `（停機坪：最多帶走 ${room.pendingDraw.rules.maxTotal} 張）`}
                    超出背包容量或上限時整筆會被拒絕，可重選；60 秒內未選由伺服器自動保留。
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {room.pendingDraw.options.map((o) => {
                      const forced = o.forced;
                      const selected = forced || keepSelected.includes(o.index);
                      return (
                        <button
                          key={o.index}
                          type="button"
                          disabled={forced}
                          style={selected ? btnPrimary : btn}
                          onClick={() =>
                            setKeepSelected(
                              keepSelected.includes(o.index)
                                ? keepSelected.filter((x) => x !== o.index)
                                : [...keepSelected, o.index],
                            )
                          }
                        >
                          {ITEM_NAME[o.kind] ?? o.kind}
                          {forced ? '（垃圾強制帶走）' : selected ? '（帶走）' : '（不帶）'}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    style={{ ...btnPrimary, marginTop: 12 }}
                    disabled={busy}
                    onClick={() => post(`/api/games/rooms/${room.code}/keep`, { keepIndexes: keepSelected })}
                  >
                    確認選留
                  </button>
                </>
              ) : (
                <p style={{ fontSize: 14 }}>
                  你已選留完畢，等待其他玩家：
                  {room.pendingDrawPlayerIds
                    .map((id) => room.players.find((p) => p.id === id)?.name ?? '?')
                    .join('、') || '無'}
                  。逾時未選者由伺服器自動保留。
                </p>
              )}
            </div>
          )}

          {/* 行動階段操作 */}
          {room.phase === 'action' && !submitted && self && (
            <div style={{ border: '1px solid #334155', borderRadius: 12, padding: 14, marginTop: 12 }}>
              <h3 style={{ marginTop: 0 }}>行動階段</h3>
              <p style={{ fontSize: 14 }}>
                路徑：{path.length > 0 ? `${self.room} → ${path.join(' → ')}` : '尚未選路'}
              </p>
              {self.alive ? (
                <>
                  <div style={{ marginBottom: 10 }}>
                    <span>秘密投票毒樓層：</span>
                    {ALL_FLOORS.map((f) => (
                      <button key={f} type="button" style={{ ...(vote === f ? btnPrimary : btn), margin: '2px' }} onClick={() => setVote(f)}>
                        {f}
                      </button>
                    ))}
                  </div>
                  {finalRoom === 'B101' && (
                    <div style={{ marginBottom: 10 }}>
                      <span>終點在控制室：</span>
                      <button type="button" style={controlMode === 'vote' ? btnPrimary : btn} onClick={() => setControlMode('vote')}>
                        本回合毒票算 10 票
                      </button>
                      <button type="button" style={controlMode === 'detox' ? btnPrimary : btn} onClick={() => setControlMode('detox')}>
                        永久解毒一房
                      </button>
                      {controlMode === 'detox' && (
                        <select
                          value={detoxTarget}
                          onChange={(e) => setDetoxTarget(e.target.value)}
                          style={{ minHeight: 44, borderRadius: 10, background: '#0f172a', color: '#f1f5f9', fontSize: 15, marginLeft: 8 }}
                        >
                          <option value="">選房間</option>
                          {ROOM_DEFS.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                  {finalRoom === 'B304' && (
                    <div style={{ marginBottom: 10 }}>
                      <span>終點在操作室，重配基因（總和須等於目前 {geneTotal}）：</span>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
                        {stepper('武力', rm, setRm)}
                        {stepper('負重', rc, setRc)}
                        {stepper('速度', rs, setRs)}
                      </div>
                      <span style={{ color: reallocValid ? '#22c55e' : '#f87171' }}>
                        總和 {rm + rc + rs} / {geneTotal}
                      </span>
                    </div>
                  )}
                  {hasRocket && (
                    <div style={{ marginBottom: 10 }}>
                      <span>火箭筒轟炸（持有才發射，可重複使用）：</span>
                      <select
                        value={rocketTarget}
                        onChange={(e) => setRocketTarget(e.target.value)}
                        style={{ minHeight: 44, borderRadius: 10, background: '#0f172a', color: '#f1f5f9', fontSize: 15, marginLeft: 8 }}
                      >
                        <option value="">不發射</option>
                        {ROOM_DEFS.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {usableItems.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <span>結算時使用（戰鬥／毒氣／水糧之後才生效）：</span>
                      {usableItems.map((it) => (
                        <label key={it.id} style={{ marginLeft: 10, fontSize: 15 }}>
                          <input
                            type="checkbox"
                            checked={itemUses.includes(it.id)}
                            onChange={(e) =>
                              setItemUses(e.target.checked ? [...itemUses, it.id] : itemUses.filter((x) => x !== it.id))
                            }
                          />{' '}
                          {ITEM_NAME[it.kind]}
                        </label>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p style={{ fontSize: 14 }}>你是暗影：不受毒氣與激光傷害，不能投票、搜刮或使用道具。與存活者同房可吸血，累積 2 血即可復活。</p>
              )}
              {self.alive && (
                <div style={{ marginBottom: 10 }}>
                  <span>結算內交易（選填：結算一開始按行動順序跑，AI 對象即判，人類對象轉自由階段待回覆）：</span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
                    <select
                      value={tradeTo}
                      onChange={(e) => {
                        setTradeTo(e.target.value);
                        setTradeWant('');
                      }}
                      style={{ minHeight: 44, borderRadius: 10, background: '#0f172a', color: '#f1f5f9', fontSize: 15 }}
                    >
                      <option value="">不交易／選對象</option>
                      {room.players
                        .filter((p) => p.alive && p.id !== self.id)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.isAI ? '（AI）' : ''}
                          </option>
                        ))}
                    </select>
                    <select
                      value={tradeOffer}
                      onChange={(e) => setTradeOffer(e.target.value)}
                      style={{ minHeight: 44, borderRadius: 10, background: '#0f172a', color: '#f1f5f9', fontSize: 15 }}
                    >
                      <option value="">我出</option>
                      {(self.items ?? []).map((it) => (
                        <option key={it.id} value={it.id}>
                          {ITEM_NAME[it.kind]}
                        </option>
                      ))}
                    </select>
                    <span>換</span>
                    <select
                      value={tradeWant}
                      onChange={(e) => setTradeWant(e.target.value)}
                      style={{ minHeight: 44, borderRadius: 10, background: '#0f172a', color: '#f1f5f9', fontSize: 15 }}
                    >
                      <option value="">對方出</option>
                      {tradeTo &&
                        Array.from(
                          new Set(room.players.find((p) => p.id === tradeTo)?.itemKinds ?? []),
                        ).map((k) => (
                          <option key={k} value={k}>
                            {ITEM_NAME[k] ?? k}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}
              <button
                type="button"
                style={busy || !canSubmitAction ? btnDisabled : btnPrimary}
                disabled={busy || !canSubmitAction}
                onClick={() =>
                  post(`/api/games/rooms/${room.code}/action`, {
                    path,
                    voteFloor: self.alive ? vote : null,
                    trade:
                      self.alive && tradeTo && tradeOffer && tradeWant
                        ? { toId: tradeTo, offerItemId: tradeOffer, wantKind: tradeWant }
                        : undefined,
                    controlChoice:
                      self.alive && finalRoom === 'B101' && controlMode
                        ? { mode: controlMode, target: controlMode === 'detox' ? detoxTarget || undefined : undefined }
                        : undefined,
                    geneRealloc: self.alive && finalRoom === 'B304' && reallocValid ? { might: rm, carry: rc, speed: rs } : undefined,
                    rocketTarget: rocketTarget || undefined,
                    itemUses: itemUses.length > 0 ? itemUses : undefined,
                  })
                }
              >
                提交行動
              </button>
              {self.alive && path.length === 0 && <span style={{ color: '#f87171', marginLeft: 8 }}>至少要走 1 步</span>}
              {self.alive && vote === '' && <span style={{ color: '#f87171', marginLeft: 8 }}>請投一票毒樓層</span>}
              {self.alive && path.length > maxSteps && (
                <span style={{ color: '#f87171', marginLeft: 8 }}>步數超過速度上限</span>
              )}
              {self.alive && finalRoom === 'B304' && !reallocValid && (
                <span style={{ color: '#f87171', marginLeft: 8 }}>重配總和必須等於目前總和</span>
              )}
            </div>
          )}
        </section>
      )}

      {/* 結算 log */}
      {room.status !== 'lobby' && (
        <section style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 20 }}>結算與戰報</h2>
          <div
            ref={logRef}
            style={{
              maxHeight: 320,
              overflowY: 'auto',
              border: '1px solid #334155',
              borderRadius: 12,
              padding: 12,
              background: '#0f172a',
              fontSize: 14,
            }}
          >
            {room.log.length === 0 && <p style={{ color: '#94a3b8' }}>還沒有戰報。</p>}
            {room.log.map((entry, i) => (
              <div key={i} style={{ color: entry.text.startsWith('──') ? '#fbbf24' : '#e2e8f0' }}>
                第 {entry.day} 天 · {entry.text}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 終局 */}
      {room.status === 'finished' && (
        <section style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 20 }}>🏆 最終排名</h2>
          <p style={{ fontSize: 14, color: '#94a3b8' }}>
            存活者優先於暗影；金條已 1:1 折算為生命（補至 10 點上限）；暗影以死前生命排在存活者之後；同分比基因武力。
          </p>
          <ol>
            {room.ranking.map((r) => {
              const p = room.players.find((x) => x.id === r.playerId);
              return (
                <li key={r.playerId} style={{ fontSize: 17, marginBottom: 6 }}>
                  第 {r.rank} 名：{p?.name ?? '?'}（最終生命 {r.finalHp}，武力 {r.might}，{r.alive ? '存活' : '暗影'}）
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            style={btn}
            onClick={() => {
              localStorage.removeItem(SESSION_KEY);
              setSession(null);
              setRoom(null);
            }}
          >
            再開一局
          </button>
        </section>
      )}
    </main>
  );
}

export default FacilityGamePage;
