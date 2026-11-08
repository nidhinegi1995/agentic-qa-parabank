# US-BILLPAY-01: Bill Pay (Clarified)

| Field | Value |
|---|---|
| Story ID | `US-BILLPAY-01` |
| Feature code | `BILLPAY` (test IDs `TC-BILLPAY-NNN`, defect IDs `DEF-BILLPAY-NNN`) |
| Feature URL | `http://localhost:8080/parabank/billpay.htm` |
| Test login | `ficusroot2` / `test@123` (customer ID `12434`) |
| Prepared by | story-analyst (QA pipeline step 1 of 5) |
| Date | 2026-11-08 |
| Status | **Draft: assumptions are flagged for PO sign-off** |

---

## 1. Original Story (verbatim)

> As a ParaBank customer, I want to pay a bill from my account by entering payee details and an amount, so that I can settle payments without visiting a branch.

**Acceptance Criteria**
1. User enters Payee Name, Address, City, State, Zip Code, Phone #, Account #, Verify Account #, Amount, and selects From account #.
2. Clicking Send Payment processes the payment and shows a confirmation.

---

## 2. Evidence Base

### 2.1 Sources reviewed (read-only, no payment submitted)

- UI: `src/main/webapp/WEB-INF/jsp/content/billpay.jsp`, plus the legacy `billpayConfirm.jsp`, which the UI flow never uses.
- Server: `RestServiceProxyController.billPay()`, `BillPayController`, `BillPayForm`, `BillPayFormValidator`, `PayeeValidator`, `AddressValidator`, `Payee`, `BankManagerImpl.withdraw()`, `Account.debit()`, `JdbcAccountDao`.
- Messages: `src/main/resources/messages.properties`.
- Schema: `src/main/resources/com/parasoft/parabank/dao/jdbc/sql/create.sql`.
- Activity rendering: `src/main/webapp/WEB-INF/jsp/content/activity.jsp`.
- Live app: logged in as ficusroot2 and ran a `GET billpay.htm` and a `GET services_proxy/bank/customers/12434/accounts`.
- Precedent: Transfer Funds (`test/transfer-funds-test-design.md`, `specs/transfer-funds.md`, `tests/transfer-funds.spec.ts`, `pages/transfer-funds.page.ts`, `test-data/transfer-funds.json`).

> **Note on policy sources:** The agent definition says to ground assumptions in "CLAUDE.md Financial Policies". **`.claude/CLAUDE.md` has no Financial Policies or High Risk Modules section.** Assumptions therefore cite (a) the `banking-qa-knowledge` skill (risk categories and boundary table), (b) the Transfer Funds precedent, or (c) the observed app/source as the current baseline. Add the missing section to CLAUDE.md so later stories have a policy reference. *(Flagged for PO.)*

### 2.2 Observed in app/source (facts, not assumptions)

