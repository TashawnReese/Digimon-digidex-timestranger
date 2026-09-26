import * as store from './store.js';
import { imageUrl, imagesEnabled } from './images.js';
import { PRESETS, ART_STYLES, TONES, RULES_STYLES } from './presets.js';
import { MODELS, forgeCharacter, surpriseConcept, playTurn, friendlyError } from './gm.js';

const view = document.getElementById('view');
const dialog = document.getElementById('dialog');
const topTitle = document.getElementById('topbar-title');

// ---------- helpers ----------

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// Tiny, safe markdown for narration: paragraphs, **bold**, *italics*, dialogue.
function md(text) {
  return esc(text.trim()).split(/\n{2,}/).map(p => `<p>${p
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/(&quot;|“)([^]+?)(&quot;|”)/g, '<span class="dlg">$1$2$3</span>')
    .replace(/\n/g, '<br>')}</p>`).join('');
}

const safeColor = c => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '#8b7bff');

// An AI-generated picture with a shimmer while it loads and a text fallback.
function art(prompt, { w, h, style, seed, cls = '', label = '', attrs = '' } = {}) {
  const url = imageUrl(prompt, { w, h, style, seed });
  const img = url ? `<img src="${esc(url)}" alt="${esc(label)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '';
  return `<div class="art ${url ? '' : 'failed'} ${cls}" ${attrs}>${img}<div class="art-fallback">${esc(label)}</div></div>`;
}

// load/error don't bubble, but they can be caught on the way down.
document.addEventListener('load', e => {
  if (e.target.tagName === 'IMG') e.target.closest('.art')?.classList.add('loaded');
}, true);
document.addEventListener('error', e => {
  if (e.target.tagName === 'IMG') e.target.closest('.art')?.classList.add('failed');
}, true);

function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  (dialog.open ? dialog : document.body).appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function openDialog(html, cls = '') {
  dialog.className = cls;
  dialog.innerHTML = html;
  if (!dialog.open) dialog.showModal();
}
dialog.addEventListener('click', e => {
  if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
});

function confirmDialog(message, okLabel = 'OK', danger = false) {
  return new Promise(resolve => {
    openDialog(`
      <div class="dlg-body"><p>${esc(message)}</p></div>
      <div class="dlg-actions">
        <button class="btn ghost" data-answer="no">Cancel</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-answer="yes">${esc(okLabel)}</button>
      </div>`);
    const onClick = e => {
      const b = e.target.closest('[data-answer]');
      if (b) dialog.close(b.dataset.answer);
    };
    dialog.addEventListener('click', onClick);
    dialog.addEventListener('close', () => {
      dialog.removeEventListener('click', onClick);
      resolve(dialog.returnValue === 'yes');
      dialog.returnValue = '';
    }, { once: true });
  });
}

function lightbox(img, style, onReroll) {
  openDialog(`
    ${art(img.prompt, { w: 1344, h: 768, style, seed: img.seed, label: img.title })}
    <div class="lightbox-cap">
      <div class="t"><strong>${esc(img.title)}</strong><div class="p">${esc(img.prompt)}</div></div>
      ${onReroll ? '<button class="btn small" data-reroll>↻ Redraw</button>' : ''}
      <button class="btn small ghost" data-close>Close</button>
    </div>`, 'lightbox');
  dialog.querySelector('[data-reroll]')?.addEventListener('click', () => {
    img.seed = Math.floor(Math.random() * 1e6);
    onReroll();
    lightbox(img, style, onReroll);
  });
}

// ---------- settings ----------

function openSettings() {
  const s = store.getSettings();
  const opt = (obj, cur) => Object.entries(obj).map(([v, l]) =>
    `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const styleNames = { anime: 'Anime', painterly: 'Painterly fantasy', comic: 'Comic book', cinematic: 'Cinematic', pixel: 'Pixel art', watercolor: 'Watercolor' };
  openDialog(`
    <form method="dialog" id="settings-form">
      <div class="dlg-body">
        <h2>Settings</h2>
        <label class="field"><span>Anthropic API key</span>
          <input type="password" name="apiKey" value="${esc(s.apiKey)}" placeholder="sk-ant-..." autocomplete="off" spellcheck="false">
        </label>
        <p class="muted small">The Game Master runs on Claude. Get a key at
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>.
          It's stored only in this browser and sent only to Anthropic. API usage is billed to your account.</p>
        <label class="field"><span>AI model</span><select name="model">${opt(MODELS, s.model)}</select></label>
        <label class="field"><span>Narration length</span>
          <select name="length">${opt({ short: 'Short', medium: 'Medium', long: 'Long' }, s.length)}</select></label>
        <label class="field"><span>Content rating</span>
          <select name="rating">${opt({ family: 'Family', teen: 'Teen', mature: 'Mature' }, s.rating)}</select></label>
        <label class="field"><span>Pictures</span>
          <select name="images">${opt({ on: 'On (free AI images via Pollinations)', off: 'Off' }, s.images)}</select></label>
        <label class="field"><span>Default art style</span>
          <select name="artStyle">${opt(styleNames, s.artStyle)}</select></label>
      </div>
      <div class="dlg-actions">
        <button class="btn ghost" value="cancel" formnovalidate>Cancel</button>
        <button class="btn primary" value="save">Save</button>
      </div>
    </form>`);
  dialog.querySelector('form').addEventListener('submit', e => {
    if (e.submitter?.value !== 'save') return;
    const data = Object.fromEntries(new FormData(e.target));
    data.apiKey = data.apiKey.trim();
    store.saveSettings(data);
    toast('Settings saved');
    route();
  });
}
document.getElementById('settings-btn').addEventListener('click', openSettings);

