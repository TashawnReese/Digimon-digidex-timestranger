import * as store from './store.js';

const view = document.getElementById('view');
const titleEl = document.getElementById('page-title');
const backBtn = document.getElementById('back-btn');
const dialog = document.getElementById('dialog');

const ui = {
  dexQuery: '',
  dexStage: 'All',
  dexAttr: 'All',
  dexSort: 'number',
  fullLine: false,
  plannerFrom: '',
  plannerTo: '',
  forwardOnly: false,
};

// ---------- helpers ----------

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const initials = name => esc(name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2));

function avatar(d, size = '') {
  const img = d.image
    ? `<img src="${esc(d.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
    : '';
  return `<span class="avatar ${size} attr-${esc(d.attribute)}" aria-hidden="true">${initials(d.name)}${img}</span>`;
}

function badges(d) {
  return [
    d.number && `<span class="badge">#${esc(d.number)}</span>`,
    d.stage && `<span class="badge">${esc(d.stage)}</span>`,
    d.attribute && `<span class="badge ${esc(d.attribute)}">${esc(d.attribute)}</span>`,
    d.type && `<span class="badge">${esc(d.type)}</span>`,
    d.personality && `<span class="badge">${esc(d.personality)}</span>`,
    d.verified === false && `<span class="badge unverified">unverified</span>`,
  ].filter(Boolean).join('');
}

function reqsHTML(req = {}) {
  const parts = [];
  if (req.level) parts.push(`Lv ${esc(req.level)}+`);
  if (req.agentRank) parts.push(`Agent Rank ${esc(req.agentRank)}+`);
  if (req.talent) parts.push(`Talent ${esc(req.talent)}+`);
  for (const [k, v] of Object.entries(req.stats || {})) {
    if (v !== '' && v != null) parts.push(`${esc(k)} ${esc(v)}+`);
  }
  let html = parts.length
    ? `<div class="reqs">${parts.map(p => `<span class="req">${p}</span>`).join('')}</div>`
    : '';
  if (req.other) html += `<div class="req-other">${esc(req.other)}</div>`;
  return html || '<div class="req-none">No requirements entered yet</div>';
}

function digimonName(id) {
  return store.getDigimon(id)?.name ?? id;
}

function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function digimonOptions(selected = '') {
  return store.sortDigimon(store.allDigimon()).map(d =>
    `<option value="${esc(d.id)}" ${d.id === selected ? 'selected' : ''}>${esc(d.name)} (${esc(d.stage || '?')})</option>`
  ).join('');
}

function setTitle(title, back = false) {
  titleEl.textContent = title;
  backBtn.hidden = !back;
  document.title = `${title} · DigiDex: Time Stranger`;
}

backBtn.addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.hash = '#/dex';
});

// ---------- router ----------

