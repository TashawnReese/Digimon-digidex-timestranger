// The AI side of the game: character creation and the Game Master turn loop.
// Calls Claude directly from the browser with the player's own API key.
import { getSettings } from './store.js';
import { RULES_STYLES } from './presets.js';

export const MODELS = {
  'claude-opus-5': 'Claude Opus 5 (best storytelling)',
  'claude-sonnet-5': 'Claude Sonnet 5 (faster, cheaper)',
  'claude-haiku-4-5': 'Claude Haiku 4.5 (fastest, cheapest)',
};

export class GMError extends Error {}

// The SDK is loaded on first use so the rest of the app never waits on it.
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.128.0/+esm';
let Anthropic = null;
let sdkPromise = null;

function loadSDK() {
  sdkPromise ??= import(SDK_URL)
    .then(m => (Anthropic = m.default))
    .catch(() => {
      sdkPromise = null;
      throw new GMError('Could not load the AI library. Check your connection and try again.');
    });
  return sdkPromise;
}

async function client() {
  const { apiKey } = getSettings();
  if (!apiKey) throw new GMError('Add your Anthropic API key in Settings to start playing.');
  await loadSDK();
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

const isAPIError = err => !!Anthropic && err instanceof Anthropic.APIError;

// Model-specific request options. Opus 5 opts into server-side fallbacks so a
// safety-classifier decline is retried on another model instead of failing.
function baseParams(effort = 'medium') {
  const { model } = getSettings();
  const p = { model, max_tokens: model === 'claude-haiku-4-5' ? 32000 : 64000 };
  if (model !== 'claude-haiku-4-5') {
    p.thinking = { type: 'adaptive' };
    p.output_config = { effort };
  }
  if (model === 'claude-opus-5') {
    p.betas = ['server-side-fallback-2026-07-01'];
    p.fallbacks = 'default';
  }
  return p;
}

export function friendlyError(err) {
  if (err instanceof GMError || !Anthropic) return err?.message || String(err);
  if (err instanceof Anthropic.AuthenticationError) return 'Your API key was rejected. Check it in Settings.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'Your API key does not have access to this model. Try another model in Settings.';
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited by the API. Wait a moment and try again.';
  if (err instanceof Anthropic.BadRequestError) return `The API rejected the request: ${err.message}`;
  if (err instanceof Anthropic.InternalServerError) return 'The AI service is having trouble (server error). Try again shortly.';
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the AI service. Check your connection.';
  if (err instanceof Anthropic.APIError) return `AI service error: ${err.message}`;
  return err?.message || String(err);
}

// After a mid-output fallback, blocks the declined model produced before the
// last `fallback` marker must not be echoed back (except text).
function sanitizeContent(content) {
  const last = content.map(b => b.type).lastIndexOf('fallback');
  if (last === -1) return content;
  return content.filter((b, i) =>
    i > last || (i < last && b.type === 'text'));
}

function textOf(message) {
  return message.content.filter(b => b.type === 'text').map(b => b.text).join('');
}

async function structured(system, prompt, schema, { effort = 'medium', onProgress } = {}) {
  const base = baseParams(effort);
  const stream = (await client()).beta.messages.stream({
    ...base,
    output_config: { ...base.output_config, format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: prompt }],
  });
  let chars = 0;
  if (onProgress) stream.on('text', d => onProgress((chars += d.length)));
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new GMError('The AI declined to create that. Try rewording your idea.');
  if (msg.stop_reason === 'max_tokens') throw new GMError('The response was cut off. Try again.');
  return JSON.parse(textOf(msg));
}

// ---------- character creation ----------

const obj = (properties, required = Object.keys(properties)) =>
  ({ type: 'object', properties, required, additionalProperties: false });
const str = description => ({ type: 'string', description });
const int = description => ({ type: 'integer', description });
const arr = items => ({ type: 'array', items });