// ---------- character sheet ----------

function barsHTML(resources) {
  return resources.map(r => {
    const pct = r.max > 0 ? Math.round((r.current / r.max) * 100) : 0;
    const color = safeColor(r.color);
    return `<div class="bar">
      <div class="bar-head"><span>${esc(r.name)}</span><span>${esc(r.current)} / ${esc(r.max)}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color};color:${color}"></div></div>
    </div>`;
  }).join('');
}

function statsHTML(stats) {
  return `<div class="stats">${stats.map(s => `
    <div class="stat" title="${esc(s.note)}"><div class="v">${esc(s.value)}</div><div class="n">${esc(s.abbr || s.name)}</div></div>`).join('')}</div>`;
}

function abilitiesHTML(abilities) {
  return `<div class="abilities">${abilities.map(a => `
    <div class="ability">
      <div class="ability-head"><strong>${esc(a.name)}</strong><span class="kind ${esc(a.kind)}">${esc(a.kind)}</span></div>
      ${a.cost ? `<div class="cost">${esc(a.cost)}</div>` : ''}
      <p>${esc(a.description)}</p>
    </div>`).join('')}</div>`;
}

function rulesHTML(rules) {
  if (!rules.length) return '<p class="muted">No rules yet.</p>';
  return rules.map(r => `
    <div class="rule ${r.custom ? 'custom' : ''}">
      <strong>${esc(r.name)}</strong><span class="rule-cat">${esc(r.category)}${r.custom ? ' · made up in play' : ''}</span>
      <p>${esc(r.text)}</p>
    </div>`).join('');
}

function sheetHTML(c, { portrait, style, world, rules }) {
  return `<div class="sheet">
    <div class="sheet-top">
      ${art(portrait, { w: 768, h: 1024, style, cls: 'portrait', label: c.name, attrs: 'data-portrait' })}
      <div>
        <span class="tag">${esc(c.source)}</span>${c.level ? `<span class="tag">Level ${esc(c.level)}</span>` : ''}
        <h1 class="grad-text">${esc(c.name)}</h1>
        <div class="title">${esc(c.title)}</div>
        <p>${esc(c.concept)}</p>
        <p class="muted">${esc(c.appearance)} ${esc(c.personality)}</p>
        ${statsHTML(c.stats)}
        <div style="margin-top:14px">${barsHTML(c.resources)}</div>
      </div>
    </div>
    <div class="signature"><h3>✦ ${esc(c.signature.name)}</h3><p>${esc(c.signature.description)}</p></div>
    <div class="two-col">
      <div class="card"><h3>Abilities</h3>${abilitiesHTML(c.abilities)}</div>
      <div class="card">
        <h3>Backstory</h3><p>${esc(c.backstory)}</p>
        <h3>Inventory</h3>
        <ul class="list-plain">${c.inventory.map(i => `<li><strong>${esc(i.name)}</strong> <span class="muted">${esc(i.description)}</span></li>`).join('')}</ul>
      </div>
    </div>
    ${world ? `<div class="card">
      <h3>The world: ${esc(world.name)}</h3>
      <p>${esc(world.premise)}</p>
      <p class="muted"><em>${esc(world.opening_hook)}</em></p>
      ${art(world.scene_prompt, { w: 1344, h: 576, style, label: world.name, cls: 'scene-art', attrs: 'style="aspect-ratio:21/9;border-radius:12px"' })}
    </div>` : ''}
    ${rules ? `<div class="card"><h3>House rules for this character</h3>${rulesHTML(rules)}</div>` : ''}
  </div>`;
}

// ---------- home ----------

