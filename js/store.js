// Data layer: the Digimon dataset, the user's team, and graph helpers.
// The bundled dataset lives in data/digimon.json. Once the user edits or
// imports data, the whole working dataset is kept in localStorage.

const DATA_KEY = 'digidex.data.v1';
const TEAM_KEY = 'digidex.team.v1';

export const DEFAULT_STATS = ['HP', 'SP', 'ATK', 'DEF', 'INT', 'SPI', 'SPD'];
export const DEFAULT_STAGES = ['In-Training I', 'In-Training II', 'Rookie', 'Champion', 'Ultimate', 'Mega', 'Mega+', 'Armor'];
export const ATTRIBUTES = ['Vaccine', 'Data', 'Virus', 'Free', 'Variable', 'Unknown'];

let bundled = null;
let data = null;
let team = [];

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function slugify(name) {
  return String(name).toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'digimon';
}

export function normalize(raw) {
  if (!raw || !Array.isArray(raw.digimon)) throw new Error('Missing "digimon" array');
  const seen = new Set();
  const digimon = [];
  for (const d of raw.digimon) {
    if (!d || !d.name) continue;
    const id = d.id ? String(d.id) : slugify(d.name);
    if (seen.has(id)) continue;
    seen.add(id);
    digimon.push({ ...d, id, name: String(d.name) });
  }
  const evolutions = (raw.evolutions || [])
    .filter(e => e && seen.has(e.from) && seen.has(e.to) && e.from !== e.to)
    .map(e => ({ ...e, requirements: e.requirements || {} }));
  return {
    ...raw,
    stats: raw.stats?.length ? raw.stats : DEFAULT_STATS,
    stages: raw.stages?.length ? raw.stages : DEFAULT_STAGES,
    digimon,
    evolutions,
  };
}

export async function init() {
  try {
    const res = await fetch('data/digimon.json', { cache: 'no-cache' });
    bundled = normalize(await res.json());
  } catch (err) {
    console.error('Could not load bundled data', err);
    bundled = normalize({ digimon: [], evolutions: [] });
  }
  const saved = readJSON(DATA_KEY);
  try {
    data = saved ? normalize(saved) : structuredClone(bundled);
  } catch {
    data = structuredClone(bundled);
  }
  // A newer app dataset arrived: bring it in, keeping the user's own edits.
  if (saved && (bundled.version || 0) > (data.version || 0)) mergeBundled();
  team = readJSON(TEAM_KEY) || [];
}

export const getData = () => data;
export const hasLocalEdits = () => readJSON(DATA_KEY) !== null;

function saveData() {
  data.updated = new Date().toISOString();
  return writeJSON(DATA_KEY, data);
}

// ---- Digimon ----

export const allDigimon = () => data.digimon;
export const getDigimon = id => data.digimon.find(d => d.id === id);
export const stageIndex = stage => {
  const i = data.stages.indexOf(stage);
  return i === -1 ? data.stages.length : i;
};

export function sortDigimon(list, by = 'stage') {
  const byName = (a, b) => a.name.localeCompare(b.name);
  const byNumber = (a, b) => (a.number ?? 1e9) - (b.number ?? 1e9) || byName(a, b);
  const byStage = (a, b) => stageIndex(a.stage) - stageIndex(b.stage) || byName(a, b);
  return [...list].sort(by === 'number' ? byNumber : by === 'name' ? byName : byStage);
}

export function upsertDigimon(d, originalId) {
  const id = originalId || d.id || slugify(d.name);
  const existing = data.digimon.findIndex(x => x.id === id);
  if (existing >= 0) {
    data.digimon[existing] = { ...data.digimon[existing], ...d, id, edited: true };
  } else {
    let newId = id;
    for (let n = 2; getDigimon(newId); n++) newId = `${id}-${n}`;
    data.digimon.push({ ...d, id: newId, edited: true });
    saveData();
    return newId;
  }
  saveData();
  return id;
}

export function deleteDigimon(id) {
  data.digimon = data.digimon.filter(d => d.id !== id);
  data.evolutions = data.evolutions.filter(e => e.from !== id && e.to !== id);
  saveData();
}

// ---- Evolutions ----

export const evolutionsFrom = id => data.evolutions.filter(e => e.from === id);
export const evolutionsTo = id => data.evolutions.filter(e => e.to === id);
export const getEvolution = (from, to) => data.evolutions.find(e => e.from === from && e.to === to);

