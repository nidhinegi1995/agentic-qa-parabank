# Bill Pay – Playwright Test Plan

**Application:** http://localhost:8080/parabank (feature page `billpay.htm`)
**Explored:** 2026-11-08 with the Playwright MCP browser, logged in as `ficusroot2` (customer 12434)
**Manual design source:** [test-cases/bill-pay-cases.json](../test-cases/bill-pay-cases.json) / `test-cases/BillPay_TestCases.xlsx` (TC-BILLPAY-001..049)
**Story:** [user-stories/bill-pay-clarified.md](../user-stories/bill-pay-clarified.md)
**Automation:** [tests/bill-pay.spec.ts](../tests/bill-pay.spec.ts) · POM [pages/bill-pay.page.ts](../pages/bill-pay.page.ts) · data [test-data/bill-pay.json](../test-data/bill-pay.json)

## Exploration log (what was actually observed)

| # | Probe | Result |
|---|---|---|
| E1 | `billpay.htm` while logged out | HTTP 500, title `ParaBank | Error`, right panel `Error!` / `An internal error has occurred and has been logged.`; the left-panel login form is shown; no `#billpayForm` in the DOM. |
| E2 | `billpay.htm` logged in | Title `ParaBank | Bill Pay`; heading `Bill Payment Service`; sub-text `Enter payee information`. From dropdown is **server-rendered** (no AJAX) with 612 options; first option (`13677`) preselected. Both `18561` and `85161` listed. |
| E3 | Empty form → Send Payment | 9 inline messages visible at once (exact texts in table below); no request. |
| E4 | One valid payment of `1.00` from **expendable 85161** (live balance read via `GET services/bank/accounts/85161` immediately before: `100.00`) | Title `ParaBank | Bill Payment Complete`; `#billpayForm` hidden; result `Bill Payment to Acme Utilities in the amount of $1.00 from account 85161 was successful.` + `See Account Activity for more details.`; balance `99.00`; Activity rows: `Funds Transfer Received $100.00` (credit) + `Bill Payment to Acme Utilities $1.00` (debit), date `11-08-2026`. |
| E5 | Read-only `GET services_proxy/bank/customers/12434/accounts` | 200, 612 accounts (array of `{id, customerId, type, balance}`); order differs from the dropdown, so compare as sets. Funding account 18561 = `1000000099.00`. |

No boundary/negative/sub-cent probes were run manually: their behaviour is fully derivable from the source (`billpay.jsp`, `RestServiceProxyController`) documented in the clarified story (O5, O8, O9, O14), and the suite runs them only on throwaway accounts.

## Live DOM selectors

No `data-testid`s and no accessible names on inputs; `name=` attributes are the stable hooks.

| Element | Selector | Notes |
|---|---|---|
| Heading | `getByRole('heading', { name: 'Bill Payment Service' })` | |
| Form container | `#billpayForm` | hidden on success/error |
| Payee Name | `input[name="payee.name"]` | |
| Address | `input[name="payee.address.street"]` | |
| City | `input[name="payee.address.city"]` | |
| State | `input[name="payee.address.state"]` | |
| Zip Code | `input[name="payee.address.zipCode"]` | |
| Phone # | `input[name="payee.phoneNumber"]` | **id/class are random UUIDs per load – never use them** |
| Account # | `input[name="payee.accountNumber"]` | |
| Verify Account # | `input[name="verifyAccount"]` | |
| Amount | `input[name="amount"]` | (no id; `#amount` is the result span) |
| From account # | `select[name="fromAccountId"]` | (no id; `#fromAccountId` is the result span) |
| Send Payment | `getByRole('button', { name: 'Send Payment' })` | `<input type="button">` |
| Inline errors | `#validationModel-{name,address,city,state,zipCode,phoneNumber,account-empty,account-invalid,verifyAccount-empty,verifyAccount-invalid,verifyAccount-mismatch,amount-empty,amount-invalid}` | always in DOM, toggled by `display` |
| Result panel | `#billpayResult` → `h1`, first `p`, `#payeeName`, `#amount`, `#fromAccountId` | |
| Error panel | `#billpayError` → `h1` `Error!`, `p.error` `An internal error has occurred and has been logged.` | |
| Left menu Bill Pay | `#leftPanel getByRole('link', { name: 'Bill Pay' })` | |
| Payment request | `POST services_proxy/bank/billpay?accountId=…&amount=…` (JSON Payee body) | |