async function renderHome() {
  topTitle.textContent = '';
  const campaigns = await store.listCampaigns().catch(() => []);
  const hasKey = !!store.getSettings().apiKey;
  const heroArt = ['keyblade', 'shinigami', 'persona'].map(id => PRESETS.find(p => p.id === id));
  view.innerHTML = `
    <section class="hero">
      <div class="hero-collage">${heroArt.map(p => art(p.art, { w: 640, h: 900 })).join('')}</div>
      <div class="hero-body">
        <h1>Be <span class="grad-text">anyone.</span><br>Go <span class="grad-text">anywhere.</span></h1>
        <p>A text role-playing adventure with an AI Game Master that invents the rules as you go.
          Play a Keyblade wielder, a Shinigami, a Persona user, a classic wizard, or anything you can imagine.</p>
        <div class="actions">
          <a class="btn primary big" href="#/new">✦ New adventure</a>
          ${campaigns.length ? `<a class="btn big" href="#/play/${esc(campaigns[0].id)}">Continue ${esc(campaigns[0].character.name)}</a>` : ''}
        </div>
      </div>
    </section>

    ${hasKey ? '' : `<div class="notice"><p><strong>One step before you play:</strong> add your Anthropic API key so the AI Game Master can run. You can browse everything without one.</p>
      <button class="btn small" id="key-btn">Add API key</button></div>`}

    ${campaigns.length ? `
      <div class="section-head"><h2>Your adventures</h2>
        <label class="btn small ghost">Import<input type="file" accept="application/json" id="import" hidden></label></div>
      <div class="campaigns">${campaigns.map(c => `
        <a class="campaign-card" href="#/play/${esc(c.id)}">
          ${art(c.scene?.prompt || c.world.scene_prompt, { w: 768, h: 432, style: c.artStyle, seed: c.scene?.seed, label: c.world.name })}
          ${art(c.portrait, { w: 256, h: 256, style: c.artStyle, cls: 'portrait-badge', label: c.character.name.slice(0, 1) })}
          <button class="icon-btn menu-btn" data-menu="${esc(c.id)}" aria-label="Options for ${esc(c.character.name)}">⋯</button>
          <div class="body">
            <h3>${esc(c.character.name)}</h3>
            <div class="meta">${esc(c.character.title)}</div>
            <div class="meta">${esc(c.world.name)} · Turn ${esc(c.turn)} · ${esc(new Date(c.updatedAt).toLocaleDateString())}</div>
          </div>
        </a>`).join('')}</div>` : `
      <div class="section-head"><h2>No adventures yet</h2>
        <label class="btn small ghost">Import<input type="file" accept="application/json" id="import" hidden></label></div>`}

    <div class="section-head"><h2>Who will you be today?</h2><a class="btn small" href="#/new">Create your own</a></div>
    <div class="archetypes">${PRESETS.map(p => presetCard(p)).join('')}</div>`;

  view.querySelector('#key-btn')?.addEventListener('click', openSettings);
  view.querySelectorAll('.archetype').forEach(b => b.addEventListener('click', () => {
    choosePreset(b.dataset.preset);
    location.hash = '#/new';
  }));
  view.querySelectorAll('[data-menu]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault();
    campaignMenu(campaigns.find(c => c.id === b.dataset.menu));
  }));
  view.querySelector('#import')?.addEventListener('change', importCampaign);
}

function presetCard(p, selected = false) {
  return `<button class="archetype" data-preset="${esc(p.id)}" aria-pressed="${selected}">
    ${art(p.art, { w: 480, h: 640, label: p.name })}
    <div class="label"><strong>${esc(p.name)}</strong><span>${esc(p.source)}</span></div>
  </button>`;
}

function campaignMenu(c) {
  openDialog(`
    <div class="dlg-body">
      <h2>${esc(c.character.name)}</h2>
      <p class="muted">${esc(c.world.name)} · Turn ${esc(c.turn)}</p>
    </div>
    <div class="dlg-actions">
      <button class="btn danger" data-act="delete">Delete</button>
      <button class="btn" data-act="export">Export</button>
      <button class="btn ghost" data-close>Close</button>
    </div>`);
  dialog.querySelector('[data-act=export]').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(c)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${c.character.name.replace(/[^\w-]+/g, '_')}-quest.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  dialog.querySelector('[data-act=delete]').addEventListener('click', async () => {
    if (await confirmDialog(`Delete ${c.character.name}'s adventure? This can't be undone.`, 'Delete', true)) {
      await store.deleteCampaign(c.id);
      toast('Adventure deleted');
      renderHome();
    }
  });
}

async function importCampaign(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const c = JSON.parse(await file.text());
    if (!c.id || !c.character || !Array.isArray(c.api) || !Array.isArray(c.log)) throw new Error('bad file');
    await store.saveCampaign(c);
    toast(`Imported ${c.character.name}`);
    renderHome();
  } catch {
    toast('That file is not a Multiverse Quest save');
  }
}

// ---------- creator ----------

const draft = {
  presetId: '', concept: '', name: '', setting: '', tone: 'Heroic', rulesStyle: 'balanced',
  artStyle: '', extra: '', sheet: null, forging: false, progress: 0, recentSurprises: [],
};

function choosePreset(id) {
  const p = PRESETS.find(x => x.id === id);
  if (!p) return;
  draft.presetId = id;
  draft.concept = p.concept;
  draft.sheet = null;
}