const CHARACTER_SCHEMA = obj({
  name: str('Character name'),
  title: str('Short epithet or class title, e.g. "Wielder of the Kingdom Key"'),
  source: str('Franchise, game or genre this character draws from'),
  concept: str('One-sentence pitch'),
  appearance: str('Vivid physical description, 1-2 sentences'),
  personality: str('1-2 sentences'),
  backstory: str('3-5 sentences'),
  level: int('Starting level, usually 1'),
  stats: arr(obj({ name: str('Stat name, using the source\'s own terms where it has them'), abbr: str('2-4 letter abbreviation'), value: int('Value on the scale the core rules describe'), note: str('What it governs, a few words') })),
  resources: arr(obj({ name: str('e.g. HP, MP, Reiatsu, Chakra, Force'), current: int(''), max: int(''), color: str('Hex color for the bar, e.g. #e5484d') })),
  abilities: arr(obj({ name: str(''), kind: { type: 'string', enum: ['attack', 'spell', 'skill', 'passive', 'ultimate'] }, cost: str('Resource cost or limit, e.g. "8 MP" or "once per rest" or "free"'), description: str('What it does in play, with numbers') })),
  signature: obj({ name: str('The character\'s defining mechanic, e.g. Persona, Bankai, Drive Form, Stand'), description: str('How it works in rules terms') }),
  inventory: arr(obj({ name: str(''), description: str('') })),
  portrait_prompt: str('Image prompt for a portrait of this character: appearance, outfit, pose, setting. No names of real people.'),
  world: obj({
    name: str('Name of the setting'),
    premise: str('2-3 sentences on the setting and what is at stake'),
    opening_hook: str('The situation the adventure opens with, 1-2 sentences'),
    scene_prompt: str('Image prompt for the opening scene'),
  }),
  rules: arr(obj({ name: str('Rule name'), category: { type: 'string', enum: ['core', 'combat', 'magic', 'signature', 'social', 'advancement', 'world'] }, text: str('The rule, concise and playable') })),
});

const FORGE_SYSTEM = `You design characters and bespoke rule systems for a solo text role-playing game run by an AI Game Master. Players can pick anything: a class from classic fantasy, a character type from any anime, video game, film, book or comic, a crossover, or something original.

Capture what makes the source feel like itself: use its terminology, power system, strengths, weaknesses and signature moves, translated into simple, playable tabletop-style rules. The core resolution rule must say exactly how a check works (for example "roll d20 + stat modifier vs a target number set by the GM; 10 easy, 15 hard, 20 heroic") and stat values must fit that scale. Give 4-6 stats, 1-4 resources with the health-like one first, 4-7 abilities with concrete numbers, one signature mechanic, 3-6 inventory items, and 5-8 rules covering core resolution, combat, the signature mechanic and advancement, plus anything the source needs. Make the starting character capable but with room to grow.`;

export function forgeCharacter({ concept, name, setting, tone, rulesStyle, extra }, onProgress) {
  const prompt = [
    `Character concept: ${concept}`,
    name && `Name: ${name}`,
    setting ? `Setting: ${setting}` : 'Setting: pick the one that fits the concept best (the source\'s own world, or an original one in its spirit).',
    `Tone: ${tone}`,
    `Rules style: ${RULES_STYLES[rulesStyle] || RULES_STYLES.balanced}`,
    extra && `Player notes: ${extra}`,
  ].filter(Boolean).join('\n');
  return structured(FORGE_SYSTEM, prompt, CHARACTER_SCHEMA, { onProgress });
}

const SURPRISE_SCHEMA = obj({
  concept: str('A fun, specific character concept, 1-2 sentences, naming the franchise or genre it draws from'),
  setting: str('Where the adventure takes place, one sentence'),
  tone: str('One word tone'),
});

export function surpriseConcept(avoid = []) {
  return structured(
    'You pitch fun, surprising role-playing character concepts. Mix it up: sometimes a character type from a popular anime, video game, film or comic, sometimes a strange crossover, sometimes an original twist on a classic fantasy class.',
    `Pitch one character concept.${avoid.length ? ` Avoid these recent ideas: ${avoid.join('; ')}` : ''}`,
    SURPRISE_SCHEMA,
    { effort: 'low' },
  );
}

