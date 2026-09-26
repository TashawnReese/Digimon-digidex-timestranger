// Settings live in localStorage; campaigns (which carry the whole chat
// history and can get large) live in IndexedDB.

const SETTINGS_KEY = 'mq-settings';
const DEFAULTS = {
  apiKey: '',
  model: 'claude-opus-5',
  artStyle: 'anime',
  images: 'on',
  length: 'medium',
  rating: 'teen',
};

let settingsCache;

export function getSettings() {
  if (!settingsCache) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { /* private mode */ }
    settingsCache = { ...DEFAULTS, ...saved };
  }
  return settingsCache;
}

export function saveSettings(patch) {
  settingsCache = { ...getSettings(), ...patch };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsCache)); } catch { /* ignore */ }
  return settingsCache;
}

// ---------- IndexedDB ----------

let dbPromise;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('multiverse-quest', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('campaigns', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction('campaigns', mode);
    const req = fn(t.objectStore('campaigns'));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export const listCampaigns = async () =>
  ((await tx('readonly', s => s.getAll())) || []).sort((a, b) => b.updatedAt - a.updatedAt);
export const getCampaign = id => tx('readonly', s => s.get(id));
export const deleteCampaign = id => tx('readwrite', s => s.delete(id));
export function saveCampaign(c) {
  c.updatedAt = Date.now();
  // structuredClone drops anything IndexedDB can't store (and detaches us
  // from later in-memory edits while the write is in flight).
  return tx('readwrite', s => s.put(structuredClone(c)));
}

export const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