function renderCreator() {
  topTitle.textContent = 'New adventure';
  if (draft.forging) return renderForging();
  if (draft.sheet) return renderReview();
  const style = draft.artStyle || store.getSettings().artStyle;
  const groups = [...new Set(PRESETS.map(p => p.group))];
  view.innerHTML = `
    <div class="creator">
      <div>
        <h2>Who do you want to be?</h2>
        <p class="muted">Describe any character from anything — a game, anime, movie, book, a mash-up, or a classic class. Or pick one below to start from.</p>
        <div class="concept-box">
          <textarea id="concept" placeholder="e.g. A Keyblade wielder who fell into the world of Bleach and became a Shinigami…">${esc(draft.concept)}</textarea>
        </div>
        <div class="chips" style="margin-top:10px">
          <button class="btn small" id="surprise">🎲 Surprise me (AI)</button>
        </div>
      </div>

      ${groups.map(g => `
        <div>
          <h3>${esc(g)}</h3>
          <div class="archetypes">${PRESETS.filter(p => p.group === g).map(p => presetCard(p, p.id === draft.presetId)).join('')}</div>
        </div>`).join('')}

      <div class="creator-grid">
        <div class="card">
          <label class="field"><span>Name (optional)</span>
            <input type="text" id="name" value="${esc(draft.name)}" placeholder="Leave blank and the AI will pick one"></label>
          <label class="field"><span>Setting (optional)</span>
            <input type="text" id="setting" value="${esc(draft.setting)}" placeholder="The character's own world, or mix it up: 'Hogwarts, but with Heartless'"></label>
          <label class="field"><span>Anything else? (optional)</span>
            <textarea id="extra" rows="3" placeholder="Personality, a rival, a power you really want, a starting situation…">${esc(draft.extra)}</textarea></label>
        </div>
        <div class="card">
          <label class="field"><span>Tone</span></label>
          <div class="chips" id="tone">${TONES.map(t => `<button class="chip" data-v="${esc(t)}" aria-pressed="${t === draft.tone}">${esc(t)}</button>`).join('')}</div>
          <label class="field" style="margin-top:16px"><span>Rules</span></label>
          <div class="chips" id="rules">${Object.entries(RULES_STYLES).map(([k, v]) => `<button class="chip" data-v="${k}" aria-pressed="${k === draft.rulesStyle}" title="${esc(v)}">${esc(k[0].toUpperCase() + k.slice(1))}</button>`).join('')}</div>
          <p class="muted small">${esc(RULES_STYLES[draft.rulesStyle])}</p>
          <label class="field"><span>Art style</span>
            <select id="art-style">${Object.keys(ART_STYLES).map(k => `<option value="${k}" ${k === style ? 'selected' : ''}>${esc(k[0].toUpperCase() + k.slice(1))}</option>`).join('')}</select></label>
        </div>
      </div>

      <div class="sticky-actions">
        <a class="btn ghost" href="#/">Cancel</a>
        <button class="btn primary big" id="forge">✦ Forge my character</button>
      </div>
    </div>`;

  const read = () => {
    draft.concept = view.querySelector('#concept').value.trim();
    draft.name = view.querySelector('#name').value.trim();
    draft.setting = view.querySelector('#setting').value.trim();
    draft.extra = view.querySelector('#extra').value.trim();
    draft.artStyle = view.querySelector('#art-style').value;
  };
  view.querySelectorAll('.archetype').forEach(b => b.addEventListener('click', () => {
    read();
    choosePreset(b.dataset.preset);
    renderCreator();
    view.querySelector('#concept').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
  view.querySelector('#concept').addEventListener('input', () => { draft.presetId = ''; });
  for (const [id, key] of [['tone', 'tone'], ['rules', 'rulesStyle']]) {
    view.querySelector(`#${id}`).addEventListener('click', e => {
      const b = e.target.closest('.chip');
      if (!b) return;
      read();
      draft[key] = b.dataset.v;
      renderCreator();
    });
  }
  view.querySelector('#surprise').addEventListener('click', async e => {
    read();
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '🎲 Rolling ideas…';
    try {
      const idea = await surpriseConcept(draft.recentSurprises);
      draft.recentSurprises = [idea.concept, ...draft.recentSurprises].slice(0, 5);
      Object.assign(draft, { concept: idea.concept, setting: idea.setting, presetId: '' });
      const tone = TONES.find(t => t.toLowerCase() === idea.tone.toLowerCase());
      if (tone) draft.tone = tone;
      renderCreator();
    } catch (err) {
      toast(friendlyError(err));
      btn.disabled = false;
      btn.textContent = '🎲 Surprise me (AI)';
    }
  });
  view.querySelector('#forge').addEventListener('click', () => {
    read();
    if (!draft.concept) { toast('Describe a character or pick one first'); return; }
    if (!store.getSettings().apiKey) { openSettings(); return; }
    forge();
  });
}

async function forge() {
  draft.forging = true;
  draft.progress = 0;
  renderCreator();
  try {
    draft.sheet = await forgeCharacter(draft, chars => {
      draft.progress = chars;
      const bar = view.querySelector('.progress > div');
      if (bar) bar.style.width = `${Math.min(96, 8 + chars / 45)}%`;
      const msg = view.querySelector('#forge-msg');
      if (msg) msg.textContent = 'Writing your character sheet…';
    });
  } catch (err) {
    toast(friendlyError(err));
  }
  draft.forging = false;
  if (location.hash.startsWith('#/new')) renderCreator();
}

function renderForging() {
  view.innerHTML = `
    <div class="forging">
      <div class="rune"></div>
      <h2 class="grad-text">Forging your legend</h2>
      <p class="muted" id="forge-msg">The Game Master is studying your concept and inventing its rules…</p>
      <div class="progress"><div style="width:${Math.min(96, 8 + draft.progress / 45)}%"></div></div>
    </div>`;
}

function renderReview() {
  const s = draft.sheet;
  const style = draft.artStyle || store.getSettings().artStyle;
  view.innerHTML = `
    ${sheetHTML(s, { portrait: s.portrait_prompt, style, world: s.world, rules: s.rules })}
    <div class="sticky-actions">
      <button class="btn ghost" id="edit">← Change concept</button>
      <button class="btn" id="reroll">↻ Reroll</button>
      <button class="btn primary big" id="begin">Begin adventure ➜</button>
    </div>`;
  view.querySelector('[data-portrait]').addEventListener('click', () =>
    lightbox({ title: s.name, prompt: s.portrait_prompt }, style));
  view.querySelector('#edit').addEventListener('click', () => { draft.sheet = null; renderCreator(); });
  view.querySelector('#reroll').addEventListener('click', () => { draft.sheet = null; forge(); });
  view.querySelector('#begin').addEventListener('click', beginCampaign);
}

async function beginCampaign() {
  const { world, rules, portrait_prompt: portrait, ...character } = draft.sheet;
  character.xp = 0;
  character.conditions = [];
  const scene = { kind: 'scene', title: world.name, prompt: world.scene_prompt, turn: 0 };
  const campaign = {
    id: store.newId(),
    createdAt: Date.now(),
    turn: 0,
    artStyle: draft.artStyle || store.getSettings().artStyle,
    initial: structuredClone({ character, world, rules }),
    character,
    world,
    portrait,
    rules: rules.map(r => ({ ...r, custom: false })),
    journal: { location: '', quests: [], npcs: [] },
    gallery: [{ kind: 'character', title: character.name, prompt: portrait, turn: 0 }, scene],
    scene,
    log: [{ type: 'title', title: world.name, text: world.premise, prompt: world.scene_prompt }],
    api: [],
    pending: [],
    suggestions: [],
    undo: null,
  };
  await store.saveCampaign(campaign);
  Object.assign(draft, { sheet: null, concept: '', name: '', setting: '', extra: '', presetId: '' });
  autoStart = campaign.id;
  location.hash = `#/play/${campaign.id}`;
}

// ---------- play ----------

let autoStart = null;
const START = 'Begin the adventure. Open with a strong hook in the opening scene.';
const play = { campaign: null, tab: 'story', side: 'hero', busy: false, draftText: '' };
const wide = window.matchMedia('(min-width: 980px)');
wide.addEventListener('change', () => { if (play.campaign && location.hash.startsWith('#/play')) renderPlay(play.campaign.id); });

const INSPIRE = [
  ['✨ Twist', '(GM: surprise me with an unexpected twist.)'],
  ['💎 Loot', '(GM: let me find something valuable or strange — invent a new item for this world, with its own rules.)'],
  ['👤 New face', '(GM: introduce an intriguing new character.)'],
  ['🌀 Crossover', '(GM: pull something in from another franchise or world as a crossover.)'],
  ['🖼 Illustrate', '[OOC: Show me a picture of this moment.]'],
];

async function renderPlay(id) {
  let c = play.campaign?.id === id ? play.campaign : await store.getCampaign(id);
  if (!c) { view.innerHTML = '<div class="card"><p>Adventure not found.</p><a class="btn" href="#/">Home</a></div>'; return; }
  play.campaign = c;
  topTitle.textContent = `${c.character.name} · ${c.world.name}`;
  if (wide.matches && play.tab !== 'story') play.tab = 'story';

  const tabs = (list, current, attr) => list.map(([k, l]) =>
    `<button role="tab" data-${attr}="${k}" aria-selected="${k === current}">${l}</button>`).join('');
  const panels = [['hero', 'Hero'], ['codex', 'Codex'], ['journal', 'Journal'], ['gallery', 'Gallery']];

  view.innerHTML = `
    <div class="play">
      <section class="story-col">
        <div class="backdrop" id="backdrop">${art(c.scene?.prompt, { w: 768, h: 432, style: c.artStyle, seed: c.scene?.seed })}</div>
        <nav class="play-tabs mobile-only" role="tablist">${tabs([['story', 'Story'], ...panels], play.tab, 'tab')}</nav>
        ${play.tab === 'story' ? `
          <div class="log" id="log"><div class="log-inner" id="log-inner"></div></div>
          <div class="composer"><div class="composer-inner">
            <div class="suggestions" id="suggestions"></div>
            <div class="input-row">
              <button class="icon-btn" id="undo" title="Undo last turn" aria-label="Undo last turn">↶</button>
              <textarea id="action" rows="1" placeholder="What do you do?">${esc(play.draftText)}</textarea>
              <button class="send-btn" id="send" aria-label="Send">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z"/></svg>
              </button>
            </div>
          </div></div>` : `<div class="panel-view" id="panel-main"></div>`}
      </section>
      <aside class="side-col">
        <nav class="play-tabs" role="tablist">${tabs(panels, play.side, 'side')}</nav>
        <div class="side-body" id="side"></div>
      </aside>
    </div>`;

  view.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
    saveDraftText();
    play.tab = b.dataset.tab;
    renderPlay(c.id);
  }));
  view.querySelectorAll('[data-side]').forEach(b => b.addEventListener('click', () => {
    play.side = b.dataset.side;
    view.querySelectorAll('[data-side]').forEach(x => x.setAttribute('aria-selected', x === b));
    refreshPanels();
  }));

  refreshPanels();
  if (play.tab === 'story') {
    renderLog();
    renderSuggestions();
    wireComposer();
    if (autoStart === c.id && !c.api.length) {
      autoStart = null;
      runTurn(START, { hidden: true });
    }
  }
}

