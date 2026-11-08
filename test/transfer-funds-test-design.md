# Transfer Funds – Risk-Based Test Design

**Feature:** Transfer Funds (`transfer.htm` UI → `POST services_proxy/bank/transfer` REST)
**Build:** ParaBank 6.0.0-SNAPSHOT, local Tomcat 11, JDBC access mode
**Date:** 2026-10-19

## How this suite was built

- **Code review** of [transfer.jsp](../src/main/webapp/WEB-INF/jsp/content/transfer.jsp), [RestServiceProxyController.java](../src/main/java/com/parasoft/parabank/web/controller/RestServiceProxyController.java), [BankManagerImpl.java](../src/main/java/com/parasoft/parabank/domain/logic/impl/BankManagerImpl.java), [Account.java](../src/main/java/com/parasoft/parabank/domain/Account.java) and [JdbcAccountDao.java](../src/main/java/com/parasoft/parabank/dao/jdbc/JdbcAccountDao.java).
- **Live API probes** against the running app, with the DB reset before each case. Each test case is tagged:
  - `[API-verified]`: the observed result was reproduced on 2026-10-19.
  - `[Code-derived]`: the behaviour was inferred from the source and not yet executed.

### How the feature actually works (key facts for testers)

| Fact | Consequence |
|---|---|
| The UI form makes no server round-trip. jQuery builds `POST services_proxy/bank/transfer?fromAccountId=..&toAccountId=..&amount=..` directly | `TransferFormValidator` (empty check) is **never invoked** by the UI flow |
| The server does `withdraw()` then `deposit()` inside one Spring transaction | Failures roll back (atomic), but there are **no business checks**: balance, sign, ownership, same-account and limits are all unchecked |
| The REST `authenticate()` checks only that *a* user is logged in, or that Basic-auth credentials are valid | There is **no account-ownership check** |
| DB column is `DECIMAL(19,4)`; reads call `balance.setScale(2)` with no rounding mode | Any balance with >2 decimals throws `ArithmeticException` on every read |
| On any non-2xx response the UI shows a single generic error | Specific messages (`The amount cannot be empty.`, `Please enter a valid amount.`) exist in the JSP but are **never displayed** |

### Test data (state after Admin Page → **Initialize**)

Login `john` / `demo` (customer 12212). Bob is login `parasoft` / `demo` (customer 12323).

| Account | Owner | Type | Balance |
|---|---|---|---|
| 12345 | john | Checking | -2300.00 |
| 12456 | john | Checking | 10.45 |
| 12567 | john | Checking | 100.00 |
| 12900 | john | Checking | 0.00 |
| 13344 | john | Savings | 1231.10 |
| 54321 | john | Checking | 1351.12 |
| 13455 | bob | Checking | 2014.76 |

**Reset before every test:** Admin Page → *Initialize*, or `POST /parabank/db.htm` with `action=INIT`. This is mandatory after TC-012 and TC-013, which make accounts permanently unreadable until a reset.

---

## Section 1 – Risk Matrix

Ranked by Risk Level, then by impact. "Observed" is today's live result.