Exact inline texts: `Payee name is required.` · `Address is required.` · `City is required.` · `State is required.` · `Zip Code is required.` · `Phone number is required.` · `Account number is required.` · `Please enter a valid number.` · `The account numbers do not match.` · `The amount cannot be empty.` · `Please enter a valid amount.`

## Starting state / guardrails

1. Fresh browser context per test; log in as `PARABANK_USER ?? ficusroot2` (reusable `LoginPage.ensureLoggedIn`).
2. Every test that needs a From account opens a **fresh CHECKING account funded from 18561** (`AccountsPage.openNewAccount('CHECKING', '18561')`). ParaBank seeds it with exactly **$100.00** and one `Funds Transfer Received` row, so all balances are exact known values. Default account 13566 is never used; 18561 is never paid from.
3. Boundary / negative / over-balance cases use their own fresh throwaway account, never shared.
4. Sub-cent cases (030, 031) can make every account read of the owning customer return HTTP 500 (Transfer R1), so they run under a **throwaway user** registered inside the test.
5. Cross-customer case (039) registers one dedicated throwaway customer inside the test.
6. Cases flagged *Expect defect* (027, 028, 033, 034, 039, 040, 044) assert the **required** behaviour and are expected to fail; no `test.fail()` / `test.skip()`.

## Scenarios (one Playwright test per TC row; title prefix = TC ID)

### 1. Successful payments (fresh funded account)
- **TC-BILLPAY-001** Pay 25.00 → form hidden; heading `Bill Payment Complete`; exact sentence; `See Account Activity…`; `#fromAccountId` = account; title `ParaBank | Bill Payment Complete`; no inline errors.
- **TC-BILLPAY-002** Pay 25.00 → balance `$75.00`; Activity = opening row + `{today, Bill Payment to Acme Utilities, $25.00, ''}`.
- **TC-BILLPAY-003** Amount `25` → `#amount` `$25.00`; balance `$75.00`.
- **TC-BILLPAY-004** Payee Account # = second own fresh account B, 10.00 → From `$90.00`; B `$100.00` with 1 row.
- **TC-BILLPAY-005** Payee Account # = From account, 5.00 → `$95.00`; exactly one debit, no extra credit.
- **TC-BILLPAY-006** Dropdown option set == customer accounts API set; first option selected on load; pay 1.00 from fresh (non-first) account → confirmation From = fresh; fresh `$99.00`; first-option account balance unchanged.
- **TC-BILLPAY-007** State `California`, Zip `ABC`, Phone `(555) 123-4567`, 2.00 → success, no inline errors.
- **TC-BILLPAY-014** Account # `2147483647`, 1.00 → success, `$99.00`.
- **TC-BILLPAY-029** 0.01 → success `$0.01`, balance `$99.99`, one `$0.01` debit.
- **TC-BILLPAY-032** 100.00 (exact balance) → success, balance `$0.00`.
- **TC-BILLPAY-036** 239-char Payee Name → `#payeeName` full name; Activity description `Bill Payment to ` + name; `$99.00`.
- **TC-BILLPAY-046** After a 1.00 payment click left-menu Bill Pay → empty form, first option selected, result/error panels hidden.
- **TC-BILLPAY-047** After a 3.00 payment `page.reload()` → empty form; balance `$97.00`; exactly one Bill Payment row.

