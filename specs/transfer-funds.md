# Transfer Funds – Playwright Test Plan

**Application:** http://localhost:8080/parabank
**Explored:** 2026-11-08 with the Playwright MCP browser, logged in as `ficusroot2`
**Manual design source:** [test/transfer-funds-test-design.md](../test/transfer-funds-test-design.md)
**Automation:** [tests/transfer-funds.spec.ts](../tests/transfer-funds.spec.ts)

## Starting state

Every scenario starts from a fresh browser context and creates its own preconditions:

1. Log in as the configured user. If the user no longer exists (ParaBank's DB is rebuilt on restart), register it first.
2. Open two new CHECKING accounts, **A** and **B**, funded from the customer's first account. ParaBank seeds every new account with exactly **$100.00** (the `minimumBalance` admin parameter).
3. Run the scenario between A and B, so the asserted balances are always known exact values.

Scenarios that permanently corrupt accounts (sub-cent amounts) run under a **throwaway user** registered for that test only.

## Live DOM selectors

No element on these pages has a `data-testid`, and the form inputs have no `<label>` or accessible name. Role-based locators are used where an ARIA name exists, and IDs everywhere else.

### Login (`index.htm`, left panel)

| Element | Selector used | Observed |
|---|---|---|
| Username | `input[name="username"]` | textbox, no accessible name |
| Password | `input[name="password"]` | textbox, no accessible name |
| Log In | `getByRole('button', { name: 'Log In' })` | `<input type="submit" value="Log In">` |
| Login failure | `#rightPanel .error` | "The username and password could not be verified." |
| Login success | `getByRole('heading', { name: 'Accounts Overview' })` | redirects to `overview.htm` |

### Register (`register.htm`)

| Element | Selector used |
|---|---|
| Fields | `[id="customer.firstName"]`, `customer.lastName`, `customer.address.street`, `customer.address.city`, `customer.address.state`, `customer.address.zipCode`, `customer.phoneNumber`, `customer.ssn`, `customer.username`, `customer.password`, `[id="repeatedPassword"]` |
| Register | `getByRole('button', { name: 'Register' })` |
| Success | heading `Welcome <username>` + "Your account was created successfully. You are now logged in." |
| Duplicate | "This username already exists." |

### Accounts Overview (`overview.htm`)

| Element | Selector used | Observed |
|---|---|---|
| Table | `#accountTable` | rows: `<a href="activity.htm?id=13566">13566</a>` · `$515.50` · `$515.50` |
| Account links | `#accountTable tbody a[href^="activity.htm"]` | text = account ID |

### Open New Account (`openaccount.htm`)

| Element | Selector used | Observed |
|---|---|---|
| Account type | `#type` | options `0:CHECKING`, `1:SAVINGS` |
| Funding account | `#fromAccountId` | populated by AJAX |
| Submit | `getByRole('button', { name: 'Open New Account' })` | `<input type="button">` |
| Success | `#openAccountResult` → `#newAccountId` | "Account Opened!" / "Your new account number: 13677" |

### Transfer Funds (`transfer.htm`)

| Element | Selector used | Observed |
|---|---|---|
| Amount | `#amount` | `type="text" name="input"`, no client validation |
| From account | `#fromAccountId` | AJAX-populated; first option preselected |
| To account | `#toAccountId` | AJAX-populated; first option preselected |
| Transfer | `getByRole('button', { name: 'Transfer', exact: true })` | `<input type="submit">`, never disabled |
| Success panel | `#showResult`, heading "Transfer Complete!" | "$25.00 has been transferred from account #13677 to account #13788." |
| Result values | `#amountResult`, `#fromAccountIdResult`, `#toAccountIdResult` | |
| Error panel | `#showError` | "Error!" / "An internal error has occurred and has been logged." |
| Inline errors | `[id="amount.errors"]` ×2 (duplicate ID) | "The amount cannot be empty." / "Please enter a valid amount.": **never displayed** |

### Account Activity (`activity.htm?id=<id>`)

| Element | Selector used | Observed |
|---|---|---|
| Balance | `#balance` | `$75.00` |
| Transactions | `#transactionTable tbody tr` | `11-08-2026` · link "Funds Transfer Sent" · `$25.00` (Debit) · `` (Credit) |

## Scenarios

`[defect]` marks a scenario whose expected (correct) behaviour fails today. These run as `test.fail()`: they report as passing while the bug exists and fail loudly once it is fixed, which is the signal to remove the marker.

### 1. Successful transfers

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 1.1 | Transfer between own checking accounts | Amount `25.00`, From A, To B, click Transfer | Heading "Transfer Complete!"; "$25.00 has been transferred from account #A to account #B." |
| 1.2 | Balances update with exact precision | As 1.1, open Activity for A and B | A `$75.00`, B `$125.00` |
| 1.3 | Transaction history records both sides | As 1.1, open Activity for A and B | A: today, "Funds Transfer Sent", Debit `$25.00`; B: "Funds Transfer Received", Credit `$25.00`; one row each |
| 1.4 | Minimum valid amount | Amount `0.01` | A `$99.99`, B `$100.01` |
| 1.5 | Exact available balance | Amount `100.00` | A `$0.00`, B `$200.00` |
| 1.6 | Whole-number input is shown as currency | Amount `25` | Confirmation shows `$25.00` |
| 1.7 | Checking to savings | B opened as SAVINGS, amount `50.00` | A `$50.00`, B `$150.00` |
| 1.8 | Dropdowns list only the customer's accounts | Open Transfer Funds | Both dropdowns contain A and B and not the other customer's account |

### 2. Input validation

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 2.1 | Empty amount moves no money | Leave amount blank, submit | Error state shown; A and B stay at `$100.00` |
| 2.2 | Empty amount shows inline message `[defect]` | As 2.1 | Form stays visible with "The amount cannot be empty." |
| 2.3 | Non-numeric amount moves no money | Amount `abc` | A and B stay at `$100.00` |
| 2.4 | Non-numeric amount shows inline message `[defect]` | Amount `abc` | "Please enter a valid amount." |
| 2.5 | SQL injection in amount is rejected | Amount `1' OR 1=1--` | Error state; A and B stay at `$100.00` |
| 2.6 | Overflowing amount is rejected | Amount `999999999999999999` | Error state; A and B stay at `$100.00` |

### 3. Financial rules (all `[defect]` today)

| # | Scenario | Amount | Expected |
|---|---|---|---|
| 3.1 | Zero amount rejected | `0` | No "Transfer Complete!"; A and B `$100.00` |
| 3.2 | Negative amount rejected | `-5.00` | No "Transfer Complete!"; A and B `$100.00` |
| 3.3 | Balance + 0.01 rejected | `100.01` | No "Transfer Complete!"; A `$100.00` |
| 3.4 | Very large amount rejected | `999999999` | No "Transfer Complete!"; A `$100.00` |
| 3.5 | Same source and destination rejected | `10.00`, From A, To A | No "Transfer Complete!"; A has no new transactions |
| 3.6 | Sub-cent amount rejected *(throwaway user)* | `0.001` | No "Transfer Complete!"; A and B still readable at `$100.00` |

### Defects found while automating

| Defect | Evidence | Effect on the suite |
|---|---|---|
| ID sequence is not concurrency-safe | Parallel Open Account / Register throws `DuplicateKeyException … table: ACCOUNT` and `CannotAcquireLockException … SELECT next_id FROM Sequence` | `playwright.config.ts` runs with `workers: 1` |
| Overlong username reported as a duplicate | `Customer.username` is `VARCHAR(20)` with no length validation; a 21-char name shows "This username already exists." | Throwaway usernames are kept to 15 chars |

### 4. Fraud and session

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 4.1 | Double-click submits once `[defect]` | Amount `10.00`, double-click Transfer | A `$90.00`, exactly one "Funds Transfer Sent" row |
| 4.2 | Cannot debit another customer's account `[defect]` | `POST services_proxy/bank/transfer` from the other customer's account with this session | HTTP 403 |
| 4.3 | Expired session prompts login `[defect]` | Clear cookies, submit a transfer | Login form shown; no generic internal error |
