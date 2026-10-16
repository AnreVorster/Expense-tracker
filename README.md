# Monthly Expenses

Track what you spend each month by importing the transaction CSV from your online banking.

It's a static web app: no server, no account, no sign-up. Your transactions are stored only in your browser's local storage and never sent anywhere.

## Using it

1. In your bank's internet banking, open the account's **transaction history**, pick a date range, and **download as CSV**.
2. Open the app and click **Import statement** (or drag the CSV onto the page).
3. Check the column mapping and preview, then import. Statements from the same bank are remembered, so next time it's one click.
4. Sort the leftovers in **Uncategorised**. When you pick a category, the app offers to create a rule so similar transactions are sorted automatically from then on.
5. **Back up** after importing (Backup → Export). Clearing browser data, private browsing, or switching device loses everything otherwise.

### What it handles

- Statement header lines above the transaction table, and comma / semicolon / tab delimited files
- Dates like `2026/10/16`, `16/10/2026`, `16 Oct 2026`, `20261016` (day/month vs month/day is auto-detected and can be changed)
- Amounts like `-1,234.56`, `1 234,56`, `(45.00)`, `45.00 Dr`, or separate debit and credit columns
- **Overlapping imports**: importing the same period twice doesn't double-count, but two identical coffees on the same day both stay
- Credit-card exports where purchases are positive (tick *Flip signs*)
- Opening/closing balance rows are skipped

### What it counts

- **Spent** = expense categories, net of refunds.
- **Transfers** (savings, paying off your credit card) count as neither spending nor income. If you import both your cheque account and your credit card, the card purchases are the spending and the card payment from your cheque account is a transfer — otherwise you'd count the same money twice.
- The current month is labelled "in progress" rather than compared against full months.

### Not supported

- PDF statements. Layouts differ per bank and change without notice; use the CSV export.
- Syncing between devices. Use Backup → Export and Restore to move your data.

## Run locally

Any static file server works:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` directly from disk won't work, because browsers block ES modules on `file://`.)

## Tests

```sh
node --test tests/*.test.mjs
```

## Hosting on GitHub Pages

Repository → **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → Save. The app appears at `https://<your-username>.github.io/<repo-name>/` after a minute.

Your data still never touches GitHub; the site only serves the app's code.