// ---------- Game Master ----------

const LENGTHS = {
  short: 'Keep each reply short: about 60-120 words of narration.',
  medium: 'Keep each reply to about 120-250 words of narration.',
  long: 'Write rich replies of about 250-450 words of narration.',
};

const RATINGS = {
  family: 'Keep content family friendly: peril and adventure, no gore, no romance beyond hand-holding.',
  teen: 'Content is rated Teen: action violence, danger and mature themes are fine; no graphic gore or explicit content.',
  mature: 'Content is for adults: dark themes, horror and brutal violence are allowed when the story calls for it; no explicit sexual content.',
};

function sheetText(c) {
  const lines = [
    `Name: ${c.name} — ${c.title}`,
    `Source/inspiration: ${c.source}`,
    `Concept: ${c.concept}`,
    `Appearance: ${c.appearance}`,
    `Personality: ${c.personality}`,
    `Backstory: ${c.backstory}`,
    `Level: ${c.level}`,
    `Stats: ${c.stats.map(s => `${s.name} (${s.abbr}) ${s.value} — ${s.note}`).join('; ')}`,
    `Resources: ${c.resources.map(r => `${r.name} ${r.current}/${r.max}`).join('; ')}`,
    `Signature — ${c.signature.name}: ${c.signature.description}`,
    'Abilities:',
    ...c.abilities.map(a => `- ${a.name} [${a.kind}, ${a.cost}]: ${a.description}`),
    `Inventory: ${c.inventory.map(i => i.name).join(', ')}`,
  ];
  return lines.join('\n');
}

export function gmSystem(campaign) {
  const s = getSettings();
  const { initial } = campaign;
  return `You are the Game Master of a solo, text-based tabletop role-playing game, played in an app. The player's character can come from any franchise, game, anime, book or tradition, or be completely original. Run the game in the spirit of that source: its tone, its power system, its kinds of threats and allies.

# How to run the game
- Narrate in second person, present tense, with vivid sensory detail and distinct NPC voices. Use *italics* and **bold** sparingly; no headings or lists in narration. ${LENGTHS[s.length] || LENGTHS.medium}
- The player decides what their character does and says. Never act or speak for them beyond what they wrote. End each reply on a moment that invites a choice.
- Be a fan of the character: give them chances to shine, but let choices have real consequences. Keep a steady mix of exploration, social scenes, puzzles and combat.
- ${RATINGS[s.rating] || RATINGS.teen}
- Text in [square brackets] or starting with "OOC:" is the player talking to you out of character. Answer it directly without advancing the story, using tools if it asks for something (such as a picture).
- Text in (parentheses) starting with "GM:" is a direction for the story, such as asking for a twist, a new character or a crossover. Make it happen within the fiction.

# Rules
- Use the rules below. When the outcome of an action is uncertain and matters, call roll_dice (the app rolls real dice) with the right modifier and a target number, then narrate the result that comes back. Don't roll for trivial actions. Describe what's at stake before the roll.
- When the player tries something the rules don't cover — a new power, a crossover item, an unusual tactic — invent a fair, flavorful rule on the spot, record it with create_rule, and apply it consistently from then on. Powers need costs, limits or risks so the game stays fun.
- Crossover elements from other franchises are welcome; weave them in believably.
- If the character hits 0 in their health-like resource, don't end the story: they are defeated, captured, or saved at a price.

# Record-keeping tools
Only roll_dice pauses your reply for a result. The other tools just update the app, so call them together at the very end of a reply, after the narration is finished:
- update_character for every change to resources, stats, items, abilities, conditions, XP or level.
- update_journal when the location changes, a quest starts or ends, or an important NPC appears.
- show_image when something worth seeing appears: a new location, a key NPC, a monster, a treasure, a dramatic moment. Aim for roughly one image every two or three replies, and one whenever the player asks. Prompts describe only what is visible, never names or text; include the hero's appearance when they're in the shot.
- suggest_actions last in every reply: 3-4 short, varied options (bold, careful, clever, social) the player can tap.

The <state> block in each player message is the app's current record of the character and is authoritative.

# The world
${initial.world.name}: ${initial.world.premise}
Opening hook: ${initial.world.opening_hook}

# The player character
${sheetText(initial.character)}

# The rules of this game
${initial.rules.map(r => `- ${r.name} (${r.category}): ${r.text}`).join('\n')}`;
}