const routes = [
  [/^#\/dex$/, renderDex, 'dex'],
  [/^#\/digimon\/(.+)$/, renderDigimon, 'dex'],
  [/^#\/planner$/, renderPlanner, 'planner'],
  [/^#\/team$/, renderTeam, 'team'],
  [/^#\/team\/(.+)$/, renderMember, 'team'],
  [/^#\/data$/, renderData, 'data'],
];

function route() {
  const hash = location.hash || '#/dex';
  for (const [re, fn, tab] of routes) {
    const m = hash.match(re);
    if (!m) continue;
    document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
    fn(...m.slice(1).map(decodeURIComponent));
    return;
  }
  location.replace('#/dex');
}

function rerender({ keepScroll = true } = {}) {
  const y = window.scrollY;
  route();
  if (keepScroll) window.scrollTo(0, y);
}

window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });

// ---------- Dex ----------

function renderDex() {
  setTitle('DigiDex');
  const data = store.getData();
  const stages = ['All', ...data.stages.filter(s => data.digimon.some(d => d.stage === s))];
  const attrs = ['All', ...new Set(data.digimon.map(d => d.attribute).filter(Boolean))];
  const tracked = new Set(store.getTeam().map(m => m.digimonId));

  const q = ui.dexQuery.trim().toLowerCase();
  const list = store.sortDigimon(data.digimon, ui.dexSort).filter(d =>
    (ui.dexStage === 'All' || d.stage === ui.dexStage) &&
    (ui.dexAttr === 'All' || d.attribute === ui.dexAttr) &&
    (!q || d.name.toLowerCase().includes(q) || (d.type || '').toLowerCase().includes(q) ||
      String(d.number) === q.replace('#', '') ||
      (d.traits || []).some(t => t.toLowerCase().includes(q)))
  );

  view.innerHTML = `
    <input class="search" type="search" id="dex-search" placeholder="Search name, #, type or trait…" value="${esc(ui.dexQuery)}" autocomplete="off">
    <div class="chips" id="stage-chips">
      ${stages.map(s => `<button class="chip ${s === ui.dexStage ? 'active' : ''}" data-stage="${esc(s)}">${esc(s)}</button>`).join('')}
    </div>
    <div class="chips" id="attr-chips">
      ${attrs.map(a => `<button class="chip ${a === ui.dexAttr ? 'active' : ''}" data-attr="${esc(a)}">${esc(a)}</button>`).join('')}
    </div>
    <div class="count-row">
      <span class="count">${list.length} of ${data.digimon.length} Digimon</span>
      <label class="sort">Sort
        <select id="dex-sort">
          ${[['number', 'No.'], ['stage', 'Stage'], ['name', 'A–Z']].map(([v, l]) =>
            `<option value="${v}" ${v === ui.dexSort ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </label>
    </div>
    ${list.length ? `<ul class="list">${list.map(d => `
      <li><a class="list-item" href="#/digimon/${encodeURIComponent(d.id)}">
        ${avatar(d)}
        <span class="grow">
          <span class="name">${esc(d.name)} ${tracked.has(d.id) ? '<span class="star" title="On your team">&#9733;</span>' : ''}</span>
          <span class="sub">${esc([d.number && `#${d.number}`, d.stage, d.attribute, d.type].filter(Boolean).join(' · '))}</span>
        </span>
        ${d.verified === false ? '<span class="badge unverified">?</span>' : ''}
      </a></li>`).join('')}</ul>`
      : `<p class="empty">No Digimon match. Add one from the Data tab.</p>`}
  `;

  const search = view.querySelector('#dex-search');
  search.addEventListener('input', () => {
    ui.dexQuery = search.value;
    const pos = search.selectionStart;
    rerender();
    const s = view.querySelector('#dex-search');
    s.focus();
    s.setSelectionRange(pos, pos);
  });
  view.querySelector('#dex-sort').onchange = e => { ui.dexSort = e.target.value; rerender(); };
  view.querySelectorAll('[data-stage]').forEach(b => b.addEventListener('click', () => { ui.dexStage = b.dataset.stage; rerender(); }));
  view.querySelectorAll('[data-attr]').forEach(b => b.addEventListener('click', () => { ui.dexAttr = b.dataset.attr; rerender(); }));
}

// ---------- Digimon detail ----------

function evoRow(e, otherId) {
  const other = store.getDigimon(otherId);
  return `
    <div class="evo">
      <div class="evo-head">
        <a href="#/digimon/${encodeURIComponent(otherId)}">${esc(other?.name ?? otherId)}</a>
        <span>
          <span class="dir">${esc(other?.stage ?? '')}</span>
          <button class="btn small" data-edit-evo="${esc(e.from)}|${esc(e.to)}" aria-label="Edit requirements">Edit</button>
        </span>
      </div>
      ${reqsHTML(e.requirements)}
      ${e.verified === false ? '<span class="badge unverified">unverified</span>' : ''}
    </div>`;
}

function treeHTML(currentId, depth = 2) {
  const line = store.lineOf(currentId, depth);
  const byStage = new Map();
  for (const d of line) {
    const key = d.stage || 'Unknown';
    if (!byStage.has(key)) byStage.set(key, []);
    byStage.get(key).push(d);
  }
  return `<div class="tree">${[...byStage].map(([stage, ds]) => `
    <div class="tree-col"><h4>${esc(stage)}</h4>
      ${ds.map(d => `<a class="tree-node ${d.id === currentId ? 'current' : ''}" href="#/digimon/${encodeURIComponent(d.id)}">${esc(d.name)}</a>`).join('')}
    </div>`).join('')}</div>`;
}

function statsHTML(stats) {
  const max = Math.max(...Object.values(stats), 1);
  return `<div class="stat-bars">${Object.entries(stats).map(([k, v]) => `
    <div class="stat-bar"><span>${esc(k)}</span>
      <div class="bar"><div style="width:${Math.round(100 * v / max)}%"></div></div>
      <b>${esc(v)}</b></div>`).join('')}</div>`;
}

const RESIST_LABEL = { weak: 'Weak', resist: 'Resist', null: 'Null', neutral: '–' };

function resistHTML(res = {}) {
  const row = obj => `<div class="resists">${Object.entries(obj || {}).map(([k, v]) =>
    `<span class="resist ${esc(v)}"><span>${esc(k)}</span><b>${esc(RESIST_LABEL[v] ?? v)}</b></span>`).join('')}</div>`;
  return `<h4 class="sub-h">Attribute</h4>${row(res.attribute)}<h4 class="sub-h">Element</h4>${row(res.element)}`;
}

function skillsHTML(skills) {
  return skills.map(sk => `
    <div class="skill">
      <div class="evo-head">
        <span>${sk.level != null ? `<span class="dir">Lv ${esc(sk.level)}</span> ` : ''}${esc(sk.name)}</span>
        <span class="dir">${esc([sk.element, sk.kind, sk.sp != null && `${sk.sp} SP`].filter(Boolean).join(' · '))}</span>
      </div>
      ${sk.description ? `<div class="req-other">${esc(sk.description)}</div>` : ''}
    </div>`).join('');
}

function renderDigimon(id) {
  const d = store.getDigimon(id);
  if (!d) {
    setTitle('Not found', true);
    view.innerHTML = `<p class="empty">That Digimon isn't in your data.</p>`;
    return;
  }
  setTitle(d.name, true);
  const next = store.evolutionsFrom(id);
  const prev = store.evolutionsTo(id);
  const members = store.getTeam().filter(m => m.digimonId === id);

  view.innerHTML = `
    <div class="hero">
      ${avatar(d, 'lg')}
      <div><h2>${esc(d.name)}</h2>${badges(d)}</div>
    </div>
    <div class="btn-row">
      <button class="btn primary" id="add-team">&#9733; Track</button>
      <button class="btn" id="plan-from">Plan from here</button>
      <button class="btn" id="edit-digimon">Edit</button>
    </div>
    ${members.length ? `<div class="card small">On your team: ${members.map(m =>
      `<a href="#/team/${m.uid}">${esc(m.nickname || d.name)}</a>`).join(', ')}</div>` : ''}
    ${d.notes ? `<div class="card"><h3>Notes</h3><div class="small">${esc(d.notes).replace(/\n/g, '<br>')}</div></div>` : ''}

    <div class="card">
      <h3>Digivolves to (${next.length})</h3>
      ${next.map(e => evoRow(e, e.to)).join('') || '<div class="req-none">None recorded</div>'}
      <button class="btn small" id="add-next">+ Add digivolution</button>
    </div>

    <div class="card">
      <h3>Digivolves from (${prev.length})</h3>
      ${prev.map(e => `
        <div class="evo">
          <div class="evo-head">
            <a href="#/digimon/${encodeURIComponent(e.from)}">${esc(digimonName(e.from))}</a>
            <button class="btn small" data-edit-evo="${esc(e.from)}|${esc(e.to)}">Edit</button>
          </div>
          ${reqsHTML(e.requirements)}
        </div>`).join('') || '<div class="req-none">None recorded</div>'}
      <button class="btn small" id="add-prev">+ Add pre-evolution</button>
    </div>

    <div class="card">
      <h3>Digivolution line</h3>
      <p class="small muted">${ui.fullLine ? 'Every Digimon connected to' : 'Up to 2 steps before and after'} ${esc(d.name)}.</p>
      ${treeHTML(id, ui.fullLine ? Infinity : 2)}
      <button class="btn small" id="toggle-line">${ui.fullLine ? 'Show nearby only' : 'Show full line'}</button>
    </div>

    ${d.stats99 ? `<div class="card"><h3>Level 99 stats</h3>${statsHTML(d.stats99)}</div>` : ''}
    ${d.resistances ? `<div class="card"><h3>Resistances</h3>${resistHTML(d.resistances)}</div>` : ''}
    ${d.specialSkills?.length ? `<div class="card"><h3>Special skill</h3>${skillsHTML(d.specialSkills)}</div>` : ''}
    ${d.attachmentSkills?.length ? `<div class="card"><h3>Learnable attachment skills</h3>${skillsHTML(d.attachmentSkills)}</div>` : ''}
    ${d.traits?.length ? `<div class="card"><h3>Traits</h3>${d.traits.map(t => `<span class="badge">${esc(t)}</span>`).join('')}</div>` : ''}
    ${d.source ? `<p class="small muted">Source: <a href="${esc(d.source)}" target="_blank" rel="noopener">Game8</a></p>` : ''}
  `;

  view.querySelector('#add-team').onclick = () => {
    const m = store.addMember({ digimonId: id });
    toast(`${d.name} added to My Team`);
    location.hash = `#/team/${m.uid}`;
  };
  view.querySelector('#plan-from').onclick = () => {
    ui.plannerFrom = id;
    location.hash = '#/planner';
  };
  view.querySelector('#toggle-line').onclick = () => { ui.fullLine = !ui.fullLine; rerender(); };
  view.querySelector('#edit-digimon').onclick = () => openDigimonForm(d);
  view.querySelector('#add-next').onclick = () => openEvolutionForm({ from: id });
  view.querySelector('#add-prev').onclick = () => openEvolutionForm({ to: id });
  view.querySelectorAll('[data-edit-evo]').forEach(b => b.addEventListener('click', ev => {
    ev.preventDefault();
    const [from, to] = b.dataset.editEvo.split('|');
    openEvolutionForm(store.getEvolution(from, to));
  }));
}

// ---------- Planner ----------

function pathHTML(path, doneCount = 0) {
  return `<ol class="path">${path.map((s, i) => `
    <li class="${i < doneCount ? 'done' : i === doneCount ? 'next' : ''}">
      <div class="evo">
        <div class="evo-head">
          <span>${esc(digimonName(s.from))} &#8594; <a href="#/digimon/${encodeURIComponent(s.to)}">${esc(digimonName(s.to))}</a></span>
          <span class="dir">${s.dir === 'up' ? 'Digivolve' : 'De-digivolve'}</span>
        </div>
        ${s.dir === 'up' ? reqsHTML(s.evo.requirements) : ''}
      </div>
    </li>`).join('')}</ol>`;
}

function renderPlanner() {
  setTitle('Digivolution Planner');
  const { plannerFrom: from, plannerTo: to } = ui;
  let result = '';
  if (from && to) {
    const path = store.findPath(from, to, { forwardOnly: ui.forwardOnly });
    if (path === null) {
      result = `<p class="empty">No route found from ${esc(digimonName(from))} to ${esc(digimonName(to))}${ui.forwardOnly ? ' using only digivolutions. Try allowing de-digivolution.' : '. Add the missing evolutions in the Data tab.'}</p>`;
    } else if (!path.length) {
      result = `<p class="empty">Pick two different Digimon.</p>`;
    } else {
      result = `
        <div class="card">
          <h3>${path.length} step${path.length === 1 ? '' : 's'}</h3>
          ${pathHTML(path)}
          <button class="btn primary" id="save-plan">&#9733; Track this plan</button>
        </div>`;
    }
  }

  view.innerHTML = `
    <div class="card">
      <label for="p-from">Start with</label>
      <select id="p-from"><option value="">Choose a Digimon…</option>${digimonOptions(from)}</select>
      <label for="p-to">Goal</label>
      <select id="p-to"><option value="">Choose a Digimon…</option>${digimonOptions(to)}</select>
      <label class="small" style="display:flex;gap:8px;align-items:center;margin-top:12px">
        <input type="checkbox" id="p-forward" style="width:auto" ${ui.forwardOnly ? 'checked' : ''}>
        Digivolve only (no de-digivolving)
      </label>
      <div class="btn-row"><button class="btn small" id="swap">&#8645; Swap</button></div>
    </div>
    ${result}
    ${from && !to ? `<div class="card"><h3>Line for ${esc(digimonName(from))}</h3>${treeHTML(from)}</div>` : ''}
  `;

  view.querySelector('#p-from').onchange = e => { ui.plannerFrom = e.target.value; rerender(); };
  view.querySelector('#p-to').onchange = e => { ui.plannerTo = e.target.value; rerender(); };
  view.querySelector('#p-forward').onchange = e => { ui.forwardOnly = e.target.checked; rerender(); };
  view.querySelector('#swap').onclick = () => {
    [ui.plannerFrom, ui.plannerTo] = [ui.plannerTo, ui.plannerFrom];
    rerender();
  };
  const save = view.querySelector('#save-plan');
  if (save) save.onclick = () => {
    const m = store.addMember({ digimonId: from, goalId: to });
    toast('Plan saved to My Team');
    location.hash = `#/team/${m.uid}`;
  };
}

// ---------- Team ----------

function memberPlan(m) {
  if (!m.goalId) return null;
  return store.findPath(m.digimonId, m.goalId);
}

function renderTeam() {
  setTitle('My Team');
  const team = store.getTeam();
  view.innerHTML = team.length ? `
    <ul class="list">${team.map(m => {
      const d = store.getDigimon(m.digimonId) || { name: m.digimonId };
      const plan = memberPlan(m);
      const goal = m.goalId ? digimonName(m.goalId) : null;
      const done = m.history.length - 1;
      const total = plan ? done + plan.length : 0;
      const status = !goal ? 'No goal set'
        : m.digimonId === m.goalId ? `Reached ${esc(goal)}!`
        : plan ? `Goal: ${esc(goal)} · ${plan.length} step${plan.length === 1 ? '' : 's'} left`
        : `Goal: ${esc(goal)} · no route`;
      return `<li><a class="list-item" href="#/team/${m.uid}">
        ${avatar(d)}
        <span class="grow">
          <span class="name">${esc(m.nickname || d.name)}</span>
          <span class="sub">${m.nickname ? esc(d.name) + ' · ' : ''}Lv ${esc(m.level)} · ${status}</span>
          ${total ? `<div class="progress"><div style="width:${Math.round(100 * done / total)}%"></div></div>` : ''}
        </span>
      </a></li>`;
    }).join('')}</ul>`
    : `<p class="empty">No Digimon tracked yet.<br>Open a Digimon in the Dex and tap <b>Track</b>, or save a route from the Planner.</p>`;
}

function renderMember(uid) {
  const m = store.getMember(uid);
  if (!m) { location.replace('#/team'); return; }
  const d = store.getDigimon(m.digimonId) || { id: m.digimonId, name: m.digimonId };
  setTitle(m.nickname || d.name, true);
  const plan = memberPlan(m);
  const next = store.evolutionsFrom(m.digimonId);

  view.innerHTML = `
    <div class="hero">
      ${avatar(d, 'lg')}
      <div>
        <h2>${esc(m.nickname || d.name)}</h2>
        <a href="#/digimon/${encodeURIComponent(d.id)}">${esc(d.name)}</a> ${badges(d)}
      </div>
    </div>

    <div class="card">
      <div class="stat-grid">
        <div><label for="m-nick">Nickname</label><input id="m-nick" value="${esc(m.nickname)}" placeholder="${esc(d.name)}"></div>
        <div><label for="m-level">Level</label><input id="m-level" type="number" inputmode="numeric" min="1" max="99" value="${esc(m.level)}"></div>
      </div>
      <label for="m-goal">Goal Digimon</label>
      <select id="m-goal"><option value="">No goal</option>${digimonOptions(m.goalId || '')}</select>
      <label for="m-notes">Notes</label>
      <textarea id="m-notes" placeholder="Skills to keep, stats to train…">${esc(m.notes)}</textarea>
    </div>

    ${m.goalId ? `<div class="card">
      <h3>Route to ${esc(digimonName(m.goalId))}</h3>
      ${m.digimonId === m.goalId ? '<p>Goal reached! &#127881;</p>'
        : plan ? `${pathHTML(plan)}<button class="btn primary" id="do-next">Done: ${esc(digimonName(plan[0].to))}</button>`
        : '<p class="muted">No route found with the current data.</p>'}
    </div>` : ''}

    <div class="card">
      <h3>Digivolve now</h3>
      ${next.length ? next.map(e => `
        <div class="evo">
          <div class="evo-head">
            <span>${esc(digimonName(e.to))}</span>
            <button class="btn small" data-move="${esc(e.to)}">Digivolve</button>
          </div>
          ${reqsHTML(e.requirements)}
        </div>`).join('') : '<div class="req-none">No digivolutions recorded</div>'}
    </div>

    <div class="card">
      <h3>History</h3>
      <div class="small">${m.history.map(id => esc(digimonName(id))).join(' &#8594; ')}</div>
      <div class="btn-row">
        <button class="btn small" id="undo" ${m.history.length < 2 ? 'disabled' : ''}>Undo last step</button>
        <button class="btn small danger" id="remove">Remove from team</button>
      </div>
    </div>
  `;

  const bind = (sel, key, parse = v => v) => {
    view.querySelector(sel).addEventListener('change', e => {
      store.updateMember(uid, { [key]: parse(e.target.value) });
      rerender();
    });
  };
  bind('#m-nick', 'nickname', v => v.trim());
  bind('#m-level', 'level', v => Math.max(1, Math.min(99, parseInt(v, 10) || 1)));
  bind('#m-goal', 'goalId', v => v || null);
  bind('#m-notes', 'notes');

  const move = to => { store.moveMember(uid, to); toast(`Now ${digimonName(to)}`); rerender(); };
  view.querySelector('#do-next')?.addEventListener('click', () => move(plan[0].to));
  view.querySelectorAll('[data-move]').forEach(b => b.addEventListener('click', () => move(b.dataset.move)));
  view.querySelector('#undo').onclick = () => { store.undoMove(uid); rerender(); };
  view.querySelector('#remove').onclick = () => {
    if (confirm(`Remove ${m.nickname || d.name} from your team?`)) {
      store.removeMember(uid);
      location.hash = '#/team';
    }
  };
}

// ---------- Data ----------

function renderData() {
  setTitle('Data');
  const data = store.getData();
  const unverifiedD = data.digimon.filter(d => d.verified === false).length;
  const unverifiedE = data.evolutions.filter(e => e.verified === false).length;

  view.innerHTML = `
    <div class="card">
      <h3>Your dataset</h3>
      <p class="small">${data.digimon.length} Digimon · ${data.evolutions.length} digivolutions<br>
      <span class="muted">${unverifiedD} Digimon and ${unverifiedE} digivolutions still marked unverified.</span></p>
      ${data.source ? `<p class="small">Reference: <a href="${esc(data.source)}" target="_blank" rel="noopener">Grindosaur digivolution planner</a></p>` : ''}
      <p class="small muted">${store.hasLocalEdits() ? 'Using your edited copy (saved on this device).' : 'Using the data bundled with the app.'}</p>
    </div>

    <div class="card">
      <h3>Add</h3>
      <div class="btn-row">
        <button class="btn" id="new-digimon">+ Digimon</button>
        <button class="btn" id="new-evo">+ Digivolution</button>
      </div>
    </div>

    <div class="card">
      <h3>Backup &amp; share</h3>
      <p class="small muted">Export your data as JSON to back it up or move it to another phone. Import replaces or merges.</p>
      <div class="btn-row">
        <button class="btn" id="export">Export JSON</button>
        <button class="btn" id="import">Import file</button>
        <button class="btn" id="paste">Paste JSON</button>
      </div>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
    </div>

    <div class="card">
      <h3>Unverified entries</h3>
      ${unverifiedD + unverifiedE ? `<ul class="list">
        ${data.digimon.filter(d => d.verified === false).map(d =>
          `<li><a class="list-item" href="#/digimon/${encodeURIComponent(d.id)}"><span class="grow"><span class="name">${esc(d.name)}</span><span class="sub">Digimon info</span></span></a></li>`).join('')}
        ${data.evolutions.filter(e => e.verified === false).map(e =>
          `<li><a class="list-item" href="#" data-edit-evo="${esc(e.from)}|${esc(e.to)}"><span class="grow"><span class="name">${esc(digimonName(e.from))} &#8594; ${esc(digimonName(e.to))}</span><span class="sub">Digivolution requirements</span></span></a></li>`).join('')}
      </ul>` : '<p class="small muted">Everything is verified.</p>'}
    </div>

    <div class="card">
      <h3>Reset</h3>
      <div class="btn-row">
        <button class="btn" id="merge-bundled">Merge app data updates</button>
        <button class="btn danger" id="reset">Reset to app data</button>
      </div>
      <p class="small muted">Merge adds new entries from the app's bundled data without losing your edits. Reset throws your edits away. Your team isn't affected.</p>
    </div>
  `;

  view.querySelector('#new-digimon').onclick = () => openDigimonForm();
  view.querySelector('#new-evo').onclick = () => openEvolutionForm();
  view.querySelector('#export').onclick = () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `digidex-time-stranger-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const file = view.querySelector('#import-file');
  view.querySelector('#import').onclick = () => file.click();
  file.onchange = async () => {
    if (file.files[0]) doImport(await file.files[0].text());
  };
  view.querySelector('#paste').onclick = () => openPasteForm();
  view.querySelector('#merge-bundled').onclick = () => { store.mergeBundled(); toast('Merged'); rerender(); };
  view.querySelector('#reset').onclick = () => {
    if (confirm('Throw away all your data edits and go back to the bundled data?')) {
      store.resetToBundled();
      toast('Reset');
      rerender();
    }
  };
  view.querySelectorAll('[data-edit-evo]').forEach(b => b.addEventListener('click', ev => {
    ev.preventDefault();
    const [from, to] = b.dataset.editEvo.split('|');
    openEvolutionForm(store.getEvolution(from, to));
  }));
}

function doImport(text) {
  const merge = confirm('Merge into your current data?\n\nOK = merge (keeps your edits)\nCancel = replace everything');
  try {
    const d = store.importJSON(text, { merge });
    toast(`Loaded ${d.digimon.length} Digimon`);
    rerender();
  } catch (err) {
    alert(`Couldn't import: ${err.message}`);
  }
}

// ---------- Forms ----------

function openDialog(html, onSubmit) {
  dialog.innerHTML = `<form method="dialog" id="dlg-form">${html}</form>`;
  const form = dialog.querySelector('form');
  form.addEventListener('submit', e => {
    const action = e.submitter?.value;
    if (action === 'cancel') return;
    e.preventDefault();
    if (onSubmit(new FormData(form), action) !== false) dialog.close();
  });
  dialog.showModal();
}

function openDigimonForm(d = null) {
  const data = store.getData();
  openDialog(`
    <h2>${d ? `Edit ${esc(d.name)}` : 'New Digimon'}</h2>
    <label for="f-name">Name</label>
    <input id="f-name" name="name" required value="${esc(d?.name)}">
    <label for="f-stage">Stage</label>
    <select id="f-stage" name="stage">${data.stages.map(s => `<option ${s === d?.stage ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
    <label for="f-attr">Attribute</label>
    <select id="f-attr" name="attribute">${store.ATTRIBUTES.map(a => `<option ${a === d?.attribute ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
    <label for="f-type">Type</label>
    <input id="f-type" name="type" value="${esc(d?.type)}">
    <label for="f-pers">Personality</label>
    <input id="f-pers" name="personality" value="${esc(d?.personality)}">
    <label for="f-notes">Notes</label>
    <textarea id="f-notes" name="notes">${esc(d?.notes)}</textarea>
    <label class="small" style="display:flex;gap:8px;align-items:center">
      <input type="checkbox" name="verified" style="width:auto" ${d && d.verified !== false ? 'checked' : ''}> Verified against the reference site
    </label>
    <div class="btn-row">
      ${d ? '<button class="btn danger" value="delete">Delete</button>' : ''}
      <button class="btn" value="cancel" formnovalidate>Cancel</button>
      <button class="btn primary" value="save">Save</button>
    </div>
  `, (fd, action) => {
    if (action === 'delete') {
      if (!confirm(`Delete ${d.name} and all its digivolutions?`)) return false;
      store.deleteDigimon(d.id);
      location.hash = '#/dex';
      return;
    }
    const entry = {
      name: fd.get('name').trim(),
      stage: fd.get('stage'),
      attribute: fd.get('attribute'),
      type: fd.get('type').trim(),
      personality: fd.get('personality').trim(),
      notes: fd.get('notes').trim(),
      verified: fd.get('verified') === 'on',
    };
    const id = store.upsertDigimon(entry, d?.id);
    toast('Saved');
    if (!d) location.hash = `#/digimon/${encodeURIComponent(id)}`;
    else rerender();
  });
}

function openEvolutionForm(evo = {}) {
  const data = store.getData();
  const existing = evo.from && evo.to ? store.getEvolution(evo.from, evo.to) : null;
  const req = existing?.requirements || {};
  openDialog(`
    <h2>${existing ? 'Edit digivolution' : 'New digivolution'}</h2>
    <label for="e-from">From</label>
    <select id="e-from" name="from" required><option value="">Choose…</option>${digimonOptions(evo.from)}</select>
    <label for="e-to">To</label>
    <select id="e-to" name="to" required><option value="">Choose…</option>${digimonOptions(evo.to)}</select>
    <div class="stat-grid">
      <div><label for="e-level">Level</label><input id="e-level" name="level" type="number" inputmode="numeric" value="${esc(req.level)}"></div>
      <div><label for="e-rank">Agent Rank</label><input id="e-rank" name="agentRank" type="number" inputmode="numeric" value="${esc(req.agentRank)}"></div>
      <div><label for="e-talent">Talent</label><input id="e-talent" name="talent" type="number" inputmode="numeric" value="${esc(req.talent)}"></div>
      ${data.stats.map(s => `
        <div><label for="e-${esc(s)}">${esc(s)}</label>
        <input id="e-${esc(s)}" name="stat:${esc(s)}" type="number" inputmode="numeric" value="${esc(req.stats?.[s])}"></div>`).join('')}
    </div>
    <label for="e-other">Other conditions</label>
    <textarea id="e-other" name="other" placeholder="Items, skills, personality, story progress…">${esc(req.other)}</textarea>
    <label class="small" style="display:flex;gap:8px;align-items:center">
      <input type="checkbox" name="verified" style="width:auto" ${existing && existing.verified !== false ? 'checked' : ''}> Verified against the reference site
    </label>
    <div class="btn-row">
      ${existing ? '<button class="btn danger" value="delete">Delete</button>' : ''}
      <button class="btn" value="cancel" formnovalidate>Cancel</button>
      <button class="btn primary" value="save">Save</button>
    </div>
  `, (fd, action) => {
    if (action === 'delete') {
      store.deleteEvolution(existing.from, existing.to);
      toast('Deleted');
      rerender();
      return;
    }
    const from = fd.get('from');
    const to = fd.get('to');
    if (from === to) { alert('A Digimon can’t digivolve into itself.'); return false; }
    const num = v => (v === '' || v == null ? undefined : Number(v));
    const stats = {};
    for (const s of data.stats) {
      const v = num(fd.get(`stat:${s}`));
      if (v !== undefined) stats[s] = v;
    }
    const requirements = { level: num(fd.get('level')), agentRank: num(fd.get('agentRank')), talent: num(fd.get('talent')), stats, other: fd.get('other').trim() || undefined };
    store.upsertEvolution({ from, to, requirements, verified: fd.get('verified') === 'on' }, existing);
    toast('Saved');
    rerender();
  });
}

function openPasteForm() {
  openDialog(`
    <h2>Paste JSON</h2>
    <p class="small muted">Paste data exported from this app (same format as <code>data/digimon.json</code>).</p>
    <textarea name="json" style="min-height:200px" required></textarea>
    <div class="btn-row">
      <button class="btn" value="cancel" formnovalidate>Cancel</button>
      <button class="btn primary" value="import">Import</button>
    </div>
  `, fd => { setTimeout(() => doImport(fd.get('json')), 0); });
}

// ---------- boot ----------

await store.init();
route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
}
