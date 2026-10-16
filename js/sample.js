// Generates a realistic-looking sample bank export (made-up merchants and amounts) so people can try the app.
// Format mimics a typical South African bank CSV: a few lines of statement header, then the transaction table.

export function sampleCSV(now = new Date()) {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const amt = (lo, hi) => -Math.round((lo + rand() * (hi - lo)) * 100) / 100;

  const tx = [];
  const add = (d, desc, a) => tx.push({ d, desc, a });
  const startMonth = new Date(now.getFullYear(), now.getMonth() - 4, 1);

  for (let m = 0; m < 5; m++) {
    const y = startMonth.getFullYear() + Math.floor((startMonth.getMonth() + m) / 12);
    const mo = (startMonth.getMonth() + m) % 12;
    const days = new Date(y, mo + 1, 0).getDate();
    const lastDay = m === 4 ? Math.min(days, now.getDate()) : days;
    const D = (day) => new Date(y, mo, Math.min(day, lastDay));

    if (25 <= lastDay) add(D(25), 'SALARY ACME TECH PTY LTD', 38500);
    add(D(1), 'DEBIT ORDER RENT OAK STREET PROPERTIES', -9800);
    add(D(1), 'DEBIT ORDER DISCOVERY HEALTH MEDICAL AID', -2410.5);
    add(D(2), 'DEBIT ORDER OUTSURANCE 0041122', -985);
    add(D(3), 'DEBIT ORDER VODACOM 0821234567', -599);
    add(D(5), 'POS PURCHASE NETFLIX.COM', -199);
    add(D(5), 'POS PURCHASE SPOTIFY P1A2B3', -69.99);
    add(D(6), 'DEBIT ORDER VIRGIN ACTIVE 99881', -695);
    add(D(7), 'PREPAID ELECTRICITY STELLENBOSCH MUNIC', amt(450, 750));
    add(D(lastDay), 'MONTHLY ACCOUNT FEE', -199);
    if (26 <= lastDay) add(D(26), 'TRANSFER TO SAVINGS ACC 62000000', -5000);
    if (27 <= lastDay) add(D(27), 'CREDIT CARD PAYMENT 4512XXXX', -3200);

    const shops = [
      ['POS PURCHASE WOOLWORTHS STELLENBOSCH', 180, 900],
      ['POS PURCHASE CHECKERS EIKESTAD', 120, 1200],
      ['POS PURCHASE PICK N PAY DIE BOORD', 90, 700],
      ['POS PURCHASE SPAR ANDRINGA', 40, 260],
    ];
    const eats = [
      ['POS PURCHASE VIDA E CAFFE STB', 35, 85],
      ['POS PURCHASE UBER EATS', 120, 340],
      ['POS PURCHASE NANDOS PLEIN STREET', 140, 320],
      ['POS PURCHASE MR D FOOD', 150, 380],
      ['POS PURCHASE BOOTLEGGER COFFEE', 40, 95],
    ];
    for (let day = 1; day <= lastDay; day++) {
      if (rand() < 0.28) { const [n, lo, hi] = pick(shops); add(D(day), n, amt(lo, hi)); }
      if (rand() < 0.22 + m * 0.03) { const [n, lo, hi] = pick(eats); add(D(day), n, amt(lo, hi)); }
      if (rand() < 0.12) add(D(day), pick(['POS PURCHASE UBER TRIP', 'POS PURCHASE BOLT.EU RIDE']), amt(45, 160));
      if (rand() < 0.07) add(D(day), pick(['POS PURCHASE ENGEN MERRIMAN', 'POS PURCHASE SHELL R44']), amt(500, 950));
      if (rand() < 0.05) add(D(day), pick(['POS PURCHASE TAKEALOT.COM', 'POS PURCHASE MR PRICE HOME', 'POS PURCHASE CLICKS STELLENBOSCH']), amt(90, 1400));
      if (rand() < 0.03) add(D(day), 'CASH WITHDRAWAL ATM STELLENBOSCH', -Math.round(1 + rand() * 4) * 100);
      if (rand() < 0.04) add(D(day), pick(['POS PURCHASE STELLENBOSCH BOOK EXCHANGE', 'POS PURCHASE MOOIBERGE FARM STALL', 'EFT PAYMENT J SMITH PLUMBING']), amt(80, 650));
    }
    if (m === 2) add(D(14), 'REFUND TAKEALOT.COM', 459);
  }

  tx.sort((a, b) => a.d - b.d);
  let bal = 18250.4;
  const pad = (n) => String(n).padStart(2, '0');
  const lines = [
    'ACCOUNT TRANSACTION HISTORY',
    'Account Name,Example Cheque Account',
    'Account Number,62XXXXXX1234',
    `Statement Period,${startMonth.getFullYear()}/${pad(startMonth.getMonth() + 1)}/01 to ${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())}`,
    '',
    'Date,Amount,Balance,Description',
    `${startMonth.getFullYear()}/${pad(startMonth.getMonth() + 1)}/01,0.00,${bal.toFixed(2)},OPENING BALANCE`,
  ];
  for (const t of tx) {
    bal += t.a;
    const ds = `${t.d.getFullYear()}/${pad(t.d.getMonth() + 1)}/${pad(t.d.getDate())}`;
    lines.push(`${ds},${t.a.toFixed(2)},${bal.toFixed(2)},"${t.desc}"`);
  }
  return lines.join('\r\n');
}