const TOOLS = [
  {
    name: 'roll_dice',
    description: 'Roll dice for an uncertain action. The app rolls real dice, shows them to the player, and returns the result. Wait for the result before narrating the outcome.',
    input_schema: obj({
      notation: str('Dice notation such as "d20+3", "2d6+1" or "4d6"'),
      reason: str('What the roll is for, shown to the player, e.g. "Athletics to leap the chasm"'),
      target: int('Number to meet or beat for success. Omit for damage or other rolls with no target.'),
      mode: { type: 'string', enum: ['normal', 'advantage', 'disadvantage'], description: 'Advantage rolls twice and keeps the best total; disadvantage keeps the worst' },
    }, ['notation', 'reason']),
  },
  {
    name: 'update_character',
    description: 'Record changes to the player character. Call at the end of a reply.',
    input_schema: obj({
      resources: arr(obj({ name: str('Resource name, e.g. HP'), delta: int('Change, negative for loss'), max: int('New maximum, only when it changes or when creating a new resource') }, ['name'])),
      stats: arr(obj({ name: str(''), value: int('New value') })),
      add_items: arr(obj({ name: str(''), description: str('') })),
      remove_items: arr(str('Item name')),
      add_abilities: arr(obj({ name: str(''), kind: { type: 'string', enum: ['attack', 'spell', 'skill', 'passive', 'ultimate'] }, cost: str(''), description: str('') })),
      add_conditions: arr(str('e.g. "Poisoned (1d4 per turn, 3 turns)"')),
      remove_conditions: arr(str('')),
      xp: int('XP gained'),
      level: int('New level, only on level up'),
    }, []),
  },
  {
    name: 'create_rule',
    description: 'Add a new rule to the game\'s codex, or update an existing one with the same name. Use when inventing mechanics on the fly.',
    input_schema: obj({
      name: str('Rule name'),
      category: { type: 'string', enum: ['core', 'combat', 'magic', 'signature', 'social', 'advancement', 'world'] },
      text: str('The rule, concise and playable'),
    }),
  },
  {
    name: 'show_image',
    description: 'Generate and show the player an illustration. Call at the end of a reply.',
    input_schema: obj({
      kind: { type: 'string', enum: ['scene', 'character', 'creature', 'item', 'moment'], description: '"scene" also becomes the backdrop of the story view' },
      title: str('Short caption, e.g. "The Twilight Town clock tower"'),
      prompt: str('Detailed visual description for an image model: subject, setting, lighting, composition. No names or text.'),
    }),
  },
  {
    name: 'update_journal',
    description: 'Update the quest journal. Call at the end of a reply.',
    input_schema: obj({
      location: str('Current location name'),
      add_quests: arr(obj({ title: str(''), note: str('') })),
      complete_quests: arr(str('Quest title')),
      add_npcs: arr(obj({ name: str(''), note: str('Who they are, attitude toward the hero') })),
    }, []),
  },
  {
    name: 'suggest_actions',
    description: 'Offer the player 3-4 short action suggestions they can tap. Call last in every reply.',
    input_schema: obj({ actions: arr(str('A short action, under 10 words')) }),
  },
].map(t => ({ ...t, eager_input_streaming: true }));

// ---------- tool execution ----------

const isStr = v => typeof v === 'string' && v.trim() !== '';
const isInt = v => Number.isInteger(v);
const listOf = (v, check) => v === undefined || (Array.isArray(v) && v.every(check));

function rollDie(sides) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % sides) + 1;
}

