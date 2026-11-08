# ParaBank Functional Test Scenarios

## Login

### PB-LOGIN-001: Login with valid credentials
**Scenario:** An existing customer logs in successfully.
**Preconditions:** ParaBank is available. The seeded customer `john` / `demo` exists and is logged out.
**Steps:**
1. Open the ParaBank home page.
2. Enter `john` as the username and `demo` as the password.
3. Select **Log In**.
**Expected Result:** The customer is authenticated and redirected to Accounts Overview. The customer's account list is displayed.

### PB-LOGIN-002: Reject invalid credentials
**Scenario:** Login is rejected when the password is incorrect.
**Preconditions:** ParaBank is available. The seeded customer `john` exists and is logged out.
**Steps:**
1. Open the ParaBank home page.
2. Enter `john` as the username and an incorrect password.
3. Select **Log In**.
**Expected Result:** Login is rejected with an invalid-credentials error. The customer is not authenticated and cannot access Accounts Overview.

## Transfer Funds

### PB-TRANSFER-001: Transfer funds between customer accounts
**Scenario:** A customer transfers a valid amount between two of their accounts.
**Preconditions:** ParaBank is available with initialized test data. Log in as `john` / `demo`. The customer has two distinct accounts, and the source account has sufficient funds for a $1.00 transfer.
**Steps:**
1. Open **Transfer Funds**.
2. Select the funded account as the source and the other account as the destination.
3. Enter `1.00` as the amount.
4. Select **Transfer**.
**Expected Result:** A transfer-complete confirmation shows $1.00 and the selected source and destination accounts. The source balance decreases by $1.00, the destination balance increases by $1.00, and the corresponding transactions appear in account activity.

### PB-TRANSFER-002: Require a transfer amount
**Scenario:** A transfer cannot be submitted with an empty amount.
**Preconditions:** ParaBank is available with initialized test data. Log in as `john` / `demo` and open **Transfer Funds**.
**Steps:**
1. Select valid source and destination accounts.
2. Leave the amount blank.
3. Select **Transfer**.
**Expected Result:** The transfer request is rejected and the UI displays an error state. No transfer or transaction is created and neither account balance changes. Do not require a specific inline amount-required message: the active UI submits through the proxy endpoint and displays its generic request error on failure.

### PB-TRANSFER-003: Transfer the smallest currency unit
**Scenario:** A customer transfers the smallest supported positive amount.
**Preconditions:** ParaBank is available with initialized test data. Log in as `john` / `demo`. Select two distinct customer-owned accounts; the source has at least $0.01.
**Steps:**
1. Open **Transfer Funds** and select the source and destination accounts.
2. Enter `0.01` and select **Transfer**.
**Expected Result:** The transfer succeeds. The source decreases by $0.01, the destination increases by $0.01, and one matching debit and credit appear in account activity.

### PB-TRANSFER-004: Transfer the full source balance
**Scenario:** A customer transfers the entire positive source balance.
**Preconditions:** ParaBank is available with initialized test data. Log in as `john` / `demo`. Record a positive source balance and select a distinct customer-owned destination account.
**Steps:**
1. Transfer exactly the recorded source balance to the destination.
**Expected Result:** The transfer succeeds, the source balance is zero, the destination is credited by the same amount, and account activity contains matching debit and credit transactions.

### PB-TRANSFER-005: Reject malformed amount input
**Scenario:** A transfer rejects an empty or non-numeric amount.
**Preconditions:** ParaBank is available with initialized test data. Log in as `john` / `demo` and record both account balances and transaction counts.
**Steps:**
1. Submit separate transfer requests with an empty value, whitespace, alphabetic text, and a currency-formatted value such as `$1.00`.
**Expected Result:** Each request is rejected with an error state. No balances or transaction counts change.

### PB-TRANSFER-006: Enforce currency precision
**Scenario:** A transfer does not silently change an amount with more than two decimal places.
**Preconditions:** ParaBank is available with initialized test data. Log in as `john` / `demo` and record both account balances.
**Steps:**
1. Submit a transfer amount such as `1.001`.
**Expected Result:** Under the two-decimal currency rule, the request is rejected with no balance or transaction changes. If the product specifies rounding instead, verify the documented rounding mode and exact posted amount.

### PB-TRANSFER-007: Reject zero and negative amounts
**Scenario:** A transfer requires a strictly positive amount.
**Preconditions:** ParaBank is available with initialized test data. Log in as `john` / `demo` and record balances and transaction counts.
**Steps:**
1. Submit separate requests with `0.00`, `-0.01`, and `-100.00`.
**Expected Result:** Each request is rejected. No balances or transaction counts change.

### PB-TRANSFER-008: Enforce the overdraft limit
**Scenario:** A transfer cannot exceed the source account's permitted funds.
**Preconditions:** ParaBank is available with initialized test data. Log in as `john` / `demo`; record the source balance and configured overdraft policy.
**Steps:**
1. Attempt to transfer more than the available source balance.
**Expected Result:** If overdrafts are not allowed, the request is rejected and the source remains non-negative. If an overdraft limit is configured, the request is rejected when it exceeds that limit; no partial transfer is recorded.

### PB-TRANSFER-009: Reject a same-account transfer
**Scenario:** A customer cannot transfer funds from an account to itself.
**Preconditions:** ParaBank is available with initialized test data. Log in as `john` / `demo` and record the selected account's balance and transaction count.
**Steps:**
1. Select the same account as both source and destination and submit a positive amount.
**Expected Result:** The request is rejected without changing the balance or creating debit/credit transactions. Confirm this behavior against the product policy if same-account transfers are intended to be a no-op.