| # | Risk | Category | Level | Likelihood | Impact | Observed | TC |
|---|---|---|---|---|---|---|---|
| R1 | Sub-cent amount (0.001, 1.005) corrupts both accounts; reads return HTTP 500 until DB reset | Financial – Precision | **High** | High (1 keystroke) | Critical (customer locked out of Overview/Transfer/Activity) | ❌ Defect | TC-012, TC-013 |
| R2 | Transfer exceeding available balance is accepted (overdraft to any depth) | Financial | **High** | High | Critical | ❌ Defect | TC-010, TC-011 |
| R3 | Negative amount reverses the flow (pulls money *into* source) | Financial / Fraud | **High** | Medium | Critical | ❌ Defect | TC-009 |
| R4 | Logged-in user can debit **another customer's** account via API | Fraud – Cross-account | **High** | Medium (needs a proxy tool) | Critical | ❌ Defect | TC-026, TC-027 |
| R5 | Double submission executes the transfer twice | Fraud | **High** | High | High | ❌ Defect | TC-029 |
| R6 | Concurrent transfers drain the source below zero | Concurrency | **High** | Medium | High | ❌ Defect (no balance guard) | TC-034 |
| R7 | No transaction or daily limit; 999,999,999 is accepted | Financial – Limits | **High** | Medium | High | ❌ Defect | TC-014, TC-016 |
| R8 | Session replay after logout | Fraud | **High** | Low | High | Not yet run | TC-031 |
| R9 | Partial transfer (debit without credit) if deposit fails | Financial – Integrity | **High** | Low | Critical | ✅ Pass (rolls back) | TC-035 |
| R10 | Zero-amount transfer accepted; creates $0 history rows | Financial | Medium | High | Low | ❌ Defect | TC-008 |
| R11 | Self-transfer accepted; creates 2 noise transactions | Business Rule | Medium | High | Low | ❌ Defect | TC-024 |
| R12 | Validation errors show a generic "internal error" instead of field messages | Validation / UX | Medium | High | Medium | ❌ Defect | TC-017, TC-018, TC-030 |
| R13 | Non-existent account ID returns HTTP 500, not 4xx | Validation | Medium | Low | Medium | ❌ Defect | TC-022 |
| R14 | Amount overflow (>15 integer digits) returns HTTP 500 | Validation | Medium | Low | Low | ❌ Defect (data safe) | TC-015 |
| R15 | Transfer to another customer's account via API (not possible from the UI) | Business Rule | Medium | Medium | Medium | Needs product decision | TC-028 |
| R16 | CSRF: endpoint accepts a cookie-only POST with no token | Fraud | Medium | Low | High | Not yet run | TC-032 |
| R17 | SQL injection via amount or account ID | Validation – Security | Medium | Low | Critical | ✅ Pass (HTTP 400, typed params) | TC-020, TC-021 |
| R18 | Transfer to closed or suspended account | Business Rule | Low | n/a | n/a | Gap: no account status in the model | TC-025 |
| R19 | Formatted amount input (`1,000`, `$10`) | Validation | Low | Medium | Low | Not yet run | TC-019 |
| R20 | Non-POST method allowed | Security | Low | Low | Low | ✅ Pass (405) | TC-033 |

---

## Section 2 – Test Suite

Fields: TC-ID | Title | Risk Level | Risk Category | Preconditions | Test Steps | Test Data | Expected Result | Automation.
Where today's behaviour differs from the expected result, an **Observed** line records the defect.

### A. Positive / Happy Path

**TC-001 | Transfer between two own checking accounts**
- **Risk Level:** High | **Category:** Core journey
- **Preconditions:** DB initialized; logged in as john.
- **Steps:** 1. Click *Transfer Funds* in the left menu. 2. Enter amount. 3. Select From and To accounts. 4. Click *Transfer*.
- **Test Data:** Amount `25.00`; From `12567`; To `12456`.
- **Expected Result:** Heading `Transfer Complete!` and text `$25.00 has been transferred from account #12567 to account #12456.` plus `See Account Activity for more details.` Accounts Overview shows 12567 = **$75.00** and 12456 = **$35.45**.
- **Automation:** Yes (UI + API balance assertion) `[API-verified]`

**TC-002 | Transfer is recorded in transaction history of both accounts**
- **Risk Level:** High | **Category:** Core journey / Audit
- **Preconditions:** TC-001 executed.
- **Steps:** 1. Open Account Activity for 12567. 2. Open Account Activity for 12456.
- **Test Data:** Accounts `12567`, `12456`.
- **Expected Result:** 12567 shows a new row with today's date, description `Funds Transfer Sent` and Debit `$25.00`. 12456 shows `Funds Transfer Received` with Credit `$25.00`. Exactly one row each.
- **Automation:** Yes `[Code-derived]`

**TC-003 | Minimum valid amount**
- **Risk Level:** Medium | **Category:** Boundary – minimum
- **Preconditions:** DB initialized; john logged in.
- **Steps:** Transfer as in TC-001.
- **Test Data:** Amount `0.01`; From `12567`; To `12456`.
- **Expected Result:** Accepted. Confirmation `$0.01 has been transferred from account #12567 to account #12456.` Balances 12567 = **$99.99** and 12456 = **$10.46**.
- **Automation:** Yes `[API-verified]`

**TC-004 | Transfer of exact available balance**
- **Risk Level:** High | **Category:** Boundary – exact balance
- **Preconditions:** DB initialized; john logged in.
- **Steps:** Transfer as in TC-001.
- **Test Data:** Amount `100.00`; From `12567` (balance 100.00); To `12456`.
- **Expected Result:** Accepted. 12567 = **$0.00** and 12456 = **$110.45**.
- **Automation:** Yes `[API-verified]`