| # | Observation | Source |
|---|---|---|
| O1 | The page heading is `Bill Payment Service` and the sub-text is `Enter payee information`. The button is `Send Payment` (`input[type=button]`, not a submit button). | billpay.jsp, messages.properties, live page |
| O2 | The form has 9 inputs plus 1 select: `payee.name`, `payee.address.street`, `payee.address.city`, `payee.address.state`, `payee.address.zipCode`, `payee.phoneNumber`, `payee.accountNumber`, `verifyAccount`, `amount`, and `fromAccountId` (select). None has `maxlength`, `type=number` or `required`. | billpay.jsp |
| O3 | The Phone # input gets a **random UUID `id` and class on every page load**. It must be located by `name="payee.phoneNumber"`. | billpay.jsp (inline comment) |
| O4 | Validation runs on the client only (jQuery). Name, Address, City, State, Zip and Phone are checked as **non-empty after trim**. Format is not checked. | billpay.jsp `validate()` |
| O5 | Account #, Verify Account # and Amount pass `validateNumber()`. An empty value gives `empty`. A value gives `invalid` only when `isNaN(parseFloat(v))`. **`parseFloat` accepts leading-numeric strings such as `12abc`, `1e3`, `-5`, `0` and `1.5`.** | billpay.jsp |
| O6 | The Verify Account # mismatch check is a **raw string comparison** (`verifyAccount !== account`). It runs only when Verify Account # is numeric. `0123` vs `123` is a mismatch, and so is `123 ` vs `123`. | billpay.jsp |
| O7 | Inline error texts (exact): `Payee name is required.` · `Address is required.` · `City is required.` · `State is required.` · `Zip Code is required.` · `Phone number is required.` · `Account number is required.` · `Please enter a valid number.` · `The account numbers do not match.` · `The amount cannot be empty.` · `Please enter a valid amount.` All failing fields show their messages at once, and the request is not sent. | billpay.jsp, messages.properties |
| O8 | When the form is valid, the UI sends `POST services_proxy/bank/billpay?accountId=<from>&amount=<raw amount>` with a JSON `Payee` body. `BillPayFormValidator` (server) is **not** invoked by this flow, the same as in Transfer Funds. | billpay.jsp, RestServiceProxyController |
| O9 | The server only checks that **a** user is logged in (or that Basic auth is valid). Then `withdraw()` → `balance.subtract(amount)`. **It has no checks for balance, zero/negative, max/limit, precision or account ownership.** | RestServiceProxyController.authenticate(), BankManagerImpl.withdraw(), Account.debit() |
| O10 | Success: the form is hidden. Heading `Bill Payment Complete`. Text `Bill Payment to {payeeName} in the amount of {amount} from account {fromAccountId} was successful.` then `See Account Activity for more details.` Amount is formatted as `'$' + amount.toFixed(2)`. Payee name is inserted with `.text()`. The browser title becomes `ParaBank | Bill Payment Complete`. | billpay.jsp, messages.properties |
| O11 | Any non-2xx response hides the form and shows `Error!` / `An internal error has occurred and has been logged.` No field-specific server message appears. | billpay.jsp `showError()` |
| O12 | Side effect: there is exactly one Debit transaction on the From account, with description `Bill Payment to {payeeName}`. **Payee address, phone and account # are not persisted, and no account is credited.** | BankManagerImpl.withdraw(), RestServiceProxyController |
| O13 | `Transaction.description` is `VARCHAR(255)` and the prefix `Bill Payment to ` takes 16 chars. Amount and balance are `DECIMAL(19,4)`, and reads call `setScale(2)` with no rounding mode (see Transfer R1). | create.sql, JdbcAccountDao |
| O14 | `Payee.accountNumber` is `Integer` (max 2147483647). The amount query param is `BigDecimal`. A non-coercible value such as `12abc` makes the server fail, and the UI shows the generic error (O11). *(Code-derived. Not executed.)* | Payee.java, RestServiceProxyController |
| O15 | Account Activity builds rows by **string-concatenating `transaction.description` into HTML**, so the payee name is rendered unescaped there. | activity.jsp line ~135 |
| O16 | The From dropdown lists every account of the logged-in customer. The first account is preselected. **Live:** ficusroot2 has **612 accounts**. The first and default one is `13566`, CHECKING, balance **-60,584.50**. | BillPayController.getAccountIds(), live GET |
| O17 | The page has no double-submit guard. The button is not disabled after the click. | billpay.jsp |

---

## 3. Ambiguities Found

**A1: Mandatory fields not stated.**
AC1 lists the fields but never says which are mandatory or what happens when one is blank or whitespace-only. *(Observed: all 9 inputs are required. O4, O5, O7.)*

**A2: Format and length rules for payee name and address fields.**
No rules are given for Name, Address, City, State (2-letter code or free text?), Zip Code (5-digit, ZIP+4, non-US?) or Phone # (digits only, length, separators). Max lengths are undefined. *(Observed: non-empty only, no maxlength. O2, O4.)*

**A3: Payee Account # format.**
The story gives no allowed length, says nothing about whether leading zeros or decimals are allowed, and sets no max value. *(Observed: the client accepts any `parseFloat`-able value. The server type is Integer. O5, O14.)*