export function rollDice(notation, mode = 'normal') {
  const m = /^\s*(\d*)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*$/i.exec(notation || '');
  if (!m) return null;
  const count = Math.min(Math.max(parseInt(m[1] || '1', 10), 1), 50);
  const sides = Math.min(Math.max(parseInt(m[2], 10), 2), 1000);
  const mod = m[3] ? (m[3] === '-' ? -1 : 1) * parseInt(m[4], 10) : 0;
  const once = () => Array.from({ length: count }, () => rollDie(sides));
  let rolls = once();
  let other = null;
  if (mode === 'advantage' || mode === 'disadvantage') {
    other = once();
    const sum = r => r.reduce((a, b) => a + b, 0);
    const better = sum(other) > sum(rolls);
    if ((mode === 'advantage') === better) [rolls, other] = [other, rolls];
  }
  const total = rolls.reduce((a, b) => a + b, 0) + mod;
  const natural = count === 1 && sides === 20 ? rolls[0] : null;
  return { notation: `${count}d${sides}${mod ? (mod > 0 ? '+' : '') + mod : ''}`, rolls, dropped: other, modifier: mod, total, natural };
}

function findByName(list, name) {
  const n = String(name).trim().toLowerCase();
  return list.find(x => x.name.toLowerCase() === n);
}

export function stateSnapshot(campaign) {
  const c = campaign.character;
  return {
    level: c.level,
    xp: c.xp || 0,
    resources: Object.fromEntries(c.resources.map(r => [r.name, `${r.current}/${r.max}`])),
    stats: Object.fromEntries(c.stats.map(s => [s.name, s.value])),
    conditions: c.conditions || [],
    inventory: c.inventory.map(i => i.name),
    abilities: c.abilities.map(a => a.name),
    location: campaign.journal.location || '',
    active_quests: campaign.journal.quests.filter(q => q.status === 'active').map(q => q.title),
  };
}

