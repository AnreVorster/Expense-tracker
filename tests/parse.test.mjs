// Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCSV, parseDate, parseAmount, findHeaderRow, guessMapping, guessDateOrder,
  rowsToTransactions, mergeTransactions, categorize, suggestPattern, detectDelimiter,
} from '../js/parse.js';
import { DEFAULT_RULES } from '../js/defaults.js';
import { sampleCSV } from '../js/sample.js';

test('parseCSV handles quotes, embedded commas, CRLF, BOM', () => {
  const rows = parseCSV('﻿a,b,c\r\n1,"x, y",3\r\n2,"he said ""hi""",4\r\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['1', 'x, y', '3'], ['2', 'he said "hi"', '4']]);
});

test('detects semicolon delimiter', () => {
  assert.equal(detectDelimiter('Date;Amount;Desc\n01/02/2026;-12,50;Shop\n02/02/2026;-3,00;Cafe'), ';');
});

test('parseDate formats', () => {
  assert.equal(parseDate('2026/10/16'), '2026-10-16');
  assert.equal(parseDate('2026-10-16 14:22'), '2026-10-16');
  assert.equal(parseDate('20261016'), '2026-10-16');
  assert.equal(parseDate('16/10/2026'), '2026-10-16');
  assert.equal(parseDate('10/16/2026', 'MDY'), '2026-10-16');
  assert.equal(parseDate('16 Oct 2026'), '2026-10-16');
  assert.equal(parseDate('16-Oct-26'), '2026-10-16');
  assert.equal(parseDate('16 September 2026'), '2026-09-16');
  assert.equal(parseDate('Oct 16, 2026'), '2026-10-16');
  assert.equal(parseDate('31/02/2026'), null);
  assert.equal(parseDate('Opening balance'), null);
});

test('guessDateOrder', () => {
  assert.equal(guessDateOrder(['01/02/2026', '25/02/2026']), 'DMY');
  assert.equal(guessDateOrder(['02/01/2026', '02/25/2026']), 'MDY');
});

test('parseAmount variants', () => {
  assert.equal(parseAmount('-1,234.56'), -1234.56);
  assert.equal(parseAmount('R 1 234.56'), 1234.56);
  assert.equal(parseAmount('1.234,56'), 1234.56);
  assert.equal(parseAmount('-12,50'), -12.5);
  assert.equal(parseAmount('(45.00)'), -45);
  assert.equal(parseAmount('45.00-'), -45);
  assert.equal(parseAmount('45.00 Dr'), -45);
  assert.equal(parseAmount('45.00 Cr'), 45);
  assert.equal(parseAmount('1,234'), 1234);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('0,99'), 0.99);
});

test('finds header after bank preamble and maps columns', () => {
  const rows = parseCSV(sampleCSV(new Date(2026, 9, 16)));
  const h = findHeaderRow(rows);
  assert.deepEqual(rows[h], ['Date', 'Amount', 'Balance', 'Description']);
  const map = guessMapping(rows[h], rows.slice(h + 1));
  assert.equal(map.date, 0);
  assert.equal(map.amount, 1);
  assert.equal(map.description, 3);
});

test('split debit/credit columns', () => {
  const rows = parseCSV('Transaction Date,Details,Debit,Credit,Balance\n16/10/2026,WOOLWORTHS,250.00,,1000\n17/10/2026,SALARY,,5000.00,6000');
  const map = guessMapping(rows[0], rows.slice(1));
  assert.equal(map.amount, -1);
  assert.equal(map.debit, 2);
  assert.equal(map.credit, 3);
  const { transactions } = rowsToTransactions(rows.slice(1), { mapping: map });
  assert.deepEqual(transactions.map(t => t.amount), [-250, 5000]);
});

test('headerless file falls back to content detection', () => {
  const rows = parseCSV('16/10/2026,-250.00,POS WOOLWORTHS STELLENBOSCH,1000.00\n17/10/2026,-80.00,UBER TRIP,920.00');
  assert.equal(findHeaderRow(rows), -1);
  const map = guessMapping(rows[0].map((_, i) => `Column ${i + 1}`), rows);
  assert.equal(map.date, 0);
  assert.equal(map.amount, 1);
  assert.equal(map.description, 2);
});

test('merge: overlapping statements do not double count, genuine repeats survive', () => {
  const coffee = { date: '2026-10-01', amount: -35, description: 'VIDA E CAFFE' };
  const groceries = { date: '2026-10-02', amount: -500, description: 'WOOLWORTHS' };
  const existing = [coffee, { ...coffee }, groceries];                  // two coffees that day, already imported
  const incoming = [{ ...coffee }, { ...coffee }, { ...coffee }, { ...groceries }, { date: '2026-10-03', amount: -10, description: 'X' }];
  const { added, duplicates } = mergeTransactions(existing, incoming);
  assert.equal(duplicates, 3);
  assert.equal(added.length, 2); // the third coffee + X
});

test('merge ignores description formatting differences', () => {
  const a = [{ date: '2026-10-01', amount: -35, description: 'Vida e Caffe  ' }];
  const { added } = mergeTransactions(a, [{ date: '2026-10-01', amount: -35, description: 'VIDA-E CAFFE' }]);
  assert.equal(added.length, 0);
});

test('categorize uses whole words and rule order', () => {
  assert.equal(categorize('POS PURCHASE UBER EATS', DEFAULT_RULES), 'Eating out');
  assert.equal(categorize('POS PURCHASE UBER TRIP', DEFAULT_RULES), 'Transport');
  assert.equal(categorize('DEBIT ORDER RENT OAK ST', DEFAULT_RULES), 'Housing');
  assert.equal(categorize('INTEREST ON CURRENT ACCOUNT', DEFAULT_RULES), null); // "rent" must not match "current"
  assert.equal(categorize('SPARKLING WATERS SPA', [{ pattern: 'spar', category: 'Groceries' }]), null);
  assert.equal(categorize('CREDIT CARD PAYMENT 4512', DEFAULT_RULES), 'Transfers');
  assert.equal(categorize('SALARY ACME', DEFAULT_RULES), 'Income');
});

test('suggestPattern drops noise', () => {
  assert.equal(suggestPattern('POS PURCHASE MOOIBERGE FARM STALL 4512*1234 16 OCT'), 'mooiberge farm stall');
});

test('sample statement parses fully', () => {
  const rows = parseCSV(sampleCSV(new Date(2026, 9, 16)));
  const h = findHeaderRow(rows);
  const data = rows.slice(h + 1);
  const map = guessMapping(rows[h], data);
  const { transactions, skipped } = rowsToTransactions(data, { mapping: map, dateOrder: guessDateOrder(data.map(r => r[0])) });
  assert.equal(skipped.length, 0);
  assert.ok(transactions.length > 150);
  const uncategorised = transactions.filter(t => !/OPENING/.test(t.description) && !categorize(t.description, DEFAULT_RULES));
  // Sample deliberately leaves a few merchants uncategorised; everything else should be caught by default rules.
  assert.ok(uncategorised.every(t => /BOOK EXCHANGE|FARM STALL|PLUMBING/.test(t.description)), uncategorised.map(t => t.description).join('\n'));
});