**A4: Verify Account # match semantics.**
The story does not say whether the comparison is exact text or numeric, or whether surrounding whitespace and leading zeros count. It also does not say which error shows when Verify is both empty and mismatched. *(Observed: raw string compare. O6.)*

**A5: Amount: zero, negative and minimum.**
The story states no minimum amount and does not say whether `0` or negative values are rejected. *(Observed: both pass client validation, and the server debits without checks. O5, O9.)*

**A6: Amount precision and input formatting.**
The story does not say how sub-cent input (`0.001`, `10.005`), currency symbols (`$10`), thousands separators (`1,000`), scientific notation (`1e3`) or trailing text (`10abc`) are handled. *(Observed: `parseFloat` accepts `1e3` and `10abc` on the client. Transfer precedent R1: sub-cent amounts corrupt the account.)*

**A7: Insufficient funds and overdraft.**
The story does not say whether a payment can exceed the From account's available balance, or whether it is allowed from an already-negative account. The default From account for the test user is overdrawn (-60,584.50). *(Observed: no balance check. O9, O16.)*

**A8: Maximum amount and transaction/daily limits.**
The story sets no per-payment cap and no daily limit. *(Observed: none. O9.)*

**A9: From account eligibility, default and ownership.**
The story does not say which accounts can be paid from (Checking only? Savings? Loan?), whether a default is preselected, or how a 600+ entry dropdown should behave. It also does not say whether the API must refuse a From account the user does not own. *(Observed: all own accounts listed, first preselected, no ownership check on the API. O9, O16.)*

**A10: Confirmation content.**
AC2 says only "shows a confirmation". It does not specify the exact text, how the amount is formatted, or whether the confirmation includes the payee account #, date, reference/transaction ID or new balance. *(Observed text and formatting: O10.)*

**A11: Post-payment effects.**
The story does not say whether the From balance is debited, which transaction-history description is used, or whether the payee's account (if it is a ParaBank account) is credited. It also does not say whether payee details are saved for reuse. *(Observed: debit only, description `Bill Payment to {name}`, nothing saved or credited. O12.)*

**A12: Error presentation.**
The story does not say whether errors show inline per field and all at once, or one at a time. It also does not say what the user sees on a server-side failure, or whether the entered data is kept. *(Observed: inline client errors, all at once (O7). Server errors replace the form with a generic message and the data is lost (O11).)*

**A13: Double submission and idempotency.**
The story does not say what should happen if Send Payment is clicked twice quickly. *(Observed: no guard. O17.)*

**A14: Session expiry and unauthenticated access.**
The story does not say what happens when the session has expired before Send Payment, or when `billpay.htm` is opened while logged out.

**A15: Input security (XSS / SQL injection) in payee fields.**
The story does not say whether markup or script in Payee Name must be neutralised, or how SQL meta-characters are handled. *(Observed: the confirmation escapes the name with `.text()`. Account Activity renders it **unescaped** (O15), a potential stored XSS.)*

**A16: Payee Name length vs storage.**
The story gives no max length. Names over 239 characters overflow the 255-char transaction description, which is expected to fail with the generic error. *(Code-derived. O13.)*

**A17: Paying one of the user's own accounts (self-payment).**
The story does not say whether the payee Account # may equal the From account or another account the customer owns. It also does not say whether such a payment should be blocked or redirected to Transfer Funds.

**A18: Post-confirmation navigation.**
The story does not say whether the user can start a new payment from the confirmation, whether the form resets, or whether a browser refresh or Back resubmits. *(Observed: the confirmation has no "new payment" control. Reloading `billpay.htm` shows an empty form.)*

---

## 4. Assumptions Made (flagged for PO sign-off)

Each assumption gives the expected behaviour the test author should assert. Where it conflicts with an observation, the test should be written against the assumption and is expected to **fail** (log a defect). This is the same convention as the Transfer Funds suite.