const TOOL_HANDLERS = {
  roll_dice(campaign, input, ui) {
    if (!isStr(input.notation) || !isStr(input.reason)) throw new Error('notation and reason are required strings');
    if (input.target !== undefined && !isInt(input.target)) throw new Error('target must be an integer');
    const r = rollDice(input.notation, input.mode);
    if (!r) throw new Error(`Could not parse dice notation "${input.notation}". Use forms like d20+3 or 2d6.`);
    const result = { ...r, reason: input.reason, mode: input.mode || 'normal' };
    if (isInt(input.target)) {
      result.target = input.target;
      result.success = r.total >= input.target;
    }
    if (r.natural === 20) result.critical = 'natural 20';
    if (r.natural === 1) result.critical = 'natural 1';
    ui.log({ type: 'dice', ...result });
    const { dropped, ...forModel } = result;
    return forModel;
  },

  update_character(campaign, input, ui) {
    const c = campaign.character;
    const ok = listOf(input.resources, r => isStr(r?.name) && (r.delta === undefined || isInt(r.delta)) && (r.max === undefined || isInt(r.max)))
      && listOf(input.stats, s => isStr(s?.name) && isInt(s.value))
      && listOf(input.add_items, i => isStr(i?.name))
      && listOf(input.remove_items, isStr)
      && listOf(input.add_abilities, a => isStr(a?.name))
      && listOf(input.add_conditions, isStr)
      && listOf(input.remove_conditions, isStr)
      && (input.xp === undefined || isInt(input.xp))
      && (input.level === undefined || isInt(input.level));
    if (!ok) throw new Error('Input does not match the schema');

    const changes = [];
    for (const r of input.resources || []) {
      let res = findByName(c.resources, r.name);
      if (!res) {
        if (!isInt(r.max)) continue;
        res = { name: r.name, current: r.max, max: r.max, color: '#8b7bff' };
        c.resources.push(res);
        changes.push({ kind: 'gain', text: `New resource: ${r.name}` });
      }
      if (isInt(r.max)) res.max = r.max;
      const before = res.current;
      res.current = Math.max(0, Math.min(res.max, res.current + (r.delta || 0)));
      const d = res.current - before;
      if (d) changes.push({ kind: d > 0 ? 'gain' : 'loss', text: `${res.name} ${d > 0 ? '+' : ''}${d} (${res.current}/${res.max})` });
    }
    for (const s of input.stats || []) {
      const st = findByName(c.stats, s.name);
      if (st) { changes.push({ kind: s.value >= st.value ? 'gain' : 'loss', text: `${st.name} ${st.value} → ${s.value}` }); st.value = s.value; }
    }
    for (const i of input.add_items || []) {
      c.inventory.push({ name: i.name, description: i.description || '' });
      changes.push({ kind: 'gain', text: `Got ${i.name}` });
    }
    for (const name of input.remove_items || []) {
      const it = findByName(c.inventory, name);
      if (it) { c.inventory.splice(c.inventory.indexOf(it), 1); changes.push({ kind: 'loss', text: `Lost ${it.name}` }); }
    }
    for (const a of input.add_abilities || []) {
      const existing = findByName(c.abilities, a.name);
      const ab = { name: a.name, kind: a.kind || 'skill', cost: a.cost || '', description: a.description || '' };
      if (existing) Object.assign(existing, ab); else c.abilities.push(ab);
      changes.push({ kind: 'gain', text: `${existing ? 'Upgraded' : 'Learned'} ${a.name}` });
    }
    c.conditions ||= [];
    for (const cond of input.add_conditions || []) {
      c.conditions.push(cond);
      changes.push({ kind: 'loss', text: cond });
    }
    for (const cond of input.remove_conditions || []) {
      const n = cond.toLowerCase();
      const idx = c.conditions.findIndex(x => x.toLowerCase().startsWith(n) || n.startsWith(x.toLowerCase()));
      if (idx >= 0) { changes.push({ kind: 'gain', text: `No longer ${c.conditions[idx]}` }); c.conditions.splice(idx, 1); }
    }
    if (input.xp) { c.xp = (c.xp || 0) + input.xp; changes.push({ kind: 'gain', text: `+${input.xp} XP` }); }
    if (input.level && input.level !== c.level) { c.level = input.level; changes.push({ kind: 'level', text: `Level up! Now level ${c.level}` }); }
    if (changes.length) ui.log({ type: 'update', changes });
    return { ok: true, state: stateSnapshot(campaign) };
  },

  create_rule(campaign, input, ui) {
    if (!isStr(input.name) || !isStr(input.text)) throw new Error('name and text are required');
    const rule = { name: input.name, category: input.category || 'world', text: input.text, turn: campaign.turn, custom: true };
    const existing = findByName(campaign.rules, input.name);
    if (existing) Object.assign(existing, rule); else campaign.rules.push(rule);
    ui.log({ type: 'rule', name: rule.name, text: rule.text, updated: !!existing });
    return { ok: true };
  },

  show_image(campaign, input, ui) {
    if (!isStr(input.prompt) || !isStr(input.title)) throw new Error('title and prompt are required');
    const img = { kind: input.kind || 'moment', title: input.title, prompt: input.prompt, turn: campaign.turn };
    campaign.gallery.push(img);
    if (img.kind === 'scene') campaign.scene = img;
    ui.log({ type: 'image', ...img });
    return { ok: true, shown: true };
  },

  update_journal(campaign, input, ui) {
    const ok = (input.location === undefined || typeof input.location === 'string')
      && listOf(input.add_quests, q => isStr(q?.title))
      && listOf(input.complete_quests, isStr)
      && listOf(input.add_npcs, n => isStr(n?.name));
    if (!ok) throw new Error('Input does not match the schema');
    const j = campaign.journal;
    const notes = [];
    if (isStr(input.location) && input.location !== j.location) { j.location = input.location; notes.push({ kind: 'place', text: input.location }); }
    for (const q of input.add_quests || []) {
      if (!findByName(j.quests.map(x => ({ ...x, name: x.title })), q.title)) {
        j.quests.push({ title: q.title, note: q.note || '', status: 'active' });
        notes.push({ kind: 'quest', text: `New quest: ${q.title}` });
      }
    }
    for (const t of input.complete_quests || []) {
      const q = j.quests.find(x => x.title.toLowerCase() === t.toLowerCase());
      if (q && q.status !== 'done') { q.status = 'done'; notes.push({ kind: 'done', text: `Quest complete: ${q.title}` }); }
    }
    for (const n of input.add_npcs || []) {
      const existing = j.npcs.find(x => x.name.toLowerCase() === n.name.toLowerCase());
      if (existing) existing.note = n.note || existing.note;
      else { j.npcs.push({ name: n.name, note: n.note || '' }); notes.push({ kind: 'npc', text: `Met ${n.name}` }); }
    }
    if (notes.length) ui.log({ type: 'journal', notes });
    return { ok: true };
  },

  suggest_actions(campaign, input) {
    if (!listOf(input.actions, isStr) || !input.actions?.length) throw new Error('actions must be a non-empty list of strings');
    campaign.suggestions = input.actions.slice(0, 5);
    return { ok: true };
  },
};

