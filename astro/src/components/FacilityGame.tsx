import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

// 「封鎖設施求生」多人連線遊戲前端。
// 原創遊戲，玩法致敬公開規則頁「禁閉逃殺」的核心機制
// （基因配點、六天循環、毒樓層投票、同房戰鬥、暗影復活），
// 名稱、文案、地圖皆為本站自訂。
// 伺服器權威狀態：前端每 2 秒輪詢 /api/games/rooms/:code，不用 WebSocket。
// 房間是短暫的（後端重啟就消失），房間碼就是入場憑證，不需登入。

type FloorId = '2F' | '1F' | 'B1';

interface Item {
  id: string;
  kind: string;
}

interface PlayerView {
  id: string;
  name: string;
  isAI: boolean;
  isHost: boolean;
  might: number;
  carry: number;
  speed: number;
  speedBoost: number;
  hp: number;
  alive: boolean;
  shadowHp: number;
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

interface RoomView {
  code: string;
  status: 'lobby' | 'playing' | 'finished';
  day: number;
  phase: 'free' | 'action';
  players: PlayerView[];
  submittedCount: number;
  submittedPlayerIds: string[];
  lootedRooms: string[];
  detoxedRooms: string[];
  morgueCount: number;
  log: { day: number; text: string }[];
  trades: TradeView[];
  ranking: { playerId: string; finalHp: number; might: number; alive: boolean; rank: number }[];
  selfId: string | null;
}

interface Session {
  code: string;
  playerId: string;
  token: string;
}

const SESSION_KEY = 'facility-game-session';
const POLL_MS = 2000;

const ROOM_DEFS: { id: string; floor: FloorId; name: string; kind: string; spawn: boolean }[] = [
  { id: '201', floor: '2F', name: '201 空房', kind: 'empty', spawn: true },
  { id: '202', floor: '2F', name: '202 激光室', kind: 'laser', spawn: false },
  { id: '203', floor: '2F', name: '203 樓梯間', kind: 'stairs', spawn: true },
  { id: '204', floor: '2F', name: '204 傳送室', kind: 'teleport', spawn: false },
  { id: '205', floor: '2F', name: '205 空房', kind: 'empty', spawn: true },
  { id: '101', floor: '1F', name: '101 空房', kind: 'empty', spawn: true },
  { id: '102', floor: '1F', name: '102 水塔', kind: 'water', spawn: false },
  { id: '103', floor: '1F', name: '103 糧倉', kind: 'food', spawn: false },
  { id: '104', floor: '1F', name: '104 樓梯間', kind: 'stairs', spawn: true },
  { id: '105', floor: '1F', name: '105 手術室', kind: 'surgery', spawn: false },
  { id: 'B101', floor: 'B1', name: 'B101 控制室', kind: 'control', spawn: false },
  { id: 'B102', floor: 'B1', name: 'B102 空房', kind: 'empty', spawn: true },
  { id: 'B103', floor: 'B1', name: 'B103 停屍間', kind: 'morgue', spawn: false },
  { id: 'B104', floor: 'B1', name: 'B104 樓梯間', kind: 'stairs', spawn: true },
  { id: 'B105', floor: 'B1', name: 'B105 武器庫', kind: 'weapons', spawn: false },
];

const ROOM_NAME: Record<string, string> = Object.fromEntries(ROOM_DEFS.map((r) => [r.id, r.name]));
const ROOM_KIND: Record<string, string> = Object.fromEntries(ROOM_DEFS.map((r) => [r.id, r.kind]));

// 同層左右相鄰＋樓梯跨層（與後端 ADJACENCY 一致）
const ADJ: Record<string, string[]> = (() => {
  const adj: Record<string, string[]> = {};
  for (const r of ROOM_DEFS) adj[r.id] = [];
  const link = (a: string, b: string) => {
    adj[a]?.push(b);
    adj[b]?.push(a);
  };
  const rows = [
    ['201', '202', '203', '204', '205'],
    ['101', '102', '103', '104', '105'],
    ['B101', 'B102', 'B103', 'B104', 'B105'],
  ];
  for (const row of rows) {
    for (let i = 0; i < row.length - 1; i++) link(row[i] as string, row[i + 1] as string);
  }
  link('203', '104');
  link('104', 'B104');
  return adj;
})();

const ITEM_NAME: Record<string, string> = {
  water: '水',
  food: '糧食',
  supply: '生存補給',
  gold: '金條',
  knife: '刀',
  pistol: '手槍',
  rifle: '步槍',
  medicine: '急救藥片',
  wine: '美酒',
  adrenaline: '腎上腺素',
};

const KIND_DESC: Record<string, string> = {
  laser: '經過扣 1 血',
  teleport: '經過可傳送到空房',
  water: '產水',
  food: '產糧',
  weapons: '產刀／槍',
  surgery: '剛好 2 人時勝者吸 2 血',
  control: '終點在此可解毒一房',
  morgue: '暗影掉落物在此',
  stairs: '可跨層',
  empty: '可搜刮',
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
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // 大廳配點
  const [might, setMight] = useState(4);
  const [carry, setCarry] = useState(3);
  const [speed, setSpeed] = useState(3);
  const [spawn, setSpawn] = useState('201');
  // 行動階段
  const [path, setPath] = useState<string[]>([]);
  const [vote, setVote] = useState<FloorId | ''>('');
  const [teleportTo, setTeleportTo] = useState('');
  const [detoxRoom, setDetoxRoom] = useState('');
  // 交易
  const [tradeTo, setTradeTo] = useState('');
  const [tradeOffer, setTradeOffer] = useState('');
  const [tradeWant, setTradeWant] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = '封鎖設施求生｜多人連線生存遊戲';
  }, []);

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
    setTeleportTo('');
    setDetoxRoom('');
  }, [phaseKey]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [room?.log.length]);

  const self = room?.players.find((p) => p.id === room.selfId) ?? null;

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
    if (!name.trim()) {
      setError('請先輸入名字');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = (await api('/api/games/rooms', { name: name.trim() })) as {
        code: string;
        playerId: string;
        token: string;
        room: RoomView;
      };
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
    if (!name.trim() || !joinCode.trim()) {
      setError('請輸入名字與房間碼');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = (await api(`/api/games/rooms/${joinCode.trim().toUpperCase()}/join`, {
        name: name.trim(),
      })) as { playerId: string; token: string; room: RoomView };
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

  const wrap: CSSProperties = {
    maxWidth: 860,
    margin: '0 auto',
    padding: '20px 14px 60px',
    color: '#e2e8f0',
    fontSize: 16,
    lineHeight: 1.6,
  };

  if (!session || !room) {
    return (
      <main style={wrap}>
        <a href="#main-content" className="skip-link" style={{ display: 'none' }}>
          跳至主要內容
        </a>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>封鎖設施求生</h1>
        <p style={{ color: '#94a3b8' }}>
          4 名玩家受困於 3 層設施，撐過 6 天。配點、搜刮水糧、投票毒樓層、同房戰鬥，死後化為暗影還能吸血復活。
          本遊戲為原創作品，玩法致敬公開規則的生存桌遊核心機制。
        </p>
        <p style={{ color: '#f59e0b', fontSize: 14 }}>
          注意：房間存在伺服器記憶體裡，伺服器重啟房間就會消失；房間碼就是入場憑證，不要公開給不想一起玩的人。
        </p>
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
  // 暗影不受地形阻礙：可走到任一未去過的房間；存活者只能走相鄰房
  const candidates = new Set(
    self && !self.alive
      ? ROOM_DEFS.map((r) => r.id).filter((r) => !visited.has(r))
      : (ADJ[pathLast] ?? []).filter((r) => !visited.has(r)),
  );
  const maxSteps = (self?.speed ?? 0) + (self?.speedBoost ?? 0);
  const finalRoom = teleportTo || (path.length > 0 ? (path[path.length - 1] as string) : pathStart);
  const passesTeleport = path.some((r) => ROOM_KIND[r] === 'teleport');
  const canSubmitAction =
    self &&
    room.phase === 'action' &&
    !submitted &&
    (self.alive ? path.length >= 1 && path.length <= maxSteps && vote !== '' : true);

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

  return (
    <main style={wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>封鎖設施求生</h1>
        <button type="button" style={btn} onClick={leaveRoom}>
          離開房間
        </button>
      </div>
      <p style={{ color: '#94a3b8' }}>
        房間碼：<strong style={{ color: '#fbbf24', fontSize: 22, letterSpacing: 2 }}>{room.code}</strong>
        {room.status === 'playing' && (
          <>
            {' '}
            · 第 {room.day} / 6 天 · {room.phase === 'free' ? '自由階段' : '行動階段'}
          </>
        )}
        {room.status === 'finished' && ' · 遊戲結束'}
      </p>
      {error && (
        <p role="alert" style={{ color: '#f87171' }}>
          {error}
        </p>
      )}

      {/* 玩家面板 */}
      <section aria-label="玩家狀態" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
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
            <div style={{ fontSize: 14, color: '#94a3b8' }}>
              {p.alive ? `❤️ ${p.hp} / 10` : `👻 暗影（累積 ${p.shadowHp} 血）`}
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
              {room.status === 'lobby' && (p.hasSetup ? '✅ 已配點' : '⏳ 尚未配點')}
            </div>
          </div>
        ))}
      </section>

      {/* 大廳：配點＋出生點 */}
      {room.status === 'lobby' && self && (
        <section style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 20 }}>角色創建</h2>
          <p style={{ fontSize: 14, color: '#94a3b8' }}>
            武力／負重／速度總和必須剛好 10 點，速度至少 1 點。負重是背包上限（含武器）；速度是每回合最多步數。
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
                開始遊戲（未滿 4 人由 AI 補滿）
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
          {(['2F', '1F', 'B1'] as FloorId[]).map((floor) => (
            <div key={floor} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {floor === '2F' ? '頂樓 2F' : floor === '1F' ? '地面 1F' : '地下 B1'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                {ROOM_DEFS.filter((r) => r.floor === floor).map((r) => {
                  const occupants = room.players.filter((p) => p.room === r.id);
                  const isCurrent = self.room === r.id;
                  const isLastPath = path.length > 0 && path[path.length - 1] === r.id;
                  const clickable = room.phase === 'action' && !submitted && (candidates.has(r.id) || isLastPath);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      disabled={!clickable}
                      onClick={() => {
                        if (isLastPath) setPath(path.slice(0, -1));
                        else if (candidates.has(r.id)) setPath([...path, r.id]);
                      }}
                      style={{
                        minHeight: 64,
                        padding: '6px 4px',
                        borderRadius: 10,
                        border: isCurrent ? '2px solid #0e7490' : isLastPath ? '2px solid #f59e0b' : '1px solid #334155',
                        background: room.lootedRooms.includes(r.id) ? '#1e293b' : '#0f172a',
                        color: '#f1f5f9',
                        cursor: clickable ? 'pointer' : 'default',
                        opacity: clickable || isCurrent || occupants.length > 0 ? 1 : 0.75,
                        fontSize: 13,
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{KIND_DESC[r.kind]}</div>
                      {occupants.length > 0 && (
                        <div style={{ fontSize: 12, color: '#fbbf24' }}>{occupants.map((p) => p.name).join('、')}</div>
                      )}
                      {room.lootedRooms.includes(r.id) && <div style={{ fontSize: 11 }}>已搜刮</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p style={{ fontSize: 13, color: '#94a3b8' }}>
            點相鄰房間前進（黃框為路徑最後一格，再點一次可退回）；每回合至少走 1 步、不可重複進房；樓梯間可跨層。
            {self.alive ? '' : '暗影不受地形限制，可直接點任一房間移動，也可停留不動（提交空路徑）以吸血。'}
          </p>

          {/* 自由階段操作 */}
          {room.phase === 'free' && self.alive && (
            <div style={{ border: '1px solid #334155', borderRadius: 12, padding: 14, marginTop: 12 }}>
              <h3 style={{ marginTop: 0 }}>自由階段</h3>
              {self.items && self.items.filter((it) => ['medicine', 'wine', 'adrenaline'].includes(it.kind)).length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <span>使用道具：</span>
                  {self.items
                    .filter((it) => ['medicine', 'wine', 'adrenaline'].includes(it.kind))
                    .map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        style={{ ...btn, margin: '4px' }}
                        disabled={busy}
                        onClick={() => post(`/api/games/rooms/${room.code}/use-item`, { itemId: it.id })}
                      >
                        {ITEM_NAME[it.kind]}
                        {it.kind === 'medicine' && '（+2 血）'}
                        {it.kind === 'wine' && '（+1 血）'}
                        {it.kind === 'adrenaline' && '（今天速度 +1）'}
                      </button>
                    ))}
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

          {/* 行動階段操作 */}
          {room.phase === 'action' && !submitted && self && (
            <div style={{ border: '1px solid #334155', borderRadius: 12, padding: 14, marginTop: 12 }}>
              <h3 style={{ marginTop: 0 }}>行動階段</h3>
              <p style={{ fontSize: 14 }}>
                路徑：{path.length > 0 ? `${self.room} → ${path.join(' → ')}` : '尚未選路'}
                {teleportTo && ` → 🌀 ${ROOM_NAME[teleportTo]}`}
              </p>
              {self.alive ? (
                <>
                  <div style={{ marginBottom: 10 }}>
                    <span>秘密投票毒樓層：</span>
                    {(['2F', '1F', 'B1'] as FloorId[]).map((f) => (
                      <button key={f} type="button" style={vote === f ? btnPrimary : btn} onClick={() => setVote(f)}>
                        {f === '2F' ? '頂樓 2F' : f === '1F' ? '地面 1F' : '地下 B1'}
                      </button>
                    ))}
                  </div>
                  {passesTeleport && (
                    <div style={{ marginBottom: 10 }}>
                      <span>經過傳送室，傳送到空房：</span>
                      <select
                        value={teleportTo}
                        onChange={(e) => setTeleportTo(e.target.value)}
                        style={{ minHeight: 44, borderRadius: 10, background: '#0f172a', color: '#f1f5f9', fontSize: 15 }}
                      >
                        <option value="">不傳送（留在原終點）</option>
                        {ROOM_DEFS.filter((r) => r.kind === 'empty').map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {finalRoom === 'B101' && (
                    <div style={{ marginBottom: 10 }}>
                      <span>終點在控制室，解毒一間房：</span>
                      <select
                        value={detoxRoom}
                        onChange={(e) => setDetoxRoom(e.target.value)}
                        style={{ minHeight: 44, borderRadius: 10, background: '#0f172a', color: '#f1f5f9', fontSize: 15 }}
                      >
                        <option value="">不解毒</option>
                        {ROOM_DEFS.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              ) : (
                <p style={{ fontSize: 14 }}>你是暗影：不受毒氣與激光傷害，不能投票、搜刮或使用道具。與存活者同房可吸血，累積 2 血即可復活。</p>
              )}
              <button
                type="button"
                style={busy || !canSubmitAction ? btnDisabled : btnPrimary}
                disabled={busy || !canSubmitAction}
                onClick={() =>
                  post(`/api/games/rooms/${room.code}/action`, {
                    path,
                    voteFloor: self.alive ? vote : null,
                    teleportTo: teleportTo || undefined,
                    detoxRoom: detoxRoom || undefined,
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
            存活者優先於暗影；金條已 1:1 折算為生命（補至 10 點上限）；同生命比基因武力，再相同並列。
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
