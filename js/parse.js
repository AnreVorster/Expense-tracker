// Pure parsing / data helpers. No DOM access, so they can be unit-tested in Node.

/** Split CSV text into rows. Handles quoted fields, escaped quotes, CRLF, and auto-detects the delimiter. */
export function parseCSV(text, delimiter) {
  text = text.replace(/^﻿/, '');
  const delim = delimiter || detectDelimiter(text);
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows
    .map(r => r.map(f => f.trim()))
    .filter(r => r.some(f => f !== ''));
}

export function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 30);
  let best = ',', bestScore = -1;
  for (const d of [',', ';', '\t', '|']) {
    const counts = sample.map(l => l.split(d).length - 1).filter(n => n > 0);
    if (!counts.length) continue;
    // Most common count × how many lines have it: favours the delimiter of the transaction table.
    const freq = {};
    counts.forEach(n => (freq[n] = (freq[n] || 0) + 1));
    const [n, f] = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    const score = f * Math.min(+n, 6);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12 };

/**
 * Parse a date string into ISO yyyy-mm-dd.
 * order: 'DMY' | 'MDY' | 'YMD' — used only for ambiguous all-numeric dates.
 */
export function parseDate(s, order = 'DMY') {
  if (!s) return null;
  s = String(s).trim();
  let m;
  // 20261016
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return iso(+m[1], +m[2], +m[3]);
  // 2026-10-16, 2026/10/16 (optionally with time)
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return iso(+m[1], +m[2], +m[3]);
  // 16 Oct 2026, 16-Oct-26, 16 October 2026
  if ((m = s.match(/^(\d{1,2})[\s\-/.]+([A-Za-z]{3,9})[\s\-/.,]+(\d{2,4})/))) {
    const mo = MONTHS[m[2].toLowerCase().slice(0, 4)] || MONTHS[m[2].toLowerCase().slice(0, 3)];
    if (mo) return iso(year(+m[3]), mo, +m[1]);
  }
  // Oct 16, 2026
  if ((m = s.match(/^([A-Za-z]{3,9})[\s.]+(\d{1,2}),?\s+(\d{2,4})/))) {
    const mo = MONTHS[m[1].toLowerCase().slice(0, 3)];
    if (mo) return iso(year(+m[3]), mo, +m[2]);
  }
  // 16/10/2026 or 10/16/2026 or 16/10/26
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
    let a = +m[1], b = +m[2];
    const y = year(+m[3]);
    if (order === 'MDY') [a, b] = [b, a];
    return iso(y, b, a);
  }
  return null;
}

function year(y) { return y < 100 ? 2000 + y : y; }
function iso(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null; // e.g. 31 Feb
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Guess whether numeric dates are DMY or MDY by looking for a field > 12. */
export function guessDateOrder(values) {
  let dmy = 0, mdy = 0;
  for (const v of values) {
    const m = String(v || '').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
    if (!m) continue;
    if (+m[1] > 12) dmy++;
    if (+m[2] > 12) mdy++;
  }
  return mdy > dmy ? 'MDY' : 'DMY';
}

/**
 * Parse an amount. Handles: "R 1 234.56", "-1,234.56", "1.234,56", "(45.00)", "45.00-", "45.00 Dr", "45.00 Cr".
 * Returns a number (negative = money out) or null.
 */
export function parseAmount(s) {
  if (s === null || s === undefined) return null;
  let str = String(s).trim();
  if (!str) return null;
  let sign = 1;
  if (/\bdr\b/i.test(str)) sign = -1;
  str = str.replace(/\b(cr|dr)\b/gi, '');
  if (/^\(.*\)$/.test(str)) { sign = -sign; str = str.slice(1, -1); }
  str = str.trim();
  if (str.endsWith('-')) { sign = -sign; str = str.slice(0, -1); }
  if (str.startsWith('-')) { sign = -sign; str = str.slice(1); }
  else if (str.startsWith('+')) str = str.slice(1);
  str = str.replace(/[^\d.,\s']/g, '').replace(/[\s']/g, '');
  if (!str || !/\d/.test(str)) return null;
  const lastDot = str.lastIndexOf('.'), lastComma = str.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // Whichever comes last is the decimal separator.
    if (lastComma > lastDot) str = str.replace(/\./g, '').replace(',', '.');
    else str = str.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // "1,234" (thousands) vs "12,50" (decimal)
    const after = str.length - lastComma - 1;
    const commas = (str.match(/,/g) || []).length;
    str = (after === 3 && commas >= 1 && !/^0,/.test(str)) ? str.replace(/,/g, '') : str.replace(/,/g, '.');
    if ((str.match(/\./g) || []).length > 1) return null;
  } else if ((str.match(/\./g) || []).length > 1) {
    str = str.replace(/\./g, ''); // 1.234.567
  }
  const n = parseFloat(str);
  return Number.isFinite(n) ? Math.round(sign * n * 100) / 100 : null;
}