**TC-005 | Transfer from checking to savings**
- **Risk Level:** Medium | **Category:** Core journey
- **Preconditions:** DB initialized; john logged in.
- **Steps:** Transfer as in TC-001.
- **Test Data:** Amount `50.00`; From `12567`; To `13344` (Savings, 1231.10).
- **Expected Result:** Confirmation shown. 12567 = **$50.00** and 13344 = **$1,281.10**.
- **Automation:** Yes `[Code-derived]`

**TC-006 | Account dropdowns list only the customer's own accounts**
- **Risk Level:** High | **Category:** Fraud – Cross-account (UI layer)
- **Preconditions:** DB initialized; john logged in.
- **Steps:** 1. Open Transfer Funds. 2. Expand *From account #*. 3. Expand *To account #*.
- **Test Data:** Customer 12212.
- **Expected Result:** Both lists contain exactly john's 11 accounts (12345 … 54321) and **not** 13455 (bob). The first account, 12345, is preselected in both.
- **Automation:** Yes `[Code-derived]`

**TC-007 | Confirmation formats whole-number input as currency**
- **Risk Level:** Low | **Category:** UI formatting
- **Preconditions:** DB initialized; john logged in.
- **Steps:** Transfer as in TC-001.
- **Test Data:** Amount `25` (no decimals); From `12567`; To `12456`.
- **Expected Result:** Confirmation reads `$25.00 has been transferred…`, not `$25`.
- **Automation:** Yes `[Code-derived]`

### B. Amount Boundaries & Financial Rules

**TC-008 | Zero amount is rejected**
- **Risk Level:** Medium | **Category:** Boundary – zero
- **Preconditions:** DB initialized; john logged in.
- **Steps:** Transfer as in TC-001.
- **Test Data:** Amount `0`; From `12567`; To `12456`.
- **Expected Result:** Rejected with a validation message (e.g. "Amount must be greater than $0.00"). No balance change and no transaction rows.
- **Observed:** ❌ HTTP 200 `Successfully transferred $0…`. UI shows `$0.00 has been transferred…`. Two $0.00 history rows are created.
- **Automation:** Yes `[API-verified]`

**TC-009 | Negative amount is rejected**
- **Risk Level:** High | **Category:** Boundary – negative / Fraud
- **Preconditions:** DB initialized; john logged in.
- **Steps:** Transfer as in TC-001.
- **Test Data:** Amount `-5`; From `12345` (-2300.00); To `12456` (10.45).
- **Expected Result:** Rejected with a validation message. Balances unchanged.
- **Observed:** ❌ Accepted. Money flows *backwards*: 12345 becomes **-2295.00** (credited) and 12456 becomes **5.45** (debited). The UI says `-$5.00 has been transferred from account #12345…`.
- **Automation:** Yes `[API-verified]`

**TC-010 | Amount of balance + 0.01 is rejected (insufficient funds)**
- **Risk Level:** High | **Category:** Financial – over balance
- **Preconditions:** DB initialized; john logged in.
- **Steps:** Transfer as in TC-001.
- **Test Data:** Amount `100.01`; From `12567` (100.00); To `12456`.
- **Expected Result:** Rejected with an "Insufficient funds" message. 12567 stays at **$100.00**.
- **Observed:** ❌ Accepted; 12567 becomes **-0.01**. A larger probe (`99999` from 12456) left 12456 at **-99,988.55**.
- **Automation:** Yes `[API-verified]`

**TC-011 | Transfer from an already-overdrawn account is rejected**
- **Risk Level:** High | **Category:** Financial – over balance
- **Preconditions:** DB initialized; john logged in.
- **Steps:** Transfer as in TC-001.
- **Test Data:** Amount `1.00`; From `12345` (-2300.00); To `12456`.
- **Expected Result:** Rejected with "Insufficient funds". Balance stays at -2300.00.
- **Observed:** ❌ Accepted; 12345 becomes -2301.00.
- **Automation:** Yes `[API-verified]`