function saveDraftText() {
  const el = view.querySelector('#action');
  if (el) play.draftText = el.value;
}

// Hero / Codex / Journal / Gallery panels, in the sidebar and the mobile tab.
function panelHTML(which) {
  const c = play.campaign;
  const ch = c.character;
  if (which === 'hero') {
    return `
      <div class="mini-hero">
        ${art(c.portrait, { w: 256, h: 256, style: c.artStyle, label: ch.name.slice(0, 1), attrs: 'data-open-portrait' })}
        <div><h3>${esc(ch.name)}</h3><div class="title">${esc(ch.title)}</div>
          <div class="muted small">Level ${esc(ch.level)} · ${esc(ch.xp || 0)} XP</div></div>
      </div>
      <div class="panel-section">${barsHTML(ch.resources)}</div>
      ${ch.conditions?.length ? `<div class="panel-section"><h3>Conditions</h3><div class="pills">${ch.conditions.map(x => `<span class="pill loss">${esc(x)}</span>`).join('')}</div></div>` : ''}
      <div class="panel-section"><h3>Stats</h3>${statsHTML(ch.stats)}</div>
      <div class="panel-section signature"><h3>✦ ${esc(ch.signature.name)}</h3><p class="small">${esc(ch.signature.description)}</p></div>
      <div class="panel-section"><h3>Abilities</h3>${abilitiesHTML(ch.abilities)}</div>
      <div class="panel-section"><h3>Inventory</h3><ul class="list-plain">${ch.inventory.map(i => `<li><strong>${esc(i.name)}</strong> <span class="muted">${esc(i.description)}</span></li>`).join('') || '<li class="muted">Empty</li>'}</ul></div>
      <div class="panel-section"><h3>Backstory</h3><p class="small muted">${esc(ch.backstory)}</p></div>`;
  }
  if (which === 'codex') {
    const custom = c.rules.filter(r => r.custom);
    return `
      <div class="panel-section"><p class="small muted">The rules of your game. Gold ones were made up by the Game Master during play.</p></div>
      ${custom.length ? `<div class="panel-section"><h3>Made up in play (${custom.length})</h3>${rulesHTML(custom)}</div>` : ''}
      <div class="panel-section"><h3>Core rules</h3>${rulesHTML(c.rules.filter(r => !r.custom))}</div>`;
  }
  if (which === 'journal') {
    const j = c.journal;
    return `
      <div class="panel-section"><h3>World</h3><p><strong>${esc(c.world.name)}</strong></p><p class="small muted">${esc(c.world.premise)}</p></div>
      <div class="panel-section"><h3>Location</h3><p>${esc(j.location || 'Unknown')}</p></div>
      <div class="panel-section"><h3>Quests</h3><ul class="list-plain">${j.quests.map(q => `<li class="${q.status === 'done' ? 'done' : ''}"><strong>${esc(q.title)}</strong><br><span class="muted small">${esc(q.note)}</span></li>`).join('') || '<li class="muted">None yet</li>'}</ul></div>
      <div class="panel-section"><h3>People</h3><ul class="list-plain">${j.npcs.map(n => `<li><strong>${esc(n.name)}</strong><br><span class="muted small">${esc(n.note)}</span></li>`).join('') || '<li class="muted">No one yet</li>'}</ul></div>`;
  }
  return `
    <div class="panel-section"><p class="small muted">Every picture from your adventure. Tap one to view it or redraw it.</p></div>
    <div class="gallery">${c.gallery.map((g, i) => art(g.prompt, { w: 768, h: 768, style: c.artStyle, seed: g.seed, label: g.title, attrs: `data-gallery="${i}"` })).reverse().join('')}</div>`;
}