/** Find the header row: the first row (in the first 40) that looks like column names for a transaction table. */
export function findHeaderRow(rows) {
  const keywords = /date|description|details|narrative|amount|debit|credit|balance|reference|transaction|payee|memo/i;
  let best = -1, bestScore = 0;
  const limit = Math.min(rows.length, 40);
  for (let i = 0; i < limit; i++) {
    const hits = rows[i].filter(c => keywords.test(c) && c.length < 40).length;
    const nextIsData = rows[i + 1] && rows[i + 1].some(c => parseDate(c));
    const score = hits * 2 + (nextIsData ? 1 : 0);
    if (hits >= 2 && score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

/** Guess which columns hold date, description, amount / debit / credit. */
export function guessMapping(header, dataRows) {
  const h = header.map(x => x.toLowerCase());
  const find = (re, exclude) => h.findIndex((x, i) => re.test(x) && !(exclude || []).includes(i));
  const map = { date: -1, description: -1, amount: -1, debit: -1, credit: -1 };
  map.date = find(/^(transaction |posting |value |trans\.? )?date|^date/);
  if (map.date < 0) map.date = find(/date/);
  map.description = find(/description|details|narrative|payee|merchant|particulars|memo|reference/);
  map.amount = find(/^amount|amount$|^value$|transaction amount|amount \(/);
  map.debit = find(/debit|withdrawal|money out|paid out/);
  map.credit = find(/credit|deposit|money in|paid in/);
  if (map.amount >= 0) { map.debit = -1; map.credit = -1; }

  // Fall back on content when headers didn't help.
  const cols = header.length;
  const colScore = (test) => {
    const scores = [];
    for (let c = 0; c < cols; c++) {
      const vals = dataRows.slice(0, 20).map(r => r[c]).filter(v => v);
      scores.push(vals.length ? vals.filter(test).length / vals.length : 0);
    }
    return scores;
  };
  if (map.date < 0) {
    const s = colScore(v => parseDate(v));
    const i = s.indexOf(Math.max(...s));
    if (s[i] > 0.6) map.date = i;
  }
  if (map.amount < 0 && map.debit < 0 && map.credit < 0) {
    const s = colScore(v => parseAmount(v) !== null && !parseDate(v));
    const i = s.findIndex((x, idx) => x > 0.8 && idx !== map.date);
    if (i >= 0) map.amount = i;
  }
  if (map.description < 0) {
    const s = colScore(v => /[a-z]{3}/i.test(v) && parseAmount(v) === null);
    let bestI = -1, bestLen = 0;
    s.forEach((x, i) => {
      if (x > 0.6 && i !== map.date) {
        const len = dataRows.slice(0, 20).reduce((a, r) => a + (r[i] || '').length, 0);
        if (len > bestLen) { bestLen = len; bestI = i; }
      }
    });
    map.description = bestI;
  }
  return map;
}

/**
 * Turn mapped rows into transactions.
 * opts: { mapping, dateOrder, invert } — invert flips signs (e.g. credit-card statements where purchases are positive).
 */
export function rowsToTransactions(rows, { mapping, dateOrder = 'DMY', invert = false }) {
  const out = [], skipped = [];
  rows.forEach((r, idx) => {
    const date = parseDate(r[mapping.date], dateOrder);
    let amount = null;
    if (mapping.amount >= 0) amount = parseAmount(r[mapping.amount]);
    else {
      const d = mapping.debit >= 0 ? parseAmount(r[mapping.debit]) : null;
      const c = mapping.credit >= 0 ? parseAmount(r[mapping.credit]) : null;
      if (d !== null || c !== null) amount = (c ? Math.abs(c) : 0) - (d ? Math.abs(d) : 0);
    }
    const description = (mapping.description >= 0 ? r[mapping.description] : '') || '';
    if (!date || amount === null || (amount === 0 && !description)) { skipped.push({ idx, row: r }); return; }
    out.push({ date, description: description.replace(/\s+/g, ' ').trim(), amount: invert ? -amount : amount });
  });
  return { transactions: out, skipped };
}

export function normDesc(d) {
  return String(d || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Merge incoming transactions into existing ones without double-counting overlapping statements.
 * Identical (date, amount, description) transactions are matched by occurrence: if the new file contains
 * a transaction twice and the store already has it once, one is added. Genuine repeats survive.
 */
export function mergeTransactions(existing, incoming) {
  const key = t => `${t.date}|${t.amount.toFixed(2)}|${normDesc(t.description)}`;
  const have = {};
  existing.forEach(t => { const k = key(t); have[k] = (have[k] || 0) + 1; });
  const seen = {};
  const added = [];
  let duplicates = 0;
  for (const t of incoming) {
    const k = key(t);
    seen[k] = (seen[k] || 0) + 1;
    if (seen[k] <= (have[k] || 0)) duplicates++;
    else added.push(t);
  }
  return { added, duplicates };
}

/**
 * First matching rule wins. Rules: [{ pattern, category }].
 * Patterns match whole words, case-insensitively: "rent" matches "RENT OCT" but not "CURRENT ACC".
 */
export function categorize(description, rules) {
  const d = ` ${normDesc(description)} `;
  for (const r of rules) {
    const p = normDesc(r.pattern);
    if (p && d.includes(` ${p} `)) return r.category;
  }
  return null;
}

/** Suggest a reusable rule pattern from a description: drop card numbers, dates, and reference noise. */
export function suggestPattern(description) {
  const words = normDesc(description)
    .split(' ')
    .filter(w => w && !/\d/.test(w) && w.length > 1 && !STOP.has(w));
  return words.slice(0, 3).join(' ');
}
const STOP = new Set(['pos', 'purchase', 'card', 'debit', 'order', 'payment', 'the', 'pty', 'ltd', 'za', 'zaf', 'rsa', 'za', 'int', 'intl', 'eft', 'from', 'to', 'cr', 'dr', 'ref', 'trf', 'transfer', 'online', 'cheque', 'chq', 'acc', 'fnb', 'app', 'sms', 'magtape', 'dda', 'ib', 'sett']);

export function monthKey(isoDate) { return isoDate.slice(0, 7); }