export function upsertEvolution(evo, original) {
  const key = original || evo;
  const same = (e, k) => e.from === k.from && e.to === k.to;
  const idx = data.evolutions.findIndex(e => same(e, key));
  data.evolutions = data.evolutions.filter((e, i) => i === idx || !same(e, evo));
  const at = data.evolutions.findIndex(e => same(e, key));
  if (at >= 0) data.evolutions[at] = { ...evo, edited: true };
  else data.evolutions.push({ ...evo, edited: true });
  saveData();
}

export function deleteEvolution(from, to) {
  data.evolutions = data.evolutions.filter(e => !(e.from === from && e.to === to));
  saveData();
}

// ---- Graph ----

// Digimon reachable backwards (pre-evolutions) and forwards (digivolutions)
// from `id`, up to `depth` steps each way, used to draw its line.
export function lineOf(id, depth = Infinity) {
  const ids = new Set([id]);
  const walk = next => {
    let frontier = [id];
    for (let d = 0; d < depth && frontier.length; d++) {
      const found = [];
      for (const cur of frontier) {
        for (const n of next(cur)) {
          if (!ids.has(n)) { ids.add(n); found.push(n); }
        }
      }
      frontier = found;
    }
  };
  walk(cur => evolutionsTo(cur).map(e => e.from));
  walk(cur => evolutionsFrom(cur).map(e => e.to));
  return sortDigimon([...ids].map(getDigimon).filter(Boolean));
}

// Shortest route between two Digimon. Each step is either a digivolution
// (following an evolution forwards) or a de-digivolution (backwards).
export function findPath(fromId, toId, { forwardOnly = false } = {}) {
  if (fromId === toId) return [];
  const prev = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length) {
    const cur = queue.shift();
    const steps = evolutionsFrom(cur).map(e => ({ from: cur, to: e.to, dir: 'up', evo: e }));
    if (!forwardOnly) {
      steps.push(...evolutionsTo(cur).map(e => ({ from: cur, to: e.from, dir: 'down', evo: e })));
    }
    for (const step of steps) {
      if (prev.has(step.to)) continue;
      prev.set(step.to, step);
      if (step.to === toId) {
        const path = [];
        for (let s = step; s; s = prev.get(s.from)) path.unshift(s);
        return path;
      }
      queue.push(step.to);
    }
  }
  return null;
}

// ---- Import / export ----

export function exportJSON() {
  return JSON.stringify(data, null, 2);
}

export function importJSON(text, { merge = false } = {}) {
  const incoming = normalize(JSON.parse(text));
  data = merge ? mergeData(data, incoming) : incoming;
  saveData();
  return data;
}

// Starts from `incoming` and layers on top every entry the user edited
// or added by hand in `base`. Unedited entries in `base` are replaced.
function mergeData(base, incoming) {
  const out = structuredClone(incoming);
  for (const d of base.digimon.filter(x => x.edited)) {
    const i = out.digimon.findIndex(x => x.id === d.id);
    if (i === -1) out.digimon.push(d);
    else out.digimon[i] = { ...out.digimon[i], ...d };
  }
  for (const e of base.evolutions.filter(x => x.edited)) {
    const i = out.evolutions.findIndex(x => x.from === e.from && x.to === e.to);
    if (i === -1) out.evolutions.push(e);
    else out.evolutions[i] = e;
  }
  return normalize(out);
}

export function mergeBundled() {
  data = mergeData(data, bundled);
  saveData();
}

export function resetToBundled() {
  try { localStorage.removeItem(DATA_KEY); } catch { /* ignore */ }
  data = structuredClone(bundled);
}

// ---- Team (tracked Digimon) ----

export const getTeam = () => team;
export const getMember = uid => team.find(m => m.uid === uid);

function saveTeam() {
  writeJSON(TEAM_KEY, team);
}

export function addMember({ digimonId, goalId = null, nickname = '' }) {
  const member = {
    uid: Math.random().toString(36).slice(2, 10),
    digimonId,
    goalId,
    nickname,
    level: 1,
    notes: '',
    history: [digimonId],
    added: new Date().toISOString(),
  };
  team.push(member);
  saveTeam();
  return member;
}

export function updateMember(uid, patch) {
  const m = getMember(uid);
  if (!m) return;
  Object.assign(m, patch);
  saveTeam();
}

export function moveMember(uid, toId) {
  const m = getMember(uid);
  if (!m) return;
  m.digimonId = toId;
  m.history.push(toId);
  saveTeam();
}

export function undoMove(uid) {
  const m = getMember(uid);
  if (!m || m.history.length < 2) return;
  m.history.pop();
  m.digimonId = m.history[m.history.length - 1];
  saveTeam();
}

export function removeMember(uid) {
  team = team.filter(m => m.uid !== uid);
  saveTeam();
}
