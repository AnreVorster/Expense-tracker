import {
  parseCSV, findHeaderRow, guessMapping, guessDateOrder, rowsToTransactions,
  mergeTransactions, categorize, suggestPattern, monthKey,
} from './parse.js';
import { DEFAULT_CATEGORIES, DEFAULT_RULES } from './defaults.js';
import { sampleCSV } from './sample.js';

const STORE_KEY = 'monthly-expenses-v1';
const UNCAT = '__uncat';
const $ = (id) => document.getElementById(id);

// ---------- State ----------
let state = load();
let ui = { month: null, search: '', catFilter: '' };

function freshState() {
  return {
    version: 1,
    currency: 'ZAR',
    categories: structuredClone(DEFAULT_CATEGORIES),
    rules: structuredClone(DEFAULT_RULES),
    transactions: [],
    mappings: {}, // header signature -> saved column mapping
  };
}

let storageOk = true;
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { ...freshState(), ...s };
    }
  } catch (e) {
    storageOk = false;
  }
  return freshState();
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    storageOk = true;
  } catch (e) {
    storageOk = false;
  }
  $('storageWarning').hidden = storageOk;
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ---------- Helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let fmtCache = {};
function money(n, opts = {}) {
  const key = state.currency + (opts.whole ? 'w' : '');
  if (!fmtCache[key]) {
    try {
      fmtCache[key] = new Intl.NumberFormat('en-ZA', {
        style: 'currency', currency: state.currency,
        minimumFractionDigits: opts.whole ? 0 : 2, maximumFractionDigits: opts.whole ? 0 : 2,
      });
    } catch { fmtCache[key] = { format: (x) => x.toFixed(2) }; }
  }
  return fmtCache[key].format(n);
}
function compact(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(1) + 'm';
  if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
  return Math.round(n).toString();
}
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthLabel(m, long = true) {
  const [y, mo] = m.split('-').map(Number);
  if (!long) return MONTH_NAMES[mo - 1];
  return new Date(y, mo - 1, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
}
function shiftMonth(m, delta) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fmtDate(iso) {
  const [, mo, d] = iso.split('-').map(Number);
  return `${d} ${MONTH_NAMES[mo - 1]}`;
}

function catByName(name) { return state.categories.find(c => c.name === name); }
/** The category a transaction ends up in: manual choice first, then rules. */
function resolve(t) {
  if (t.category && catByName(t.category)) return { name: t.category, auto: false };
  const c = categorize(t.description, state.rules);
  return c && catByName(c) ? { name: c, auto: true } : { name: null, auto: false };
}

function allMonths() {
  const set = new Set(state.transactions.map(t => monthKey(t.date)));
  return [...set].sort();
}

/** Spending / income for one month. Transfers are excluded from both. Refunds reduce their category. */
function summarize(month) {
  const out = { spent: 0, income: 0, byCat: {}, uncatCount: 0, uncatAmount: 0, count: 0 };
  for (const t of state.transactions) {
    if (monthKey(t.date) !== month) continue;
    out.count++;
    const { name } = resolve(t);
    if (!name) {
      out.uncatCount++;
      if (t.amount < 0) {
        out.spent += -t.amount;
        out.byCat[UNCAT] = (out.byCat[UNCAT] || 0) - t.amount;
        out.uncatAmount += -t.amount;
      } else out.income += t.amount;
      continue;
    }
    const type = catByName(name).type;
    if (type === 'transfer') continue;
    if (type === 'income') { out.income += t.amount; continue; }
    out.spent += -t.amount;
    out.byCat[name] = (out.byCat[name] || 0) - t.amount;
  }
  return out;
}

// ---------- Rendering ----------
function render() {
  const has = state.transactions.length > 0;
  $('emptyState').hidden = has;
  $('dashboard').hidden = !has;
  $('monthNav').hidden = !has;
  $('storageWarning').hidden = storageOk;
  if (!has) return;

  const months = allMonths();
  if (!ui.month || !months.includes(ui.month)) ui.month = months[months.length - 1];

  const sel = $('monthSelect');
  sel.innerHTML = months.slice().reverse().map(m => `<option value="${m}">${monthLabel(m)}</option>`).join('');
  sel.value = ui.month;
  $('prevMonth').disabled = ui.month === months[0];
  $('nextMonth').disabled = ui.month === months[months.length - 1];

  const cur = summarize(ui.month);
  const prevMonths = [1, 2, 3].map(i => shiftMonth(ui.month, -i)).filter(m => m >= months[0]);
  const prevSums = prevMonths.map(summarize);
  const avg = (fn) => prevSums.length ? prevSums.reduce((a, s) => a + fn(s), 0) / prevSums.length : null;

  // The latest month is usually still in progress: comparing it to full months is misleading
  // (salary may not have landed yet), so say so instead of showing a scary delta.
  const lastDate = state.transactions.reduce((m, t) => (t.date > m ? t.date : m), '');
  const [ly, lm, ld] = lastDate.split('-').map(Number);
  const partial = ui.month === months[months.length - 1] && ld < new Date(ly, lm, 0).getDate() - 1 ? lastDate : null;
  renderTiles(cur, partial ? () => null : avg, partial);
  renderCategories(cur, prevSums);
  renderTrend(months);
  renderTable();
}

function delta(curV, avgV, goodWhenDown) {
  if (avgV === null || avgV === 0) return '';
  const pct = ((curV - avgV) / Math.abs(avgV)) * 100;
  if (Math.abs(pct) < 1) return 'about the same as your 3-month average';
  const up = pct > 0;
  const cls = goodWhenDown ? (up ? 'up' : 'down') : (up ? 'down' : 'up');
  return `<span class="${cls}">${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%</span> vs 3-month avg`;
}

function renderTiles(cur, avg, partial) {
  $('tSpent').textContent = money(cur.spent);
  $('tSpentSub').innerHTML = delta(cur.spent, avg(s => s.spent), true);
  $('tIncome').textContent = money(cur.income);
  $('tIncomeSub').innerHTML = delta(cur.income, avg(s => s.income), false);
  const net = cur.income - cur.spent;
  $('tNet').textContent = money(net);
  $('tNet').className = 'tile-value ' + (net < 0 ? 'up' : '');
  $('tNetSub').textContent = cur.income > 0 ? `${Math.round((net / cur.income) * 100)}% of income kept` : '';
  if (partial) {
    $('tSpentSub').textContent = `Month in progress — data up to ${fmtDate(partial)}`;
    $('tIncomeSub').textContent = 'Income may not have arrived yet';
    $('tNet').className = 'tile-value';
    if (net < 0) $('tNetSub').textContent = 'So far this month';
  }
  $('tUncatVal').textContent = cur.uncatCount;
  $('tUncatSub').textContent = cur.uncatCount ? `${money(cur.uncatAmount)} of spending — click to sort` : 'All sorted';
  $('tUncat').disabled = !cur.uncatCount;
}

function renderCategories(cur, prevSums) {
  const entries = Object.entries(cur.byCat).filter(([, v]) => Math.abs(v) >= 0.005).sort((a, b) => b[1] - a[1]);
  const prevAvg = (name) => prevSums.length ? prevSums.reduce((a, s) => a + (s.byCat[name] || 0), 0) / prevSums.length : null;
  const max = Math.max(1, ...entries.map(([n, v]) => Math.max(v, prevAvg(n) || 0)));
  $('catHint').hidden = !prevSums.length;
  if (!entries.length) {
    $('catBars').innerHTML = '<p class="muted small">No spending this month.</p>';
    return;
  }
  $('catBars').innerHTML = entries.map(([name, v]) => {
    const isUn = name === UNCAT;
    const color = isUn ? 'var(--spend)' : (catByName(name)?.color || '#999');
    const a = prevAvg(name);
    const w = Math.max(0, (v / max) * 100);
    let sub = '';
    if (a !== null && a > 0) {
      const d = v - a;
      if (Math.abs(d) >= Math.max(1, a * 0.1)) sub = `<small class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${money(Math.abs(d), { whole: true })}</small>`;
      else sub = '<small>≈ usual</small>';
    } else if (prevSums.length) sub = '<small>new</small>';
    const pct = cur.spent > 0 ? Math.round((v / cur.spent) * 100) : 0;
    const label = isUn ? 'Uncategorised' : name;
    const filterVal = isUn ? UNCAT : name;
    return `<button class="catrow ${ui.catFilter === filterVal ? 'active' : ''}" data-cat="${esc(filterVal)}" title="${esc(label)}: ${pct}% of spending">
      <span class="catname">${esc(label)}</span>
      <span class="bar"><span style="width:${w}%;background:${color}"></span>${a ? `<i style="left:calc(${(a / max) * 100}% - 1px)" title="3-month average ${money(a, { whole: true })}"></i>` : ''}</span>
      <span class="catamt">${money(v, { whole: true })}${sub}</span>
    </button>`;
  }).join('');
}

function renderTrend(months) {
  const last = months[months.length - 1];
  const series = [];
  for (let i = 11; i >= 0; i--) {
    const m = shiftMonth(last, -i);
    if (m < months[0]) continue;
    const s = summarize(m);
    series.push({ m, spent: s.spent, income: s.income });
  }
  const W = 520, H = 220, padL = 40, padB = 26, padT = 10;
  const max = Math.max(1, ...series.map(s => Math.max(s.spent, s.income))) * 1.08;
  const n = series.length;
  const slot = (W - padL) / Math.max(n, 6);
  const bw = Math.min(16, slot * 0.32);
  const y = (v) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = niceTicks(max, 4);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Spending and income by month">`;
  for (const t of ticks) {
    svg += `<line class="grid" x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end">${compact(t)}</text>`;
  }
  series.forEach((s, i) => {
    const cx = padL + slot * i + slot / 2;
    const selected = s.m === ui.month;
    svg += `<g class="col" data-month="${s.m}" style="cursor:pointer">`;
    svg += `<rect class="${selected ? 'selbg' : ''}" x="${cx - slot / 2 + 2}" y="${padT}" width="${slot - 4}" height="${H - padT - padB + 18}" rx="6" fill="transparent"/>`;
    svg += `<rect class="bar-s ${selected ? 'sel' : ''}" x="${cx - bw - 1}" y="${y(s.spent)}" width="${bw}" height="${Math.max(0, y(0) - y(s.spent))}" rx="2"><title>${monthLabel(s.m)} — spent ${money(s.spent)}</title></rect>`;
    svg += `<rect class="bar-i ${selected ? 'sel' : ''}" x="${cx + 1}" y="${y(s.income)}" width="${bw}" height="${Math.max(0, y(0) - y(s.income))}" rx="2"><title>${monthLabel(s.m)} — income ${money(s.income)}</title></rect>`;
    svg += `<text x="${cx}" y="${H - 8}" text-anchor="middle" style="${selected ? 'fill:var(--text);font-weight:600' : ''}">${monthLabel(s.m, false)}</text>`;
    svg += `</g>`;
  });
  svg += `</svg>`;
  $('trend').innerHTML = svg;
}
function niceTicks(max, count) {
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(x => x * mag).find(x => x >= raw) || raw;
  const out = [];
  for (let v = 0; v <= max; v += step) out.push(v);
  return out;
}

function categoryOptions(selected, { includeUncat = true } = {}) {
  let html = includeUncat ? `<option value="">— Uncategorised —</option>` : '';
  const groups = { expense: 'Spending', income: 'Income', transfer: 'Not counted' };
  for (const [type, label] of Object.entries(groups)) {
    const cats = state.categories.filter(c => c.type === type);
    if (!cats.length) continue;
    html += `<optgroup label="${label}">` + cats.map(c => `<option ${c.name === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('') + '</optgroup>';
  }
  return html;
}

function renderTable() {
  // Filter dropdown
  const cf = $('catFilter');
  cf.innerHTML = `<option value="">All categories</option><option value="${UNCAT}">Uncategorised</option>` +
    state.categories.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
  cf.value = ui.catFilter;

  const q = ui.search.trim().toLowerCase();
  const rows = state.transactions
    .filter(t => monthKey(t.date) === ui.month)
    .map(t => ({ t, r: resolve(t) }))
    .filter(({ t, r }) => {
      if (q && !t.description.toLowerCase().includes(q)) return false;
      if (ui.catFilter === UNCAT) return !r.name;
      if (ui.catFilter) return r.name === ui.catFilter;
      return true;
    })
    .sort((a, b) => b.t.date.localeCompare(a.t.date) || a.t.amount - b.t.amount);

  const multiAccount = new Set(state.transactions.map(t => t.account || '')).size > 1;
  $('txBody').innerHTML = rows.map(({ t, r }) => `
    <tr data-id="${t.id}">
      <td class="date">${fmtDate(t.date)}</td>
      <td class="desc"><span class="d">${fmtDate(t.date)}</span>${esc(t.description)}${multiAccount && t.account ? `<span class="acct">${esc(t.account)}</span>` : ''}</td>
      <td><select class="cat ${!r.name ? 'uncat' : r.auto ? 'auto' : ''}" title="${r.auto ? 'Set by a rule' : r.name ? 'Set by you' : 'Not categorised'}">${categoryOptions(r.name)}</select></td>
      <td class="amt ${t.amount > 0 ? 'pos' : ''}">${t.amount > 0 ? '+' : ''}${money(t.amount)}</td>
      <td><button class="icon-btn del" title="Delete transaction" aria-label="Delete">×</button></td>
    </tr>`).join('') || `<tr><td colspan="5" class="muted">No transactions match.</td></tr>`;

  const filterName = ui.catFilter === UNCAT ? 'Uncategorised' : ui.catFilter;
  $('txTitle').textContent = filterName ? `${filterName} — ${monthLabel(ui.month)}` : `Transactions — ${monthLabel(ui.month)}`;
  const total = rows.reduce((a, { t }) => a + t.amount, 0);
  $('txFoot').textContent = `${rows.length} transaction${rows.length === 1 ? '' : 's'} · net ${money(total)}` +
    (filterName ? ' · ' : '') + (filterName ? 'click the category again to clear the filter' : '');
}

// ---------- Toast ----------
let toastTimer;
function toast(html, { ms = 4000, onMount } = {}) {
  const el = $('toast');
  el.innerHTML = html;
  el.hidden = false;
  clearTimeout(toastTimer);
  if (onMount) onMount(el);
  if (ms) toastTimer = setTimeout(() => (el.hidden = true), ms);
}
function hideToast() { $('toast').hidden = true; clearTimeout(toastTimer); }

// ---------- Dashboard events ----------
$('monthSelect').addEventListener('change', e => { ui.month = e.target.value; render(); });
$('prevMonth').addEventListener('click', () => step(-1));
$('nextMonth').addEventListener('click', () => step(1));
function step(d) {
  const months = allMonths();
  const i = months.indexOf(ui.month) + d;
  if (i >= 0 && i < months.length) { ui.month = months[i]; render(); }
}
$('search').addEventListener('input', e => { ui.search = e.target.value; renderTable(); });
$('catFilter').addEventListener('change', e => { ui.catFilter = e.target.value; render(); });
$('tUncat').addEventListener('click', () => {
  ui.catFilter = UNCAT; render();
  $('txTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('catBars').addEventListener('click', e => {
  const row = e.target.closest('.catrow');
  if (!row) return;
  ui.catFilter = ui.catFilter === row.dataset.cat ? '' : row.dataset.cat;
  render();
});
$('trend').addEventListener('click', e => {
  const g = e.target.closest('[data-month]');
  if (!g) return;
  if (allMonths().includes(g.dataset.month)) { ui.month = g.dataset.month; render(); }
});

$('txBody').addEventListener('change', e => {
  if (!e.target.classList.contains('cat')) return;
  const id = e.target.closest('tr').dataset.id;
  const t = state.transactions.find(x => x.id === id);
  const chosen = e.target.value || null;
  const ruleResult = categorize(t.description, state.rules);
  // Store as a manual choice only if it differs from what the rules would give.
  t.category = chosen && chosen !== ruleResult ? chosen : null;
  if (!chosen && ruleResult) t.category = null; // can't "uncategorise" a rule match; tell the user
  save();
  render();
  if (!chosen && ruleResult) {
    toast(`A rule puts this in <b>${esc(ruleResult)}</b>. Edit the rule under Categories &amp; rules to change it.`);
    return;
  }
  if (chosen) offerRule(t, chosen);
});

function offerRule(t, category) {
  const pattern = suggestPattern(t.description);
  if (!pattern) return;
  const matches = (p) => state.transactions.filter(x => !x.category && x.id !== t.id && categorize(x.description, [{ pattern: p, category }])).length;
  toast(`Always put <input id="rulePat" value="${esc(pattern)}" aria-label="Match text"> in <b>${esc(category)}</b>?
    <span class="small" id="ruleCount"></span>
    <button class="btn" id="ruleYes">Create rule</button><button class="link" id="ruleNo">No</button>`, {
    ms: 15000,
    onMount: (el) => {
      const inp = el.querySelector('#rulePat');
      const upd = () => { const n = matches(inp.value); el.querySelector('#ruleCount').textContent = n ? `(+${n} other${n === 1 ? '' : 's'})` : ''; };
      upd();
      inp.addEventListener('input', () => { upd(); clearTimeout(toastTimer); });
      inp.addEventListener('focus', () => clearTimeout(toastTimer));
      el.querySelector('#ruleNo').onclick = hideToast;
      el.querySelector('#ruleYes').onclick = () => {
        const p = inp.value.trim();
        if (!p) return;
        state.rules.unshift({ pattern: p, category });
        if (t.category === category) t.category = null; // now covered by the rule
        save(); render();
        toast(`Rule added: “${esc(p)}” → ${esc(category)}`);
      };
    },
  });
}

$('txBody').addEventListener('click', e => {
  if (!e.target.classList.contains('del')) return;
  const id = e.target.closest('tr').dataset.id;
  const idx = state.transactions.findIndex(x => x.id === id);
  const [removed] = state.transactions.splice(idx, 1);
  save(); render();
  toast(`Deleted “${esc(removed.description)}” <button class="link" id="undoDel">Undo</button>`, {
    ms: 6000,
    onMount: el => el.querySelector('#undoDel').onclick = () => { state.transactions.splice(idx, 0, removed); save(); render(); hideToast(); },
  });
});

// ---------- Import ----------
let queue = [];      // [{ name, text }]
let current = null;  // { name, rows, header, data, mapping, sig }

async function startImport(files) {
  queue = [];
  for (const f of files) queue.push({ name: f.name, text: await f.text() });
  if (!queue.length) return;
  if (!$('importDialog').open) $('importDialog').showModal();
  nextFile();
}

function nextFile() {
  const f = queue.shift();
  if (!f) { $('importDialog').close(); return; }
  $('importPick').hidden = true;
  $('importMap').hidden = false;
  $('importMsg').textContent = queue.length ? `${queue.length} more file${queue.length === 1 ? '' : 's'} after this one` : '';

  if (/^%PDF/.test(f.text.slice(0, 5))) {
    showImportError(`${f.name} is a PDF. Download your transactions as CSV instead (see "Where do I get a CSV?").`);
    return;
  }
  const rows = parseCSV(f.text);
  if (rows.length < 2) {
    showImportError(`${f.name} doesn't look like a CSV with transactions.`);
    return;
  }
  const h = findHeaderRow(rows);
  const width = Math.max(...rows.map(r => r.length));
  const header = h >= 0 ? rows[h] : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
  const data = rows.slice(h + 1).filter(r => r.length >= 2);
  const sig = header.map(x => x.toLowerCase()).join('|');
  const saved = state.mappings[sig];
  const mapping = saved?.mapping || guessMapping(header, data);
  const dateOrder = saved?.dateOrder || guessDateOrder(data.map(r => r[mapping.date]));
  current = { name: f.name, header, data, sig, preamble: h };

  const opts = (sel) => `<option value="-1">—</option>` + header.map((c, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(c || `Column ${i + 1}`)}${data[0] && data[0][i] ? ` (e.g. ${esc(String(data[0][i]).slice(0, 24))})` : ''}</option>`).join('');
  $('mDate').innerHTML = opts(mapping.date);
  $('mDesc').innerHTML = opts(mapping.description);
  $('mAmount').innerHTML = opts(mapping.amount);
  $('mDebit').innerHTML = opts(mapping.debit);
  $('mCredit').innerHTML = opts(mapping.credit);
  $('mStyle').value = mapping.amount >= 0 || (mapping.debit < 0 && mapping.credit < 0) ? 'single' : 'split';
  $('mOrder').value = dateOrder;
  $('mInvert').checked = !!saved?.invert;
  $('mAccount').value = saved?.account || guessAccount(f.name, rows.slice(0, Math.max(h, 0)));
  $('importFileInfo').textContent = `${f.name} · ${data.length} rows` + (h > 0 ? ` · skipped ${h} line${h === 1 ? '' : 's'} of statement header` : '') + (saved ? ' · using the columns you chose last time for this format' : '');
  updatePreview();
}

function guessAccount(name, preamble) {
  const text = (preamble.flat().join(' ') + ' ' + name).toLowerCase();
  if (/credit\s*card|creditcard/.test(text)) return 'Credit card';
  if (/savings/.test(text)) return 'Savings';
  if (/cheque|current|transaction/.test(text)) return 'Cheque';
  return '';
}

function showImportError(msg) {
  current = null;
  $('importMap').hidden = true;
  $('importPick').hidden = false;
  $('importConfirm').disabled = !queue.length;
  $('importConfirm').textContent = queue.length ? 'Skip to next file' : 'Import';
  $('importMsg').innerHTML = `<span class="up">${esc(msg)}</span>`;
}

function readMapping() {
  const split = $('mStyle').value === 'split';
  $('lAmount').hidden = split; $('lDebit').hidden = !split; $('lCredit').hidden = !split;
  return {
    date: +$('mDate').value,
    description: +$('mDesc').value,
    amount: split ? -1 : +$('mAmount').value,
    debit: split ? +$('mDebit').value : -1,
    credit: split ? +$('mCredit').value : -1,
  };
}

const BALANCE_ROW = /^(opening|closing) balance|balance (brought|carried) forward|^balance b\/?f|^balance c\/?f/i;

function parsedCurrent() {
  const mapping = readMapping();
  const res = rowsToTransactions(current.data, { mapping, dateOrder: $('mOrder').value, invert: $('mInvert').checked });
  res.transactions = res.transactions.filter(t => !BALANCE_ROW.test(t.description));
  return { ...res, mapping };
}

function updatePreview() {
  if (!current) return;
  const { transactions, skipped, mapping } = parsedCurrent();
  const ok = mapping.date >= 0 && (mapping.amount >= 0 || mapping.debit >= 0 || mapping.credit >= 0);
  const { added, duplicates } = mergeTransactions(state.transactions, transactions);
  const out = transactions.filter(t => t.amount < 0).length;
  const dates = transactions.map(t => t.date).sort();
  const parts = [];
  parts.push(`<b>${transactions.length}</b> transactions`);
  if (dates.length) parts.push(`${fmtDate(dates[0])} ${dates[0].slice(0, 4)} – ${fmtDate(dates[dates.length - 1])} ${dates[dates.length - 1].slice(0, 4)}`);
  parts.push(`${out} out · ${transactions.length - out} in`);
  if (duplicates) parts.push(`<span class="muted">${duplicates} already imported</span>`);
  if (skipped.length) parts.push(`<span class="muted">${skipped.length} unreadable rows ignored</span>`);
  $('previewStats').innerHTML = parts.join(' · ');

  // Warn about the most common mistake: everything in one direction.
  let warn = '';
  if (transactions.length > 5 && out === 0) warn = 'Every amount is money in — if this is a credit card, tick "Flip signs".';
  else if (transactions.length > 5 && out === transactions.length) warn = 'Every amount is money out — check the amount column and "Flip signs".';
  else if (!ok) warn = 'Choose the date and amount columns.';
  else if (!transactions.length) warn = 'No rows could be read with these settings — check the columns and date format.';
  $('importMsg').innerHTML = warn ? `<span class="up">${warn}</span>` : (queue.length ? `${queue.length} more file${queue.length === 1 ? '' : 's'} after this one` : '');

  $('previewBody').innerHTML = transactions.slice(0, 60).map(t =>
    `<tr><td class="date">${t.date}</td><td>${esc(t.description)}</td><td class="amt ${t.amount > 0 ? 'pos' : ''}">${money(t.amount)}</td></tr>`).join('') +
    (transactions.length > 60 ? `<tr><td colspan="3" class="muted">…and ${transactions.length - 60} more</td></tr>` : '');
  $('importConfirm').disabled = !ok || !added.length;
  $('importConfirm').textContent = added.length
    ? `Import ${added.length} new${queue.length ? ' & next file' : ''}`
    : (transactions.length ? 'Nothing new to import' : 'Import');
  if (!added.length && transactions.length && queue.length) { $('importConfirm').disabled = false; $('importConfirm').textContent = 'Skip to next file'; }
}

['mDate', 'mDesc', 'mAmount', 'mDebit', 'mCredit', 'mStyle', 'mOrder', 'mInvert'].forEach(id => $(id).addEventListener('change', updatePreview));
// Enter in a text field would otherwise "submit" via the first button, which is the close button.
$('mAccount').addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });

$('importForm').addEventListener('submit', (e) => {
  if (e.submitter?.value !== 'default') return; // cancel / close
  e.preventDefault();
  if (current) {
    const { transactions, mapping } = parsedCurrent();
    const { added, duplicates } = mergeTransactions(state.transactions, transactions);
    const account = $('mAccount').value.trim();
    const now = new Date().toISOString();
    for (const t of added) state.transactions.push({ id: uid(), ...t, account, category: null, importedAt: now });
    state.mappings[current.sig] = { mapping, dateOrder: $('mOrder').value, invert: $('mInvert').checked, account };
    save();
    if (added.length) ui.month = monthKey(added.map(t => t.date).sort().pop());
    ui.catFilter = '';
    render();
    const months = new Set(added.map(t => monthKey(t.date))).size;
    toast(`Imported ${added.length} transaction${added.length === 1 ? '' : 's'} across ${months} month${months === 1 ? '' : 's'}` +
      (duplicates ? ` · ${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped` : '') +
      ` · <button class="link" id="toastBackup">back up now</button>`, {
      ms: 7000, onMount: el => el.querySelector('#toastBackup').onclick = () => { hideToast(); exportJson(); },
    });
  }
  current = null;
  if (queue.length) nextFile(); else $('importDialog').close();
});

$('importDialog').addEventListener('close', () => { queue = []; current = null; });

function openImport() {
  current = null; queue = [];
  $('importPick').hidden = false;
  $('importMap').hidden = true;
  $('importConfirm').disabled = true;
  $('importConfirm').textContent = 'Import';
  $('importMsg').textContent = '';
  $('importFile').value = '';
  $('importDialog').showModal();
}
$('importBtn').addEventListener('click', openImport);
$('importFile').addEventListener('change', e => startImport([...e.target.files]));
$('emptyFile').addEventListener('change', e => startImport([...e.target.files]));
$('loadSample').addEventListener('click', () => {
  startImport([new File([sampleCSV()], 'sample-cheque-account.csv', { type: 'text/csv' })]);
});

// Drag & drop anywhere on the page
let dragDepth = 0;
window.addEventListener('dragenter', e => { if (e.dataTransfer?.types?.includes('Files')) { dragDepth++; $('dropzone').classList.add('over'); } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('dropzone').classList.remove('over'); } });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
  e.preventDefault(); dragDepth = 0; $('dropzone').classList.remove('over');
  const files = [...(e.dataTransfer?.files || [])];
  if (files.length) startImport(files);
});

// ---------- Settings ----------
function renderSettings() {
  $('currency').value = state.currency;
  $('catList').innerHTML = state.categories.map((c, i) => {
    const used = state.transactions.filter(t => resolve(t).name === c.name).length;
    return `<li data-i="${i}">
      <input type="color" value="${c.color || '#999999'}" aria-label="Colour">
      <span class="grow">${esc(c.name)} ${used ? `<span class="pill">${used}</span>` : ''}</span>
      <select class="ctype"><option value="expense">Expense</option><option value="income">Income</option><option value="transfer">Transfer</option></select>
      <button type="button" class="icon-btn cdel" title="Delete category" aria-label="Delete">×</button>
    </li>`;
  }).join('');
  [...$('catList').querySelectorAll('li')].forEach((li, i) => li.querySelector('.ctype').value = state.categories[i].type);
  $('newRuleCat').innerHTML = categoryOptions(null, { includeUncat: false });
  renderRules();
}
function renderRules() {
  const q = $('ruleSearch').value.trim().toLowerCase();
  $('ruleList').innerHTML = state.rules.map((r, i) => ({ r, i }))
    .filter(({ r }) => !q || r.pattern.toLowerCase().includes(q) || r.category.toLowerCase().includes(q))
    .map(({ r, i }) => `<li data-i="${i}">
      <span class="grow"><code>${esc(r.pattern)}</code> → ${esc(r.category)}</span>
      <button type="button" class="icon-btn rup" title="Move up (higher priority)" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button type="button" class="icon-btn rdel" title="Delete rule" aria-label="Delete">×</button>
    </li>`).join('') || '<li class="muted">No rules match.</li>';
}

$('settingsBtn').addEventListener('click', () => { renderSettings(); $('settingsDialog').showModal(); });
$('settingsDialog').addEventListener('close', render);
$('currency').addEventListener('change', e => { state.currency = e.target.value; fmtCache = {}; save(); });
$('ruleSearch').addEventListener('input', renderRules);

$('catList').addEventListener('change', e => {
  const li = e.target.closest('li'); if (!li) return;
  const c = state.categories[+li.dataset.i];
  if (e.target.type === 'color') c.color = e.target.value;
  if (e.target.classList.contains('ctype')) c.type = e.target.value;
  save();
});
$('catList').addEventListener('click', e => {
  if (!e.target.classList.contains('cdel')) return;
  const c = state.categories[+e.target.closest('li').dataset.i];
  const rules = state.rules.filter(r => r.category === c.name).length;
  const manual = state.transactions.filter(t => t.category === c.name).length;
  if ((rules || manual) && !confirm(`Delete “${c.name}”? ${rules} rule(s) will be removed and ${manual} transaction(s) you set by hand become uncategorised.`)) return;
  state.categories = state.categories.filter(x => x !== c);
  state.rules = state.rules.filter(r => r.category !== c.name);
  state.transactions.forEach(t => { if (t.category === c.name) t.category = null; });
  save(); renderSettings();
});
$('addCat').addEventListener('click', () => {
  const name = $('newCatName').value.trim();
  if (!name || catByName(name)) return;
  const palette = ['#0b7285', '#a61e4d', '#5c940d', '#d9480f', '#364fc7', '#9c36b5', '#e67700'];
  state.categories.push({ name, type: $('newCatType').value, color: palette[state.categories.length % palette.length] });
  $('newCatName').value = '';
  save(); renderSettings();
});
$('addRule').addEventListener('click', () => {
  const pattern = $('newRulePattern').value.trim();
  const category = $('newRuleCat').value;
  if (!pattern || !category) return;
  state.rules.unshift({ pattern, category });
  $('newRulePattern').value = '';
  save(); renderSettings();
});
$('ruleList').addEventListener('click', e => {
  const li = e.target.closest('li[data-i]'); if (!li) return;
  const i = +li.dataset.i;
  if (e.target.classList.contains('rdel')) state.rules.splice(i, 1);
  else if (e.target.classList.contains('rup') && i > 0) [state.rules[i - 1], state.rules[i]] = [state.rules[i], state.rules[i - 1]];
  else return;
  save(); renderRules();
});

// ---------- Backup ----------
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const today = () => new Date().toISOString().slice(0, 10);
function exportJson() {
  download(`expenses-backup-${today()}.json`, JSON.stringify(state, null, 1), 'application/json');
}
$('dataBtn').addEventListener('click', () => {
  const n = state.transactions.length;
  const months = allMonths();
  $('dataStats').textContent = n ? `${n} transactions · ${months.length} months (${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])}) · ${state.rules.length} rules` : 'No transactions yet.';
  $('dataDialog').showModal();
});
$('exportJson').addEventListener('click', exportJson);
$('exportCsv').addEventListener('click', () => {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = ['Date,Description,Amount,Category,Account'];
  state.transactions.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(t => {
    lines.push([t.date, q(t.description), t.amount.toFixed(2), q(resolve(t).name || ''), q(t.account)].join(','));
  });
  download(`expenses-${today()}.csv`, lines.join('\n'), 'text/csv');
});
$('importJson').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const s = JSON.parse(await f.text());
    if (!Array.isArray(s.transactions) || !Array.isArray(s.categories) || !Array.isArray(s.rules)) throw new Error('not a backup');
    if (state.transactions.length && !confirm(`Replace your current ${state.transactions.length} transactions with the ${s.transactions.length} in this backup?`)) return;
    state = { ...freshState(), ...s };
    fmtCache = {}; ui.month = null; ui.catFilter = '';
    save(); render();
    $('dataDialog').close();
    toast(`Restored ${s.transactions.length} transactions.`);
  } catch {
    toast('That file isn’t a backup from this app.');
  } finally { e.target.value = ''; }
});
$('wipe').addEventListener('click', () => {
  if (!confirm('Delete all transactions, categories and rules from this browser? Export a backup first if you might want them.')) return;
  state = freshState(); ui = { month: null, search: '', catFilter: '' };
  save(); render();
  $('dataDialog').close();
});

// ---------- Go ----------
render();
if (!storageOk) $('storageWarning').hidden = false;