| ID | Resolves | Assumption (expected behaviour) | Source |
|---|---|---|---|
| **AS1** | A1 | All 9 inputs are mandatory, and a value that is only whitespace counts as empty. Each blank field shows its exact message from O7. All messages show at once, and no request is sent. | Observed (O4, O7). Skill: Validation Risks, "Empty form submission" |
| **AS2** | A2 | No format validation is enforced on Name, Address, City, State, Zip or Phone for this story. Any non-empty text is accepted, e.g. State `CA` or `California`, Zip `90210` or `ABC`. Format rules are out of scope until the PO defines them. | Observed (O4). No policy in CLAUDE.md, so no rule is invented |
| **AS3** | A3 | Payee Account # must be a whole number. Non-numeric input such as `abc` shows `Please enter a valid number.` Mixed input such as `12abc` must be rejected without debiting. Today it passes the client check and is expected to hit the generic error (O5, O14). Values above 2147483647 are rejected without debiting. | Observed (O5, O7, O14). Skill: "Invalid account number format" |
| **AS4** | A4 | Verify Account # must exactly equal Account # as entered. On a mismatch, `The account numbers do not match.` is shown and nothing is sent. Empty Verify shows `Account number is required.`, not the mismatch text. | Observed (O6, O7) |
| **AS5** | A5 | The minimum valid amount is `0.01`. `0` and negative amounts (`-1`) are rejected with a validation message and no balance change. *(Observed today: accepted and debited. Expect defects.)* | Skill boundary table (0 → reject, -1 → reject, 0.01 → accept). Transfer precedent TC-008, TC-009 |
| **AS6** | A6 | Amounts are limited to 2 decimal places. `0.001` and other sub-cent input must be rejected (or rounded) without corrupting the balance. `$10`, `1,000` and `10abc` show `Please enter a valid amount.`, or are rejected with no money moved. A whole number like `25` shows on the confirmation as `$25.00`. | Skill boundary table (0.001 precision). Transfer precedent R1/TC-012, TC-013, TC-019, TC-007 |
| **AS7** | A7 | A payment over the From account's available balance is rejected with an insufficient-funds message, and the balance is unchanged. Paying the exact balance is accepted and leaves `$0.00`. Payments from an account whose balance is already ≤ 0 are rejected. *(Observed: no check. Expect defects.)* | Skill boundary table ([balance] accept, [balance+0.01] reject). Skill: Financial Risks. Transfer precedent TC-004, TC-010 |
| **AS8** | A8 | `999999999` is rejected or capped. The exact per-payment and daily limits are a **PO decision**. Until then, tests assert only that `999999999` does not succeed. | Skill boundary table (999999999 → reject or cap). Transfer precedent R7/TC-014 |
| **AS9** | A9 | The From dropdown lists only the logged-in customer's own accounts, with the first one preselected. Every listed account type may be used. The bill-pay API must refuse a From account owned by another customer (HTTP 4xx, no debit). *(Observed: no ownership check. Expect defect.)* | Observed (O16). Skill: Fraud Risks, "Cross-account access". Transfer precedent TC-006, TC-026 |
| **AS10** | A10 | The confirmation is exactly: heading `Bill Payment Complete`, text `Bill Payment to {Payee Name} in the amount of ${amount to 2 dp} from account {From account} was successful.`, then `See Account Activity for more details.` The page title is `ParaBank \| Bill Payment Complete`. No reference number, date or new balance is required for this story. | Observed (O10). Transfer precedent confirmation pattern (TC-001, TC-007) |
| **AS11** | A11 | A successful payment debits the From account by exactly the amount. It creates exactly one Debit transaction dated today, with description `Bill Payment to {Payee Name}`. No other account is credited, and payee details are not saved. | Observed (O12). Transfer precedent TC-001/TC-002 (balance and history assertions) |
| **AS12** | A12 | Client-side errors are inline, per field and all at once (AS1). Any server-side rejection shows `Error!` / `An internal error has occurred and has been logged.` and moves no money. A specific server message is preferred, but tests assert only no-money-moved plus the error panel. | Observed (O7, O11). Transfer precedent R12 |
| **AS13** | A13 | A rapid double-click on Send Payment produces exactly **one** debit and one transaction. *(Observed: no guard. Expect defect.)* | Skill: Fraud Risks, "Double submission". Transfer precedent R5/TC-029 |
| **AS14** | A14 | Opening `billpay.htm` while logged out, or clicking Send Payment after the session has expired, makes no debit and sends the user to log in. It must not show only the generic internal error. | Skill: Fraud Risks, "Session replay". Transfer precedent R8/TC-031 and spec test "an expired session sends the user back to log in" |
| **AS15** | A15 | Payee Name with markup, e.g. `<img src=x onerror=alert(1)>`, is shown as literal text on the confirmation **and** in Account Activity. No script runs. SQL meta-characters (`' OR '1'='1`) in any field are stored and shown literally, or rejected, and never change other data. *(Activity is expected to fail: O15.)* | Skill: Validation Risks, "SQL injection in any input field". Transfer precedent TC-020/TC-021. Observed (O10, O15) |
| **AS16** | A16 | Payee Name up to 239 characters is accepted, and the full name appears in the confirmation and history. Longer names are rejected with a validation message and no debit. The 239-character limit comes from storage, not business policy, so it needs PO confirmation. | Observed (O13) |
| **AS17** | A17 | Paying a payee Account # that equals the From account, or another account of the same customer, is allowed. It debits the From account only, because Bill Pay never credits (O12). Flagged as a business-rule question, and no test should assert a block. | Observed (O12). Skill: Business Rule Risks, "Self-transfer" (flag only) |
| **AS18** | A18 | After the confirmation, navigating to Bill Pay again shows an empty form. Refreshing the confirmation page does **not** submit a second payment. | Observed (O8: AJAX POST, so a page reload does a GET). Transfer precedent (same AJAX pattern) |