**TC-012 | Three-decimal amount (0.001) is rejected or rounded safely**
- **Risk Level:** High | **Category:** Financial – decimal precision
- **Preconditions:** DB initialized; john logged in.
- **Steps:** 1. Transfer the amount. 2. Open Accounts Overview. 3. Open Account Activity for both accounts.
- **Test Data:** Amount `0.001`; From `12345`; To `12456`.
- **Expected Result:** Either rejected with "Amount can have at most 2 decimal places", or rounded to a 2-decimal amount that is shown to the user *before* execution. All pages stay usable.
- **Observed:** ❌ **Critical.** HTTP 200, and the UI says `$0.00 has been transferred…`. Afterwards `GET accounts/12345`, `GET accounts/12456` and `GET customers/12212/accounts` all return **HTTP 500**, so Accounts Overview, Transfer Funds and Account Activity are broken for john until a DB reset. Root cause: `JdbcAccountDao` calls `setScale(2)` without a `RoundingMode`.
- **Automation:** Yes `[API-verified]`

**TC-013 | Half-cent rounding (1.005)**
- **Risk Level:** High | **Category:** Financial – decimal precision
- **Preconditions:** DB initialized; john logged in.
- **Steps:** As TC-012.
- **Test Data:** Amount `1.005`; From `12567`; To `12456`.
- **Expected Result:** Rejected, or rounded consistently (HALF_EVEN gives 1.00; HALF_UP gives 1.01) with the rule documented. The debit and credit must be identical.
- **Observed:** ❌ Same corruption as TC-012: both accounts return HTTP 500 on read.
- **Automation:** Yes `[API-verified]`

**TC-014 | Very large amount is rejected or capped (999,999,999)**
- **Risk Level:** High | **Category:** Financial – limit
- **Preconditions:** DB initialized; john logged in.
- **Steps:** Transfer as in TC-001.
- **Test Data:** Amount `999999999`; From `12567` (100.00); To `12456`.
- **Expected Result:** Rejected ("Insufficient funds" and/or "Exceeds transaction limit"). No balance change.
- **Observed:** ❌ Accepted: 12567 = **-999,999,899.00** and 12456 = **1,000,000,009.45**.
- **Automation:** Yes `[API-verified]`

**TC-015 | Numeric overflow beyond DB precision**
- **Risk Level:** Medium | **Category:** Boundary – max value
- **Preconditions:** DB initialized; john logged in.
- **Steps:** Submit the transfer, then check both balances.
- **Test Data:** Amount `999999999999999999` (18 digits; the column holds 15 integer digits); From `12567`; To `12456`.
- **Expected Result:** Rejected with a field validation message (4xx). Balances unchanged.
- **Observed:** ⚠ HTTP 500. The UI shows `Error!` / `An internal error has occurred and has been logged.` Balances are unchanged (rollback works).
- **Automation:** Yes `[API-verified]`

**TC-016 | Cumulative daily limit is enforced**
- **Risk Level:** Medium | **Category:** Financial – daily limit
- **Preconditions:** DB initialized; john logged in. A product-defined daily limit (none is configured in the Admin Page today).
- **Steps:** Make repeated transfers from 54321 → 13344 until the total exceeds the limit.
- **Test Data:** e.g. 10 × `500.00` from `54321` (1351.12).
- **Expected Result:** The transfer that crosses the limit is rejected with "Daily transfer limit exceeded". Earlier transfers succeed.
- **Observed:** ⚠ Requirement gap: there is no limit parameter in the code or Admin Page, so every transfer is accepted (and with R2 the account overdraws).
- **Automation:** Yes `[Code-derived]`

### C. Input Validation

**TC-017 | Empty amount**
- **Risk Level:** Medium | **Category:** Validation – empty form
- **Preconditions:** DB initialized; john logged in.
- **Steps:** 1. Open Transfer Funds. 2. Leave Amount blank. 3. Click *Transfer*.
- **Test Data:** Amount `` (empty); From `12567`; To `12456`.
- **Expected Result:** Stay on the form with the inline message `The amount cannot be empty.` No request is executed.
- **Observed:** ❌ The API returns HTTP 400 `Required parameter 'amount' is not present.`, and the UI replaces the form with `Error!` / `An internal error has occurred and has been logged.`
- **Automation:** Yes `[API-verified; UI code-derived]`

**TC-018 | Non-numeric amount**
- **Risk Level:** Medium | **Category:** Validation – non-numeric
- **Preconditions:** DB initialized; john logged in.
- **Steps:** As TC-017.
- **Test Data:** Amount `abc`.
- **Expected Result:** Inline message `Please enter a valid amount.` Balances unchanged.
- **Observed:** ❌ HTTP 400 `Failed to convert 'amount' with value: 'abc'`. The UI shows the generic `Error!` page.
- **Automation:** Yes `[API-verified]`