function refreshPanels() {
  const c = play.campaign;
  const targets = [[view.querySelector('#side'), play.side], [view.querySelector('#panel-main'), play.tab]];
  for (const [el, which] of targets) {
    if (!el || which === 'story') continue;
    el.innerHTML = panelHTML(which);
    el.querySelector('[data-open-portrait]')?.addEventListener('click', () =>
      lightbox({ title: c.character.name, prompt: c.portrait }, c.artStyle));
    el.querySelectorAll('[data-gallery]').forEach(g => g.addEventListener('click', () => {
      const img = c.gallery[+g.dataset.gallery];
      lightbox(img, c.artStyle, () => { store.saveCampaign(c); refreshPanels(); });
    }));
  }
}

function entryHTML(e, i) {
  const c = play.campaign;
  switch (e.type) {
    case 'title':
      return `<figure class="scene-banner" data-img="${i}">${art(e.prompt, { w: 1344, h: 576, style: c.artStyle, seed: e.seed, label: e.title })}
        <figcaption><div style="font-size:1.4rem">${esc(e.title)}</div><div class="small muted" style="font-family:var(--font)">${esc(e.text)}</div></figcaption></figure>`;
    case 'gm':
      return `<div class="entry-gm">${md(e.text)}</div>`;
    case 'player':
      return `<div class="entry-player ${/^\s*[[(]|^\s*ooc:/i.test(e.text) ? 'ooc' : ''}"><div><div class="who">${esc(c.character.name)}</div><div class="bubble">${esc(e.text)}</div></div></div>`;
    case 'dice': {
      const verdict = e.critical === 'natural 20' ? '<span class="verdict crit">Critical!</span>'
        : e.critical === 'natural 1' ? '<span class="verdict bad">Fumble</span>'
        : e.success === true ? '<span class="verdict ok">Success</span>'
        : e.success === false ? '<span class="verdict bad">Fail</span>' : '';
      const math = `${e.notation}${e.mode !== 'normal' ? ` · ${e.mode}` : ''}: [${e.rolls.join(', ')}]${e.dropped ? ` <s>[${e.dropped.join(', ')}]</s>` : ''}${e.modifier ? ` ${e.modifier > 0 ? '+' : '−'} ${Math.abs(e.modifier)}` : ''}${e.target !== undefined ? ` vs ${e.target}` : ''}`;
      return `<div class="entry-dice"><span class="die">${esc(e.total)}</span>
        <div class="detail"><div class="reason">🎲 ${esc(e.reason)}</div><div class="math">${math}</div></div>${verdict}</div>`;
    }
    case 'rule':
      return `<div class="entry-rule"><div class="head">📜 ${e.updated ? 'Rule updated' : 'New rule'}: ${esc(e.name)}</div>${esc(e.text)}</div>`;
    case 'image':
      return `<figure class="entry-image ${esc(e.kind)}" data-img="${i}">${art(e.prompt, { w: e.kind === 'character' || e.kind === 'creature' ? 768 : 1152, h: e.kind === 'character' || e.kind === 'creature' ? 960 : 768, style: c.artStyle, seed: e.seed, label: e.title })}
        <figcaption><strong>${esc(e.title)}</strong></figcaption></figure>`;
    case 'update':
    case 'journal':
      return `<div class="pills">${(e.changes || e.notes).map(x => `<span class="pill ${esc(x.kind)}">${esc(x.text)}</span>`).join('')}</div>`;
    case 'system':
      return `<div class="entry-system">${esc(e.text)}</div>`;
    default:
      return '';
  }
}