### 2. Client-side validation (no request must be sent; payment-request listener)
- **TC-BILLPAY-008** Empty form → all 9 messages; 0 requests; form visible.
- **TC-BILLPAY-009** Whitespace in 6 text fields → 6 required messages; 0 requests; balance `$100.00`.
- **TC-BILLPAY-010** Data-driven over 9 fields (one test, a step per field) → exactly that field's message is the only visible error; 0 requests; balance unchanged.
- **TC-BILLPAY-011** Empty name + mismatch + `abc` amount → 3 messages together; values retained.
- **TC-BILLPAY-012** Account `abc`/`abc` → `account-invalid` + `verifyAccount-invalid` `Please enter a valid number.`
- **TC-BILLPAY-016** `12345`/`12346` → mismatch message.
- **TC-BILLPAY-017** Verify empty → `verifyAccount-empty`; mismatch hidden.
- **TC-BILLPAY-018** `012345` vs `12345` → mismatch.
- **TC-BILLPAY-019** `12345 ` vs `12345` → mismatch.
- **TC-BILLPAY-020** Verify `abc` → `verifyAccount-invalid`.
- **TC-BILLPAY-021** Amount empty → `amount-empty`.
- **TC-BILLPAY-022** Amount `abc` → `amount-invalid`.
- **TC-BILLPAY-023** Amount `$10` → `amount-invalid`; balance unchanged.

### 3. Rejected input reaching the server (no money may move)
- **TC-BILLPAY-013** Account `12abc` → no confirmation; inline error or error panel; balance `$100.00`, 1 row.
- **TC-BILLPAY-015** Account `2147483648` → same.
- **TC-BILLPAY-024** Amount `1,000` → same.
- **TC-BILLPAY-025** Amount `10abc` → same.
- **TC-BILLPAY-026** Amount `1e3` → `Please enter a valid amount.`; no confirmation; balance unchanged.
- **TC-BILLPAY-037** 240-char Payee Name → form still shown (validation), no confirmation; balance unchanged.
- **TC-BILLPAY-038** Route `services_proxy/bank/billpay` → HTTP 500 → error panel exact texts; after unroute balance unchanged.

### 4. Financial boundaries (fresh throwaway account each)
- **TC-BILLPAY-027** `0` → inline amount error; no confirmation; unchanged. *Expect defect.*
- **TC-BILLPAY-028** `-1` → inline amount error; balance not `$101.00`; unchanged. *Expect defect.*
- **TC-BILLPAY-030** `0.001` (throwaway user) → valid-amount error and unchanged, or consistent 2-dp result; Overview and Activity still load.
- **TC-BILLPAY-031** `10.005` (throwaway user) → same with `$10.00`/`$10.01`.
- **TC-BILLPAY-033** `100.01` on $100.00 → no confirmation; `$100.00`; 1 row. *Expect defect.*
- **TC-BILLPAY-034** Account brought to `$0.00` in setup (Transfer Funds to a second fresh account), then 1.00 → no confirmation; `$0.00`. *Expect defect.*
- **TC-BILLPAY-035** `999999999` → no confirmation; balance unchanged.

### 5. Security and session
- **TC-BILLPAY-039** Register throwaway customer, note its account + balance; log back in as ficusroot2; `POST services_proxy/bank/billpay?accountId=<other>` → 4xx; other customer's balance unchanged, no `Bill Payment to Acme Utilities`. *Expect defect.*
- **TC-BILLPAY-040** dblclick Send Payment, 5.00 → balance `$95.00`, one Bill Payment row. *Expect defect.*
- **TC-BILLPAY-041** Logged-out `billpay.htm` → no bill pay form/button; login button visible.
- **TC-BILLPAY-042** Fill 5.00, clear cookies, click → login prompt, not only generic error; after re-login balance `$100.00`, 1 row.
- **TC-BILLPAY-043** Name `<img src=x onerror=alert(1)>` → `#payeeName` literal; no `img` in result; no dialog.
- **TC-BILLPAY-044** Same payload, then Activity → literal description; no `img` in table; no dialog. *Expect defect.*
- **TC-BILLPAY-045** SQL payloads in all text fields → literal confirmation + Activity description; only throwaway debited `$1.00`; second fresh account unchanged; Overview loads.

### Not automated
- **TC-BILLPAY-048** visual layout (manual). **TC-BILLPAY-049** 600+ option dropdown usability (manual).