**TC-019 | Formatted / padded amount input**
- **Risk Level:** Low | **Category:** Validation – format
- **Preconditions:** DB initialized; john logged in.
- **Steps:** Run as TC-001, once per value.
- **Test Data:** `1,000.00`, `$10`, ` 10 `, `1e2`, `10.`
- **Expected Result:** Each value is either accepted and normalised (e.g. `1e2` is shown as $100.00 *before* confirming) or rejected with `Please enter a valid amount.` A value is never silently interpreted differently from what the user typed.
- **Automation:** Yes `[Code-derived]`. Note that `1e2` parses as BigDecimal 100.

**TC-020 | SQL injection in amount**
- **Risk Level:** Medium | **Category:** Validation – SQL injection
- **Preconditions:** DB initialized; john logged in.
- **Steps:** Submit the amount via the UI and via the API.
- **Test Data:** `1' OR 1=1--`, `1; DROP TABLE Account;--`
- **Expected Result:** Rejected (HTTP 400 / `Please enter a valid amount.`). No DB change; Account table intact.
- **Observed:** ✅ HTTP 400 `Failed to convert 'amount'…`. No change.
- **Automation:** Yes `[API-verified]`

**TC-021 | Tampered / malformed account IDs**
- **Risk Level:** Low | **Category:** Validation – invalid account format
- **Preconditions:** DB initialized; john logged in.
- **Steps:** Send `POST services_proxy/bank/transfer` with a crafted `fromAccountId` / `toAccountId`.
- **Test Data:** `ABC`, `12345 OR 1=1`, `-1`, `1.5`, empty.
- **Expected Result:** HTTP 400 for each. No balance changes.
- **Automation:** Yes `[Code-derived]` (Integer binding)

**TC-022 | Non-existent account ID**
- **Risk Level:** Medium | **Category:** Validation – invalid account
- **Preconditions:** DB initialized; john logged in.
- **Steps:** Submit via the API, then check the balance of the valid account.
- **Test Data:** (a) From `99999` → To `12456`; (b) From `12567` → To `99999`; Amount `1.00`.
- **Expected Result:** HTTP 404/400 with "Account not found". The valid account is unchanged.
- **Observed:** ⚠ HTTP 500 generic error. Case (b) correctly rolls back: 12567 stays at **100.00**.
- **Automation:** Yes `[API-verified]`

### D. Business Rules

**TC-023 | Different From/To account is required**
- **Risk Level:** Low | **Category:** Business rule – UI defaults
- **Preconditions:** DB initialized; john logged in.
- **Steps:** Open Transfer Funds, enter `10`, and click *Transfer* without changing the dropdowns.
- **Test Data:** Both dropdowns default to `12345`.
- **Expected Result:** Blocked with "From and To accounts must be different".
- **Observed:** Same defect as TC-024. Because both dropdowns default to the same account, an unchanged form produces a self-transfer.
- **Automation:** Yes `[Code-derived]`

**TC-024 | Self-transfer (same source and destination)**
- **Risk Level:** Medium | **Category:** Business rule – self-transfer
- **Preconditions:** DB initialized; john logged in.
- **Steps:** Transfer with the same From and To account.
- **Test Data:** Amount `2`; From `12345`; To `12345`.
- **Expected Result:** Rejected with "From and To accounts must be different". No history rows.
- **Observed:** ❌ HTTP 200 `Successfully transferred $2 from account #12345 to account #12345`. Net balance is unchanged (-2300.00), but a Sent and a Received row are added.
- **Automation:** Yes `[API-verified]`

**TC-025 | Transfer to a closed or suspended account**
- **Risk Level:** Low | **Category:** Business rule – account status
- **Preconditions:** An account in Closed/Suspended status.
- **Steps:** Transfer into and out of that account.
- **Test Data:** Requires a closed account.
- **Expected Result:** Rejected with "Account is not active".
- **Observed:** ⚠ Not testable: the `Account` model has no status field and ParaBank has no close or suspend function. Logged as a requirement gap.
- **Automation:** No `[Code-derived]`

### E. Fraud & Security

