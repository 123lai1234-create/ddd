// Subscriber store abstraction. Default backend = in-memory Map (per-instance).
//
// To upgrade to persistent storage (Upstash Redis REST, Vercel KV, Supabase REST,
// etc.), implement the same 5 methods and reassign `store` at the bottom of
// this file. No other code in the bot needs to change.
//
// Schema (per subscriber):
//   {
//     userId:      string,  // LINE userId, primary key
//     displayName: string,  // from getProfile (best-effort)
//     subscribedAt:number,  // ms epoch
//     muted:       boolean  // temporary opt-out without losing row
//   }

function createMemoryStore() {
  const map = new Map();

  return {
    async add(userId, displayName = "") {
      if (!userId) throw new Error("userId required");
      const existing = map.get(userId);
      const rec = {
        userId,
        displayName: displayName || existing?.displayName || "",
        subscribedAt: existing?.subscribedAt ?? Date.now(),
        muted: existing?.muted ?? false,
      };
      map.set(userId, rec);
      return rec;
    },

    async remove(userId) {
      return map.delete(userId);
    },

    async get(userId) {
      return map.get(userId) ?? null;
    },

    async list() {
      return [...map.values()];
    },

    async count() {
      return map.size;
    },
  };
}

// Future: read STORAGE_BACKEND env to switch implementations.
//   const backend = process.env.LINE_SUB_STORE ?? "memory";
//   if (backend === "upstash") store = createUpstashStore({ ... });
export const store = createMemoryStore();