function runTool(campaign, block, ui) {
  const handler = TOOL_HANDLERS[block.name];
  try {
    if (!handler) throw new Error(`Unknown tool ${block.name}`);
    if (!block.input || typeof block.input !== 'object') throw new Error('INVALID_JSON');
    const result = handler(campaign, block.input, ui);
    return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) };
  } catch (err) {
    return { type: 'tool_result', tool_use_id: block.id, is_error: true, content: String(err.message || err) };
  }
}

/**
 * Play one player turn. Mutates `campaign` (api history, character, log...)
 * and reports progress through `ui`:
 *   ui.startNarration() -> begin a new GM text entry
 *   ui.narrate(delta)   -> streamed text
 *   ui.log(entry)       -> dice, rule, image, update and journal entries
 * Throws on failure; the caller restores its pre-turn snapshot.
 */
export async function playTurn(campaign, playerText, ui) {
  const api = await client();
  const state = `<state>${JSON.stringify(stateSnapshot(campaign))}</state>`;
  // Results of end-of-reply tools from last turn ride along with this message.
  campaign.api.push({
    role: 'user',
    content: [...(campaign.pending || []), { type: 'text', text: `${playerText}\n\n${state}` }],
  });
  campaign.pending = [];
  campaign.suggestions = [];
  const system = gmSystem(campaign);

  let jsonRetries = 0;
  for (let step = 0; step < 8; step++) {
    const stream = api.beta.messages.stream({
      ...baseParams('medium'),
      system,
      tools: TOOLS,
      messages: campaign.api,
      cache_control: { type: 'ephemeral' },
    });
    ui.startNarration();
    stream.on('text', delta => ui.narrate(delta));

    let msg;
    try {
      msg = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      if (isAPIError(err) || jsonRetries++ >= 2) throw err;
      continue; // a tool input that wasn't parseable JSON: re-issue the step
    }

    if (msg.stop_reason === 'refusal') {
      throw new GMError('The Game Master declined to continue that way. Try a different action.');
    }
    const content = sanitizeContent(msg.content);
    const toolUses = content.filter(b => b.type === 'tool_use');
    if (msg.stop_reason === 'max_tokens' && toolUses.length) {
      throw new GMError('The reply was cut off. Try again.');
    }
    campaign.api.push({ role: 'assistant', content });
    if (!toolUses.length) return;

    const results = toolUses.map(b => runTool(campaign, b, ui));
    const narrated = content.some(b => b.type === 'text' && b.text.trim());
    const needsAnswer = toolUses.some(b => b.name === 'roll_dice') || results.some(r => r.is_error) || !narrated;
    if (!needsAnswer) {
      campaign.pending = results;
      return;
    }
    campaign.api.push({ role: 'user', content: results });
  }
  // Out of steps: carry the unanswered tool results into the next turn so
  // the history never has two user messages in a row.
  campaign.pending = campaign.api.pop().content;
}