**TC-026 | Debit another customer's account via the API (session)**
- **Risk Level:** High | **Category:** Fraud – cross-account access
- **Preconditions:** DB initialized; logged in as john (browser session cookie).
- **Steps:** Using DevTools or a proxy, send `POST /parabank/services_proxy/bank/transfer?fromAccountId=13455&toAccountId=12567&amount=1` with john's cookie.
- **Test Data:** From `13455` (bob, 2014.76); To `12567` (john).
- **Expected Result:** HTTP 403 "You are not authorized to access this account". Bob's balance unchanged.
- **Observed:** ❌ **HTTP 200**. Bob's 13455 drops to **2013.76** and john's 12567 rises to **101.00**.
- **Automation:** Yes `[API-verified]`

**TC-027 | Debit another customer's account via Basic auth**
- **Risk Level:** High | **Category:** Fraud – cross-account access
- **Preconditions:** DB initialized; no session.
- **Steps:** Send `POST services_proxy/bank/transfer?fromAccountId=13455&toAccountId=12567&amount=1` with header `Authorization: Basic base64(john:demo)`.
- **Test Data:** Credentials `john` / `demo`; From `13455` (bob).
- **Expected Result:** HTTP 403. No change.
- **Observed:** ❌ HTTP 200 `Successfully transferred $1 from account #13455 to account #12567`.
- **Automation:** Yes `[API-verified]`

**TC-028 | Credit another customer's account via the API**
- **Risk Level:** Medium | **Category:** Business rule / Fraud
- **Preconditions:** DB initialized; john logged in.
- **Steps:** Send the API transfer with To = bob's account.
- **Test Data:** From `12567`; To `13455`; Amount `1.00`.
- **Expected Result:** Needs a product decision. The UI only allows the customer's own accounts, so the API should enforce the same rule (HTTP 403), *or* external transfers should be a separate, explicitly designed feature.
- **Observed:** HTTP 200; 13455 = 2015.76.
- **Automation:** Yes `[API-verified]`

**TC-029 | Double submission (rapid double click on Transfer)**
- **Risk Level:** High | **Category:** Fraud – double submission
- **Preconditions:** DB initialized; john logged in.
- **Steps:** 1. Enter the amount. 2. Double-click *Transfer* rapidly, or press Enter twice.
- **Test Data:** Amount `10.00`; From `12567` (100.00); To `12456`.
- **Expected Result:** Exactly **one** transfer: 12567 = **$90.00**. The button is disabled after the first click and/or the server rejects the duplicate (idempotency key).
- **Observed:** ❌ Two parallel API submissions both executed: 12567 = **$80.00**. The JSP does not disable the button and sends no idempotency token.
- **Automation:** Partial (the API part is automatable; real UI double-click timing is flaky) `[API-verified]`

**TC-030 | Transfer with an expired / missing session**
- **Risk Level:** Medium | **Category:** Fraud – session handling
- **Preconditions:** john logged in with Transfer Funds open; then the session expires (Tomcat default 30 min) or *Log Out* is clicked in another tab.
- **Steps:** Submit a transfer from the open form.
- **Test Data:** Amount `10.00`; From `12567`; To `12456`.
- **Expected Result:** Redirect to the login page with `User login required` (or a similar message). No balance change.
- **Observed:** API returns ✅ HTTP 401 `{"message":"User login required"}`, but the UI shows ❌ the generic `Error!` / `An internal error has occurred and has been logged.`
- **Automation:** Yes `[API-verified; UI code-derived]`

**TC-031 | Session replay after logout**
- **Risk Level:** High | **Category:** Fraud – session replay
- **Preconditions:** DB initialized.
- **Steps:** 1. Log in as john and capture the `JSESSIONID`. 2. Click *Log Out*. 3. Replay the transfer POST with the captured cookie.
- **Test Data:** From `12567`; To `12456`; Amount `1.00`.
- **Expected Result:** HTTP 401. 12567 stays at 100.00.
- **Automation:** Yes `[Code-derived]`, not yet run

**TC-032 | Cross-site request forgery**
- **Risk Level:** Medium | **Category:** Fraud – CSRF
- **Preconditions:** john logged in. An attacker page hosted on another origin.
- **Steps:** The attacker page auto-submits `<form method="POST" action="http://localhost:8080/parabank/services_proxy/bank/transfer?fromAccountId=12567&toAccountId=13455&amount=50">`.
- **Test Data:** Browsers Chrome, Firefox and Edge (SameSite defaults differ).
- **Expected Result:** Request rejected (CSRF token or SameSite=Strict/Lax cookie). No transfer.
- **Observed:** The endpoint needs no token; it accepts a POST that carries only the cookie. Whether browsers send the cookie depends on SameSite defaults, which still needs browser verification.
- **Automation:** Partial `[Code-derived]`