### PB-TRANSFER-010: Reject invalid account IDs atomically
**Scenario:** Invalid source or destination IDs cannot cause a partial transfer.
**Preconditions:** ParaBank is available with initialized test data. Log in as `john` / `demo` and record balances and transaction counts for the valid source and destination accounts.
**Steps:**
1. Submit requests with a nonexistent source ID, a nonexistent destination ID, and non-positive account IDs.
**Expected Result:** Each request is rejected. No account balance or transaction count changes, including when the destination ID is invalid.

### PB-TRANSFER-011: Prevent concurrent overspending
**Scenario:** Concurrent transfers cannot spend the same available balance twice.
**Preconditions:** ParaBank is available with initialized test data. Log in as `john` / `demo`; use a source balance where two concurrent transfers would exceed the available amount in total.
**Steps:**
1. Submit both transfers concurrently from separate clients.
**Expected Result:** The configured funds policy is maintained: at most the permitted total is transferred, balances and transaction records remain consistent, and no unintended overdraft or partial transfer occurs.

### PB-TRANSFER-012: Require authentication for transfer requests
**Scenario:** An unauthenticated client cannot transfer funds.
**Preconditions:** ParaBank is available. The request has no authenticated session and no valid credentials.
**Steps:**
1. POST a transfer directly to the transfer API endpoint.
**Expected Result:** The request is rejected with an authentication failure. No balances or transaction records change.

### PB-TRANSFER-013: Reject unsupported or invalid authorization
**Scenario:** Invalid credentials and unsupported authorization schemes cannot authorize a transfer.
**Preconditions:** ParaBank is available with no authenticated session.
**Steps:**
1. Submit a transfer using invalid Basic credentials.
2. Submit another transfer using an unsupported header such as `Authorization: Bearer invalid`.
**Expected Result:** Both requests are rejected with an authentication failure and cause no account or transaction changes.

### PB-TRANSFER-014: Prevent cross-customer account access
**Scenario:** A customer cannot use another customer's account as a transfer source or destination.
**Preconditions:** ParaBank is available. Authenticate as customer A; record the balances of A's and customer B's accounts.
**Steps:**
1. Tamper with the request to use B's account as the source and an A-owned account as the destination.
2. Submit another request with an A-owned source and B's account as the destination.
**Expected Result:** Both requests are rejected. Neither customer's balances or transaction records change.

### PB-TRANSFER-015: Prevent cross-site transfer requests
**Scenario:** A third-party origin cannot initiate a transfer using an authenticated browser session.
**Preconditions:** ParaBank is available and customer A has an authenticated browser session.
**Steps:**
1. Attempt a cross-origin form POST to the transfer endpoint using that session.
**Expected Result:** The request is blocked by CSRF or origin protection. No balances or transaction records change.

## Bill Payment

### PB-BILLPAY-001: Submit a bill payment
**Scenario:** A customer pays a payee from an account with sufficient funds.
**Preconditions:** ParaBank is available with initialized test data. Log in as `john` / `demo`. The customer has a source account with sufficient funds. Use valid payee details and matching payee account and verification numbers.
**Steps:**
1. Open **Bill Pay**.
2. Enter the payee name, address, city, state, ZIP code, and phone number.
3. Enter the payee account number and the same value in **Verify Account**.
4. Enter `1.00` as the amount and select the funded source account.
5. Select **Send Payment**.
**Expected Result:** The bill-payment confirmation identifies the payee, $1.00 amount, and source account. The source account balance decreases by $1.00 and its activity includes the bill-payment transaction.

### PB-BILLPAY-002: Reject mismatched payee account numbers
**Scenario:** A bill payment is not submitted when account verification does not match.
**Preconditions:** ParaBank is available with initialized test data. Log in as `john` / `demo` and open **Bill Pay**.
**Steps:**
1. Enter otherwise valid payee details and a valid source account.
2. Enter one payee account number and a different value in **Verify Account**.
3. Enter `1.00` as the amount.
4. Select **Send Payment**.
**Expected Result:** The form remains displayed with an account-number mismatch message. No payment is created and the source account balance does not change.

## Loan Request

### PB-LOAN-001: Process an approved loan request
**Scenario:** A loan request is approved by the configured loan provider.
**Preconditions:** ParaBank is available with initialized test data. Log in as `john` / `demo`. Select a customer-owned non-loan account with sufficient funds for the down payment. Configure or select a loan provider and request values that produce an approval.
**Steps:**
1. Open **Request Loan**.
2. Enter the approved test loan amount and down payment.
3. Select the eligible source account.
4. Select **Apply Now**.
**Expected Result:** The confirmation reports an approved request. A loan account is created for the requested amount, and the selected source account is debited by the down payment.

### PB-LOAN-002: Process a denied loan request
**Scenario:** A loan request is denied by the configured loan provider.
**Preconditions:** ParaBank is available with initialized test data. Log in as `john` / `demo`. Configure or select a loan provider and request values that produce a denial, such as a request exceeding the provider's eligibility threshold. Record the source account balance before submission.
**Steps:**
1. Open **Request Loan**.
2. Enter the denial test loan amount and down payment.
3. Select a customer-owned non-loan source account.
4. Select **Apply Now**.
**Expected Result:** The confirmation reports a denied request and displays the provider's denial reason when supplied. No loan account is created and the source account balance is unchanged.