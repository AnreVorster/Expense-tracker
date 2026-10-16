// Starting categories and rules. Rules are checked top to bottom and the first match wins,
// so specific patterns ("uber eats") must come before broad ones ("uber").
// type: 'expense' counts toward spending, 'income' toward income, 'transfer' is ignored in both
// (moving money between your own accounts, paying off your credit card).

export const DEFAULT_CATEGORIES = [
  { name: 'Groceries', type: 'expense', color: '#2f9e44' },
  { name: 'Eating out', type: 'expense', color: '#e8590c' },
  { name: 'Transport', type: 'expense', color: '#1971c2' },
  { name: 'Fuel', type: 'expense', color: '#5f3dc4' },
  { name: 'Housing', type: 'expense', color: '#862e9c' },
  { name: 'Utilities', type: 'expense', color: '#0c8599' },
  { name: 'Phone & internet', type: 'expense', color: '#3b5bdb' },
  { name: 'Subscriptions', type: 'expense', color: '#c2255c' },
  { name: 'Health', type: 'expense', color: '#e03131' },
  { name: 'Insurance', type: 'expense', color: '#495057' },
  { name: 'Shopping', type: 'expense', color: '#f08c00' },
  { name: 'Bank fees', type: 'expense', color: '#868e96' },
  { name: 'Cash', type: 'expense', color: '#74b816' },
  { name: 'Other', type: 'expense', color: '#adb5bd' },
  { name: 'Income', type: 'income', color: '#2b8a3e' },
  { name: 'Transfers', type: 'transfer', color: '#ced4da' },
];

const r = (category, ...patterns) => patterns.map(pattern => ({ pattern, category }));

export const DEFAULT_RULES = [
  ...r('Income', 'salary', 'sal ', 'payroll'),
  ...r('Transfers', 'credit card payment', 'internal transfer', 'transfer to', 'transfer from', 'own account', 'savings'),
  ...r('Eating out', 'uber eats', 'mr d', 'mrd food', 'nandos', 'kfc', 'mcdonalds', 'spur', 'steers', 'wimpy', 'debonairs', 'romans pizza', 'ocean basket', 'vida e', 'seattle coffee', 'starbucks', 'bootlegger', 'mugg bean', 'restaurant', 'cafe', 'coffee'),
  ...r('Groceries', 'woolworths', 'checkers', 'pick n pay', 'pnp', 'spar', 'shoprite', 'food lover', 'usave', 'makro', 'boxer'),
  ...r('Fuel', 'engen', 'shell', 'sasol', 'caltex', 'astron', 'totalenergies', 'bp ', 'fuel', 'garage'),
  ...r('Transport', 'uber', 'bolt', 'gautrain', 'myciti', 'toll', 'parking', 'flysafair', 'lift airline', 'airlink'),
  ...r('Utilities', 'municipality', 'munic', 'city of cape town', 'eskom', 'prepaid elec', 'electricity', 'water'),
  ...r('Phone & internet', 'vodacom', 'mtn', 'telkom', 'cell c', 'rain ', 'afrihost', 'webafrica', 'vumatel', 'openserve', 'airtime', 'data bundle'),
  ...r('Subscriptions', 'netflix', 'spotify', 'showmax', 'dstv', 'multichoice', 'disney', 'youtube', 'apple com', 'google', 'microsoft', 'adobe', 'chatgpt', 'openai', 'claude ai', 'anthropic', 'gym', 'virgin active', 'planet fitness'),
  ...r('Health', 'dis chem', 'dischem', 'clicks', 'pharmacy', 'medirite', 'doctor', 'dental', 'pathcare', 'lancet', 'mediclinic', 'netcare', 'medical aid', 'discovery health'),
  ...r('Insurance', 'outsurance', 'santam', 'discovery insure', 'king price', 'miway', 'old mutual', 'sanlam', 'momentum', 'liberty', 'hollard', 'insurance'),
  ...r('Housing', 'rent', 'bond', 'levy', 'levies', 'home loan'),
  ...r('Shopping', 'takealot', 'amazon', 'mr price', 'pep ', 'ackermans', 'edgars', 'superbalist', 'woolies fashion', 'h m', 'zara', 'cotton on', 'game ', 'incredible', 'builders', 'leroy merlin', 'shein', 'temu'),
  ...r('Bank fees', 'service fee', 'monthly fee', 'account fee', 'admin fee', 'bank charge', 'transaction fee', 'interest debit', 'sms notification'),
  ...r('Cash', 'atm', 'cash withdrawal'),
];