**TC-033 | Only POST is accepted**
- **Risk Level:** Low | **Category:** Security – HTTP method
- **Preconditions:** john logged in.
- **Steps:** Send `GET services_proxy/bank/transfer?fromAccountId=12567&toAccountId=12456&amount=1`.
- **Test Data:** n/a
- **Expected Result:** HTTP 405. No transfer.
- **Observed:** ✅ HTTP 405.
- **Automation:** Yes `[API-verified]`

### F. Concurrency & Integrity

**TC-034 | Simultaneous transfers draining the same source**
- **Risk Level:** High | **Category:** Concurrency
- **Preconditions:** DB initialized; john logged in.
- **Steps:** Fire 2 (then 10) parallel API transfers of the full balance from the same source.
- **Test Data:** From `12567` (100.00); To `12456`; Amount `100.00` each.
- **Expected Result:** Exactly one succeeds; the others are rejected with "Insufficient funds". 12567 = **$0.00**, never negative. Sum of all balances is unchanged.
- **Observed:** ❌ Expected to fail: there is no balance check (see TC-010), so every request succeeds and the source goes negative. Also check for lost updates, where the final balance does not equal the starting balance minus the successful debits.
- **Automation:** Yes `[Code-derived]`

**TC-035 | Atomicity: credit failure rolls back the debit**
- **Risk Level:** High | **Category:** Financial – integrity
- **Preconditions:** DB initialized; john logged in.
- **Steps:** Transfer to a non-existent destination, then check the source balance and history.
- **Test Data:** From `12567`; To `99999`; Amount `1.00`.
- **Expected Result:** Transfer fails. 12567 stays at **$100.00**, with no `Funds Transfer Sent` row.
- **Observed:** ✅ Balance stays at 100.00 (the transaction rolled back). The error is HTTP 500 rather than 4xx (see TC-022).
- **Automation:** Yes `[API-verified]`

---

## Section 3 – Coverage Check

### CLAUDE.md policies

> **Note:** [CLAUDE.md](../CLAUDE.md) has no "Financial Policies" section. The agent asks for policy-to-TC mapping, so the testing objectives that CLAUDE.md *does* define are mapped below. Adding explicit policies (overdraft rule, limits, rounding rule, ownership rule) to CLAUDE.md would turn several "Expected Result" assumptions into testable requirements.

| CLAUDE.md item | Covered by |
|---|---|
| Key workflow 4: Fund Transfer | TC-001 – TC-035 |
| Key workflow 3: Account Overview (balance reflects transfer) | TC-001, TC-004, TC-005, TC-012 |
| Key workflow 6: Transaction History | TC-002, TC-008, TC-024, TC-035 |
| Core user journeys | TC-001, TC-002, TC-005, TC-006 |
| Positive test cases | TC-001 – TC-007, TC-020 (secure rejection), TC-033, TC-035 |
| Negative test cases | TC-008 – TC-011, TC-014, TC-017, TC-018, TC-021 – TC-032 |
| Boundary conditions | TC-003, TC-004, TC-008 – TC-015 |

### Skill risk categories

| Category (banking-qa-knowledge) | Item | TC |
|---|---|---|
| Financial | Exceeds available balance | TC-010, TC-011, TC-014 |
| | Decimal precision | TC-012, TC-013 |
| | Daily / transaction limit | TC-014, TC-016 |
| Fraud | Double submission | TC-029 |
| | Session replay / expired session | TC-030, TC-031 |
| | Cross-account access | TC-006, TC-026, TC-027, TC-028, TC-032 |
| Boundary | `0` | TC-008 |
| | `-1` | TC-009 |
| | `0.01` | TC-003 |
| | `[balance]` | TC-004 |
| | `[balance+0.01]` | TC-010 |
| | `999999999` | TC-014 (plus overflow TC-015) |
| | `0.001` | TC-012 |
| Validation | SQL injection | TC-020, TC-021 |
| | Non-numeric amount | TC-018, TC-019 |
| | Empty form | TC-017 |
| | Invalid account format | TC-021, TC-022 |
| Business rule | Self-transfer | TC-023, TC-024 |
| | Closed / suspended account | TC-025 (gap) |
| Concurrency | Simultaneous draining | TC-034, TC-035 |

**Result:** all 20 skill risk items and all applicable CLAUDE.md objectives have at least one test case.