function appendEntry(e) {
  const inner = view.querySelector('#log-inner');
  if (!inner) return null;
  const i = play.campaign.log.indexOf(e);
  const wrap = document.createElement('div');
  wrap.innerHTML = entryHTML(e, i);
  const el = wrap.firstElementChild;
  if (!el) return null;
  el.dataset.i = i;
  inner.appendChild(el);
  if (el.dataset.img !== undefined) el.addEventListener('click', () => openLogImage(+el.dataset.img));
  scrollLog();
  return el;
}

function openLogImage(i) {
  const c = play.campaign;
  const e = c.log[i];
  lightbox(e, c.artStyle, () => {
    // Keep the gallery copy (and the backdrop) in step with the redraw.
    const g = c.gallery.find(x => x.prompt === e.prompt);
    if (g) g.seed = e.seed;
    if (c.scene?.prompt === e.prompt) c.scene.seed = e.seed;
    store.saveCampaign(c);
    renderLog();
  });
}

function renderLog() {
  const inner = view.querySelector('#log-inner');
  if (!inner) return;
  inner.innerHTML = '';
  play.campaign.log.forEach(e => appendEntry(e));
  if (play.busy && play.busyId === play.campaign.id) showThinking();
}

function scrollLog() {
  const log = view.querySelector('#log');
  if (log) log.scrollTop = log.scrollHeight;
}

function showThinking() {
  const inner = view.querySelector('#log-inner');
  if (!inner || inner.querySelector('.thinking')) return;
  const el = document.createElement('div');
  el.className = 'thinking';
  el.innerHTML = '<span class="dots"><span></span><span></span><span></span></span> The Game Master is weaving the story…';
  inner.appendChild(el);
  scrollLog();
}
const hideThinking = () => view.querySelectorAll('.thinking').forEach(x => x.remove());

function renderSuggestions() {
  const box = view.querySelector('#suggestions');
  if (!box) return;
  const c = play.campaign;
  box.innerHTML = play.busy ? '' : !c.api.length
    ? '<button class="chip inspire" data-start>▶ Begin the adventure</button>'
    : [
      ...(c.suggestions || []).map(s => `<button class="chip" data-say="${esc(s)}">${esc(s)}</button>`),
      ...INSPIRE.map(([l, t]) => `<button class="chip inspire" data-say="${esc(t)}">${esc(l)}</button>`),
    ].join('');
  box.querySelectorAll('[data-say]').forEach(b => b.addEventListener('click', () => runTurn(b.dataset.say)));
  box.querySelector('[data-start]')?.addEventListener('click', () => runTurn(START, { hidden: true }));
  const undo = view.querySelector('#undo');
  if (undo) undo.disabled = play.busy || !c.undo;
  const send = view.querySelector('#send');
  if (send) send.disabled = play.busy;
}