---

## 5. Open Questions for the PO (must be answered; assumptions only unblock testing)

1. Should Bill Pay enforce an insufficient-funds rule and block payments from overdrawn accounts? (A7 / AS7)
2. What are the minimum, per-payment maximum and daily limits? (A5, A8 / AS5, AS8)
3. Which account types are eligible as From accounts? (A9 / AS9)
4. Should the payee Account # be validated against real accounts, or credited when it is a ParaBank account? (A3, A11, A17)
5. What format rules apply to State, Zip and Phone, and what are the max field lengths? (A2, A16)
6. Should the confirmation include a reference number, date or new balance? (A10)
7. Please add a "Financial Policies / High Risk Modules" section to `.claude/CLAUDE.md`. The agent definition depends on it, and it does not exist today.

---

## 6. Notes for the Test Author (next teammate)

- **Locators:** use `name=` attributes throughout. Phone must use `[name="payee.phoneNumber"]` (O3). Inline errors have stable IDs: `#validationModel-name`, `-address`, `-city`, `-state`, `-zipCode`, `-phoneNumber`, `-account-empty`, `-account-invalid`, `-verifyAccount-empty`, `-verifyAccount-invalid`, `-verifyAccount-mismatch`, `-amount-empty`, `-amount-invalid`. Result panels are `#billpayResult` (`#payeeName`, `#amount`, `#fromAccountId`) and `#billpayError`.
- **Test data:** do **not** use the default From account `13566` (balance -60,584.50) for positive cases. Follow the Transfer precedent (`openFundedPair` in `tests/transfer-funds.spec.ts`) and open or fund a dedicated account per test, so balances are deterministic. ficusroot2 already has 612 accounts, and each new test adds to that list.
- **Precision tests (AS6):** in the Transfer precedent, sub-cent amounts made accounts unreadable until a DB reset. Run them only on a throwaway account.
- **Suggested type mapping:** AS1–AS4 and AS12 → Negative. AS5–AS8 and AS16 → Boundary. AS9, AS13–AS15 → Security. AS10, AS11, AS17 and AS18 → Positive.
- Every test title must start with its `TC-BILLPAY-NNN` ID (Excel join-key rule).