function wireComposer() {
  const input = view.querySelector('#action');
  const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 180)}px`; };
  input.addEventListener('input', grow);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
  });
  const submit = () => {
    const text = input.value.trim();
    if (!text || play.busy) return;
    input.value = '';
    play.draftText = '';
    grow();
    runTurn(text);
  };
  view.querySelector('#send').addEventListener('click', submit);
  view.querySelector('#undo').addEventListener('click', undoTurn);
  grow();
}

async function undoTurn() {
  const c = play.campaign;
  if (!c.undo || play.busy) return;
  if (!await confirmDialog('Undo the last turn? The story goes back to just before your last action.', 'Undo')) return;
  const { lastAction } = c.undo;
  restore(c, c.undo.state);
  c.undo = null;
  await store.saveCampaign(c);
  play.draftText = lastAction || '';
  renderPlay(c.id);
}

function restore(c, snapshot) {
  for (const k of Object.keys(c)) delete c[k];
  Object.assign(c, structuredClone(snapshot));
}

async function runTurn(text, { hidden = false } = {}) {
  const c = play.campaign;
  if (play.busy) return;
  if (!store.getSettings().apiKey) { openSettings(); return; }
  const { undo, ...rest } = c;
  const before = structuredClone(rest);

  play.busy = true;
  play.busyId = c.id;
  c.turn++;
  if (hidden) c.log.push({ type: 'system', text: '— The adventure begins —' });
  else c.log.push({ type: 'player', text });
  appendEntry(c.log.at(-1));
  renderSuggestions();
  showThinking();

  let current = null;
  let currentEl = null;
  let frame = 0;
  // The player may navigate away mid-turn; only touch the page while it
  // still shows this campaign.
  const onScreen = () => play.campaign === c && location.hash === `#/play/${c.id}` && play.tab === 'story';
  const findEl = () => {
    if (currentEl?.isConnected) return currentEl;
    if (!onScreen()) return null;
    return view.querySelector(`#log-inner > [data-i="${c.log.indexOf(current)}"]`) || appendEntry(current);
  };
  const finishNarration = () => {
    if (!current) return;
    if (!current.text.trim()) {
      const idx = c.log.indexOf(current);
      c.log.splice(idx, 1);
      if (onScreen()) view.querySelector(`#log-inner > [data-i="${idx}"]`)?.remove();
    } else {
      const el = findEl();
      if (el) {
        el.classList.remove('cursor');
        el.innerHTML = md(current.text);
      }
    }
    current = currentEl = null;
  };
  const ui = {
    startNarration() {
      finishNarration();
      current = { type: 'gm', text: '' };
      c.log.push(current);
      if (onScreen()) showThinking();
    },
    narrate(delta) {
      if (!current) ui.startNarration();
      current.text += delta;
      if (!currentEl?.isConnected) {
        currentEl = findEl();
        if (!currentEl) return;
        hideThinking();
        currentEl.classList.add('cursor');
      }
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (currentEl) { currentEl.innerHTML = md(current.text); scrollLog(); }
        });
      }
    },
    log(entry) {
      finishNarration();
      c.log.push(entry);
      if (!onScreen()) return;
      hideThinking();
      appendEntry(entry);
      if (entry.type === 'image' && entry.kind === 'scene') {
        const bd = view.querySelector('#backdrop');
        if (bd) bd.innerHTML = art(entry.prompt, { w: 768, h: 432, style: c.artStyle });
      }
      refreshPanels();
      showThinking();
    },
  };

  try {
    await playTurn(c, text, ui);
    cancelAnimationFrame(frame);
    frame = 0;
    finishNarration();
    c.undo = hidden ? null : { state: before, lastAction: text };
    await store.saveCampaign(c);
  } catch (err) {
    cancelAnimationFrame(frame);
    console.error(err);
    restore(c, before);
    c.undo = undo;
    if (!hidden) play.draftText = text;
    play.busy = false;
    if (play.campaign === c && location.hash === `#/play/${c.id}`) {
      renderPlay(c.id);
      const inner = view.querySelector('#log-inner');
      if (inner) {
        const el = document.createElement('div');
        el.className = 'entry-error';
        el.innerHTML = `<strong>The story stalled.</strong> ${esc(friendlyError(err))}
          <div style="margin-top:8px"><button class="btn small">Try again</button></div>`;
        el.querySelector('button').addEventListener('click', () => {
          el.remove();
          play.draftText = '';
          runTurn(text, { hidden });
        });
        inner.appendChild(el);
        scrollLog();
      }
    }
    return;
  }
  play.busy = false;
  hideThinking();
  if (location.hash === `#/play/${c.id}`) {
    renderSuggestions();
    refreshPanels();
    scrollLog();
  }
}

// ---------- router ----------

function route() {
  const [, page, id] = (location.hash || '#/').slice(1).split('/');
  document.body.classList.toggle('playing', page === 'play');
  window.scrollTo(0, 0);
  if (page === 'new') renderCreator();
  else if (page === 'play' && id) renderPlay(id);
  else renderHome();
}

window.addEventListener('hashchange', () => {
  if (dialog.open) dialog.close();
  saveDraftText();
  route();
});
route();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
