// spec: specs/bill-pay-test-plan.md
// manual design: test-cases/bill-pay-cases.json (TC-BILLPAY-001..049; 048 and 049 are manual)
//
// Cases marked "Expect defect" (027, 028, 033, 034, 039, 040, 044) assert the REQUIRED
// behaviour from user-stories/bill-pay-clarified.md and are expected to fail until the product is fixed.
import { test, expect, type Page } from '@playwright/test';
import data from '../test-data/bill-pay.json';
import { LoginPage, type Credentials } from '../pages/login.page';
import { AccountsPage } from '../pages/accounts.page';
import { TransferFundsPage } from '../pages/transfer-funds.page';
import { BillPayPage, type BillPayment, type ValidationKey } from '../pages/bill-pay.page';

const msg = data.messages;
const opening = data.setup.newAccountOpeningBalance;
const cases = data.cases as Record<string, Record<string, any>>;
const payeeKeys = Object.keys(data.payee) as (keyof typeof data.payee)[];

/** PARABANK_USER / PARABANK_PASS override the JSON credentials (e.g. in CI secrets). */
const credentials: Credentials = {
  username: process.env.PARABANK_USER ?? data.user.username,
  password: process.env.PARABANK_PASS ?? data.user.password,
};

/** Activity pages show dates as MM-DD-YYYY in the server's local time zone. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${d.getFullYear()}`;
}

/** Default payee + the case's overrides from test-data/bill-pay.json. */
function paymentFor(id: string, fromAccount?: string, extra: Partial<BillPayment> = {}): BillPayment {
  const c = cases[id];
  const p: BillPayment = { ...data.payee, amount: c.amount ?? '', fromAccount };
  for (const key of payeeKeys) if (key in c) p[key] = c[key];
  return { ...p, ...extra };
}

function confirmation(payeeName: string, amount: string, from: string): string {
  return `Bill Payment to ${payeeName} in the amount of ${amount} from account ${from} was successful.`;
}

function openingRow() {
  return { date: today(), description: data.setup.openingDepositDescription, debit: '', credit: opening };
}

function uniqueUsername(): string {
  // Customer.username is VARCHAR(20).
  return `${data.throwawayUserPrefix}${Date.now().toString(36)}`;
}

let login: LoginPage;
let accounts: AccountsPage;
let bill: BillPayPage;

/** Opens a fresh CHECKING account from `funding` (18561 by default); it starts at exactly `opening`. */
async function openFreshAccount(funding: string = data.accounts.funding): Promise<string> {
  return test.step(`Open a fresh account funded from ${funding}`, async () => {
    const id = await accounts.openNewAccount('CHECKING', funding);
    await accounts.expectBalance(id, opening);
    return id;
  });
}

async function expectPaymentComplete(page: Page, payeeName: string, amount: string, from: string) {
  await expect(bill.form).toBeHidden();
  await expect(bill.resultHeading).toHaveText(msg.paymentComplete);
  await expect(bill.resultMessage).toHaveText(confirmation(payeeName, amount, from));
  await expect(bill.resultPanel).toContainText(msg.seeAccountActivity);
  await expect(bill.resultPayeeName).toHaveText(payeeName);
  await expect(bill.resultAmount).toHaveText(amount);
  await expect(bill.resultFromAccount).toHaveText(from);
  await expect(page).toHaveTitle(msg.completeTitle);
}

/** Rejected payment: no confirmation (soft, so the money check still runs), balance and history unchanged. */
async function expectNoMoneyMoved(from: string, balance = opening, rows = 1) {
  await expect.soft(bill.resultPanel, 'payment must not report success').toBeHidden();
  await accounts.expectBalance(from, balance);
  await expect(accounts.transactionRows, `account ${from} must have no new transaction`).toHaveCount(rows);
}

/** Client-side rejection: the listed inline messages are shown and no request was sent. */
async function expectClientRejection(requests: string[], errors: [ValidationKey, string][]) {
  for (const [key, text] of errors) {
    await expect(bill.validationError(key)).toBeVisible();
    await expect(bill.validationError(key)).toHaveText(text);
  }
  await expect(bill.form).toBeVisible();
  expect(requests, 'no bill-pay request may be sent').toHaveLength(0);
}

/** Rejected by validation or by the server – either way some error is displayed and no confirmation. */
async function expectSomeRejection() {
  await expect(bill.visibleValidationErrors.or(bill.errorPanel).filter({ visible: true }).first()).toBeVisible();
  if (await bill.errorPanel.isVisible()) {
    await expect(bill.errorHeading).toHaveText(msg.errorHeading);
    await expect(bill.errorMessage).toHaveText(msg.internalError);
  }
}

async function readBalance(accountId: string): Promise<string> {
  await accounts.openActivity(accountId);
  await expect(accounts.activityBalance).toHaveText(/\$/);
  return (await accounts.activityBalance.textContent())!.trim();
}

test.beforeEach(async ({ page }) => {
  login = new LoginPage(page);
  accounts = new AccountsPage(page);
  bill = new BillPayPage(page);
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach('screenshot-on-failure', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  }
});

test.describe('Bill Pay', () => {
  test.beforeEach(async () => {
    await test.step(`Log in as ${credentials.username}`, () =>
      login.ensureLoggedIn(credentials, data.registrationProfile));
  });

  test.describe('Successful payments', () => {
    test('TC-BILLPAY-001 | Happy path: pay a bill with all valid fields shows exact confirmation', async ({ page }) => {
      const c = cases['TC-BILLPAY-001'];
      const from = await openFreshAccount();

      await bill.goto(from);
      await bill.pay(paymentFor('TC-BILLPAY-001', from));

      await expectPaymentComplete(page, data.payee.payeeName, c.expectedAmount, from);
      await expect(bill.visibleValidationErrors).toHaveCount(0);
    });

    test('TC-BILLPAY-002 | Successful payment debits From account by exact amount and logs one Debit transaction', async () => {
      const c = cases['TC-BILLPAY-002'];
      const from = await openFreshAccount();

      await bill.goto(from);
      await bill.pay(paymentFor('TC-BILLPAY-002', from));
      await expect(bill.resultHeading).toHaveText(msg.paymentComplete);

      await accounts.expectBalance(from, c.expectedBalance);
      await expect(accounts.transactionRows).toHaveCount(2);
      expect(await accounts.transactions()).toEqual([
        openingRow(),
        { date: today(), description: msg.descriptionPrefix + data.payee.payeeName, debit: c.expectedAmount, credit: '' },
      ]);
    });

    test('TC-BILLPAY-003 | Whole-number amount is formatted to 2 decimals on confirmation', async ({ page }) => {
      const c = cases['TC-BILLPAY-003'];
      const from = await openFreshAccount();

      await bill.goto(from);
      await bill.pay(paymentFor('TC-BILLPAY-003', from));

      await expectPaymentComplete(page, data.payee.payeeName, c.expectedAmount, from);
      await accounts.expectBalance(from, c.expectedBalance);
    });

    test('TC-BILLPAY-004 | Paying another own account debits From only and does not credit the payee account', async ({ page }) => {
      const c = cases['TC-BILLPAY-004'];
      const from = await openFreshAccount();
      const accountB = await openFreshAccount();

      await bill.goto(from);
      await bill.pay(paymentFor('TC-BILLPAY-004', from, { account: accountB, verifyAccount: accountB }));

      await expectPaymentComplete(page, data.payee.payeeName, c.expectedAmount, from);
      await accounts.expectBalance(from, c.expectedBalance);
      await accounts.expectBalance(accountB, opening);
      await expect(accounts.transactionRows, 'account B gets no new transaction').toHaveCount(1);
    });

    test('TC-BILLPAY-005 | Payee Account # equal to the From account is allowed and debits once', async ({ page }) => {
      const c = cases['TC-BILLPAY-005'];
      const from = await openFreshAccount();

      await bill.goto(from);
      await bill.pay(paymentFor('TC-BILLPAY-005', from, { account: from, verifyAccount: from }));

      await expectPaymentComplete(page, data.payee.payeeName, c.expectedAmount, from);
      await accounts.expectBalance(from, c.expectedBalance);
      await expect(accounts.transactionRows).toHaveCount(2);
      expect(await accounts.transactions()).toEqual([
        openingRow(),
        { date: today(), description: msg.descriptionPrefix + data.payee.payeeName, debit: c.expectedAmount, credit: '' },
      ]);
    });

    test('TC-BILLPAY-006 | From dropdown lists only own accounts with first preselected; non-default selection is used', async ({ page }) => {
      const c = cases['TC-BILLPAY-006'];
      const from = await openFreshAccount();

      await bill.goto(from);
      const options = await bill.optionValues();
      await expect(bill.fromAccount, 'first option preselected').toHaveValue(options[0]);
      expect(options[0], 'the fresh account must be a non-default choice').not.toBe(from);

      const response = await page.request.get(`services_proxy/bank/customers/${data.user.customerId}/accounts`, {
        headers: { Accept: 'application/json' },
      });
      expect(response.status()).toBe(200);
      const ownIds = ((await response.json()) as { id: number }[]).map((a) => String(a.id));
      expect([...options].sort()).toEqual([...ownIds].sort());

      const defaultAccount = options[0];
      const defaultBalanceBefore = await readBalance(defaultAccount);

      await bill.goto(from);
      await bill.pay(paymentFor('TC-BILLPAY-006', from));

      await expectPaymentComplete(page, data.payee.payeeName, c.expectedAmount, from);
      await accounts.expectBalance(from, c.expectedBalance);
      await accounts.expectBalance(defaultAccount, defaultBalanceBefore);
    });

    test('TC-BILLPAY-007 | Free-text State, Zip and formatted Phone are accepted (no format validation)', async ({ page }) => {
      const c = cases['TC-BILLPAY-007'];
      const from = await openFreshAccount();

      await bill.goto(from);
      await bill.pay(paymentFor('TC-BILLPAY-007', from));

      for (const key of ['state', 'zipCode', 'phoneNumber'] as const) {
        await expect(bill.validationError(key)).toBeHidden();
      }
      await expectPaymentComplete(page, data.payee.payeeName, c.expectedAmount, from);
    });

    test('TC-BILLPAY-014 | Payee Account # at Integer max 2147483647 is accepted', async ({ page }) => {
      const c = cases['TC-BILLPAY-014'];
      const from = await openFreshAccount();

      await bill.goto(from);
      await bill.pay(paymentFor('TC-BILLPAY-014', from));

      await expectPaymentComplete(page, data.payee.payeeName, c.expectedAmount, from);
      await accounts.expectBalance(from, c.expectedBalance);
    });

    test('TC-BILLPAY-029 | Minimum valid Amount 0.01 is accepted', async ({ page }) => {
      const c = cases['TC-BILLPAY-029'];
      const from = await openFreshAccount();

      await bill.goto(from);
      await bill.pay(paymentFor('TC-BILLPAY-029', from));

      await expectPaymentComplete(page, data.payee.payeeName, c.expectedAmount, from);
      await accounts.expectBalance(from, c.expectedBalance);
      await expect(accounts.transactionRows).toHaveCount(2);
      expect((await accounts.transactions())[1]).toEqual({
        date: today(), description: msg.descriptionPrefix + data.payee.payeeName, debit: c.expectedAmount, credit: '',
      });
    });

    test('TC-BILLPAY-032 | Paying the exact available balance is accepted and leaves $0.00', async ({ page }) => {
      const c = cases['TC-BILLPAY-032'];
      const from = await openFreshAccount();

      await bill.goto(from);
      await bill.pay(paymentFor('TC-BILLPAY-032', from));

      await expectPaymentComplete(page, data.payee.payeeName, c.expectedAmount, from);
      await accounts.expectBalance(from, c.expectedBalance);
    });

    test('TC-BILLPAY-036 | Payee Name of 239 characters is accepted and shown in full', async ({ page }) => {
      const c = cases['TC-BILLPAY-036'];
      const name = c.nameChar.repeat(c.nameLength);
      const from = await openFreshAccount();

      await bill.goto(from);
      await bill.pay(paymentFor('TC-BILLPAY-036', from, { payeeName: name }));

      await expect(bill.resultPayeeName).toHaveText(name);
      await expect(bill.resultHeading).toHaveText(msg.paymentComplete);
      await accounts.expectBalance(from, c.expectedBalance);
      await expect(accounts.transactionRows).toHaveCount(2);
      const [, payment] = await accounts.transactions();
      expect(payment.description).toBe(msg.descriptionPrefix + name);
      expect(payment.description).toHaveLength(255);
    });

    test('TC-BILLPAY-046 | Returning to Bill Pay after confirmation shows an empty form', async () => {
      const from = await openFreshAccount();

      await bill.goto(from);
      await bill.pay(paymentFor('TC-BILLPAY-046', from));
      await expect(bill.resultHeading).toHaveText(msg.paymentComplete);

      await bill.billPayMenuLink.click();

      await expect(bill.heading).toHaveText(msg.formHeading);
      await expect(bill.subHeading).toHaveText(msg.formSubHeading);
      for (const input of bill.textInputs()) await expect(input).toHaveValue('');
      const options = await bill.optionValues();
      await expect(bill.fromAccount).toHaveValue(options[0]);
      await expect(bill.resultPanel).toBeHidden();
      await expect(bill.errorPanel).toBeHidden();
    });

    test('TC-BILLPAY-047 | Refreshing the confirmation page does not submit a second payment', async ({ page }) => {
      const c = cases['TC-BILLPAY-047'];
      const from = await openFreshAccount();

      await bill.goto(from);
      const requests = bill.trackPaymentRequests();
      await bill.pay(paymentFor('TC-BILLPAY-047', from));
      await expect(bill.resultHeading).toHaveText(msg.paymentComplete);

      await page.reload();

      await expect(bill.heading).toBeVisible();
      for (const input of bill.textInputs()) await expect(input).toHaveValue('');
      await expect(bill.resultPanel).toBeHidden();
      expect(requests, 'reload must not resend the payment').toHaveLength(1);
      await accounts.expectBalance(from, c.expectedBalance);
      await expect(accounts.transactionRows.filter({ hasText: msg.descriptionPrefix + data.payee.payeeName })).toHaveCount(1);
    });
  });

  test.describe('Client-side validation', () => {
    test('TC-BILLPAY-008 | Empty form submission shows all required-field messages at once and sends no request', async () => {
      await bill.goto();
      const requests = bill.trackPaymentRequests();

      await bill.sendPaymentButton.click();
      await bill.waitForOutcome();

      await expectClientRejection(requests, [
        ['name', msg.nameRequired],
        ['address', msg.addressRequired],
        ['city', msg.cityRequired],
        ['state', msg.stateRequired],
        ['zipCode', msg.zipRequired],
        ['phoneNumber', msg.phoneRequired],
        ['account-empty', msg.accountRequired],
        ['verifyAccount-empty', msg.accountRequired],
        ['amount-empty', msg.amountEmpty],
      ]);
      await expect(bill.visibleValidationErrors).toHaveCount(9);
      await expect(bill.resultPanel).toBeHidden();
    });

    test('TC-BILLPAY-009 | Whitespace-only text fields are treated as empty', async () => {
      const ws = cases['TC-BILLPAY-009'].whitespace;
      const from = await openFreshAccount();

      await bill.goto(from);
      const requests = bill.trackPaymentRequests();
      await bill.pay(paymentFor('TC-BILLPAY-009', from, {
        payeeName: ws, address: ws, city: ws, state: ws, zipCode: ws, phone: ws,
      }));

      await expectClientRejection(requests, [
        ['name', msg.nameRequired],
        ['address', msg.addressRequired],
        ['city', msg.cityRequired],
        ['state', msg.stateRequired],
        ['zipCode', msg.zipRequired],
        ['phoneNumber', msg.phoneRequired],
      ]);
      await expectNoMoneyMoved(from);
    });

    test('TC-BILLPAY-010 | Each mandatory field left blank individually shows only its own message (data-driven)', async () => {
      const from = await openFreshAccount();
      const fields: [keyof BillPayment, ValidationKey, string][] = [
        ['payeeName', 'name', msg.nameRequired],
        ['address', 'address', msg.addressRequired],
        ['city', 'city', msg.cityRequired],
        ['state', 'state', msg.stateRequired],
        ['zipCode', 'zipCode', msg.zipRequired],
        ['phone', 'phoneNumber', msg.phoneRequired],
        ['account', 'account-empty', msg.accountRequired],
        ['verifyAccount', 'verifyAccount-empty', msg.accountRequired],
        ['amount', 'amount-empty', msg.amountEmpty],
      ];

      for (const [field, key, text] of fields) {
        await test.step(`blank ${field}`, async () => {
          await bill.goto(from);
          const requests = bill.trackPaymentRequests();
          await bill.pay(paymentFor('TC-BILLPAY-010', from, { [field]: '' }));

          await expect.soft(bill.validationError(key), `${field}: its own message`).toHaveText(text);
          await expect.soft(bill.validationError(key)).toBeVisible();
          await expect.soft(bill.visibleValidationErrors, `${field}: no other message`).toHaveCount(1);
          expect.soft(requests, `${field}: no request`).toHaveLength(0);
        });
      }
      await expectNoMoneyMoved(from);
    });

    test('TC-BILLPAY-011 | Several invalid fields are reported together inline', async () => {
      const c = cases['TC-BILLPAY-011'];
      const from = await openFreshAccount();

      await bill.goto(from);
      const requests = bill.trackPaymentRequests();
      await bill.pay(paymentFor('TC-BILLPAY-011', from));

      await expectClientRejection(requests, [
        ['name', msg.nameRequired],
        ['verifyAccount-mismatch', msg.accountMismatch],
        ['amount-invalid', msg.amountInvalid],
      ]);
      await expect(bill.payeeName).toHaveValue(c.payeeName);
      await expect(bill.address).toHaveValue(data.payee.address);
      await expect(bill.account).toHaveValue(data.payee.account);
      await expect(bill.verifyAccount).toHaveValue(c.verifyAccount);
      await expect(bill.amount).toHaveValue(c.amount);
    });

    test('TC-BILLPAY-012 | Non-numeric payee Account # is rejected', async () => {
      const from = await openFreshAccount();

      await bill.goto(from);
      const requests = bill.trackPaymentRequests();
      await bill.pay(paymentFor('TC-BILLPAY-012', from));

      await expectClientRejection(requests, [
        ['account-invalid', msg.invalidNumber],
        ['verifyAccount-invalid', msg.invalidNumber],
      ]);
      await expectNoMoneyMoved(from);
    });

    test('TC-BILLPAY-016 | Verify Account # mismatch is rejected client-side', async () => {
      const from = await openFreshAccount();

      await bill.goto(from);
      const requests = bill.trackPaymentRequests();
      await bill.pay(paymentFor('TC-BILLPAY-016', from));

      await expectClientRejection(requests, [['verifyAccount-mismatch', msg.accountMismatch]]);
      await expectNoMoneyMoved(from);
    });

    test('TC-BILLPAY-017 | Empty Verify Account # shows required message, not mismatch', async () => {
      const from = await openFreshAccount();

      await bill.goto(from);
      const requests = bill.trackPaymentRequests();
      await bill.pay(paymentFor('TC-BILLPAY-017', from));

      await expectClientRejection(requests, [['verifyAccount-empty', msg.accountRequired]]);
      await expect(bill.validationError('verifyAccount-mismatch')).toBeHidden();
    });

    test('TC-BILLPAY-018 | Verify Account # with leading zero (012345 vs 12345) is a mismatch', async () => {
      const from = await openFreshAccount();

      await bill.goto(from);
      const requests = bill.trackPaymentRequests();
      await bill.pay(paymentFor('TC-BILLPAY-018', from));

      await expectClientRejection(requests, [['verifyAccount-mismatch', msg.accountMismatch]]);
      await expectNoMoneyMoved(from);
    });

    test('TC-BILLPAY-019 | Verify Account # with trailing space is a mismatch', async () => {
      const from = await openFreshAccount();

      await bill.goto(from);
      const requests = bill.trackPaymentRequests();
      await bill.pay(paymentFor('TC-BILLPAY-019', from));

      await expectClientRejection(requests, [['verifyAccount-mismatch', msg.accountMismatch]]);
      await expectNoMoneyMoved(from);
    });

    test('TC-BILLPAY-020 | Non-numeric Verify Account # shows invalid-number message', async () => {
      const from = await openFreshAccount();

      await bill.goto(from);
      const requests = bill.trackPaymentRequests();
      await bill.pay(paymentFor('TC-BILLPAY-020', from));

      await expectClientRejection(requests, [['verifyAccount-invalid', msg.invalidNumber]]);
      await expectNoMoneyMoved(from);
    });

    test('TC-BILLPAY-021 | Empty Amount is rejected', async () => {
      const from = await openFreshAccount();

      await bill.goto(from);
      const requests = bill.trackPaymentRequests();
      await bill.pay(paymentFor('TC-BILLPAY-021', from));

      await expectClientRejection(requests, [['amount-empty', msg.amountEmpty]]);
      await expectNoMoneyMoved(from);
    });

    test('TC-BILLPAY-022 | Non-numeric Amount (abc) is rejected', async () => {
      const from = await openFreshAccount();

      await bill.goto(from);
      const requests = bill.trackPaymentRequests();
      await bill.pay(paymentFor('TC-BILLPAY-022', from));

      await expectClientRejection(requests, [['amount-invalid', msg.amountInvalid]]);
      await expectNoMoneyMoved(from);
    });

    test('TC-BILLPAY-023 | Amount with currency symbol ($10) is rejected', async () => {
      const from = await openFreshAccount();

      await bill.goto(from);
      const requests = bill.trackPaymentRequests();
      await bill.pay(paymentFor('TC-BILLPAY-023', from));

      await expectClientRejection(requests, [['amount-invalid', msg.amountInvalid]]);
      await expectNoMoneyMoved(from);
    });
  });

  test.describe('Rejected input reaching the server', () => {
    for (const [id, title] of [
      ['TC-BILLPAY-013', 'Mixed alphanumeric payee Account # (12abc) is rejected without debit'],
      ['TC-BILLPAY-015', 'Payee Account # above Integer max (2147483648) is rejected without debit'],
      ['TC-BILLPAY-024', 'Amount with thousands separator (1,000) is rejected with no money moved'],
      ['TC-BILLPAY-025', 'Amount with trailing text (10abc) is rejected with no money moved'],
    ] as const) {
      test(`${id} | ${title}`, async () => {
        const from = await openFreshAccount();

        await bill.goto(from);
        await bill.pay(paymentFor(id, from));

        await expectSomeRejection();
        await expectNoMoneyMoved(from);
      });
    }

    test('TC-BILLPAY-026 | Amount in scientific notation (1e3) is rejected', async () => {
      const from = await openFreshAccount();

      await bill.goto(from);
      await bill.pay(paymentFor('TC-BILLPAY-026', from));

      await expect.soft(bill.validationError('amount-invalid')).toBeVisible();
      await expect.soft(bill.validationError('amount-invalid')).toHaveText(msg.amountInvalid);
      await expectNoMoneyMoved(from);
    });

    test('TC-BILLPAY-037 | Payee Name of 240 characters is rejected without debit', async () => {
      const c = cases['TC-BILLPAY-037'];
      const from = await openFreshAccount();

      await bill.goto(from);
      await bill.pay(paymentFor('TC-BILLPAY-037', from, { payeeName: c.nameChar.repeat(c.nameLength) }));

      // Required: a validation message on the form (form stays displayed), not a server failure.
      await expect.soft(bill.form, 'rejected by validation, form stays displayed').toBeVisible();
      await expect.soft(bill.visibleValidationErrors.first()).toBeVisible();
      await expectNoMoneyMoved(from);
    });

    test('TC-BILLPAY-038 | Server-side failure shows generic error panel and moves no money', async ({ page }) => {
      const c = cases['TC-BILLPAY-038'];
      const from = await openFreshAccount();

      await bill.goto(from);
      await page.route(BillPayPage.paymentRequestPattern, (route) =>
        route.fulfill({ status: c.mockStatus, body: 'mocked server failure' }));
      await bill.pay(paymentFor('TC-BILLPAY-038', from));

      await expect(bill.form).toBeHidden();
      await expect(bill.errorHeading).toHaveText(msg.errorHeading);
      await expect(bill.errorMessage).toHaveText(msg.internalError);
      await expect(bill.resultPanel).toBeHidden();

      await page.unroute(BillPayPage.paymentRequestPattern);
      await expectNoMoneyMoved(from);
    });
  });

  test.describe('Financial boundaries (fresh throwaway account each)', () => {
    for (const [id, title] of [
      ['TC-BILLPAY-027', 'Amount 0 is rejected'],
      ['TC-BILLPAY-028', 'Negative Amount (-1) is rejected and does not credit the account'],
    ] as const) {
      test(`${id} | ${title}`, async () => {
        // Expect defect (AS5): client and server accept the amount.
        const from = await openFreshAccount();

        await bill.goto(from);
        await bill.pay(paymentFor(id, from));

        await expect.soft(bill.visibleAmountErrors.first(), 'inline validation message on Amount').toBeVisible();
        await expectNoMoneyMoved(from);
      });
    }

    test('TC-BILLPAY-033 | Paying balance + 0.01 is rejected for insufficient funds', async () => {
      // Expect defect (AS7): no balance check on the server.
      const from = await openFreshAccount();

      await bill.goto(from);
      await bill.pay(paymentFor('TC-BILLPAY-033', from));

      await expectNoMoneyMoved(from);
    });

    test('TC-BILLPAY-034 | Payment from an account with balance <= 0 is rejected', async ({ page }) => {
      // Expect defect (AS7): no balance check on the server.
      const c = cases['TC-BILLPAY-034'];
      const from = await openFreshAccount();
      const sink = await openFreshAccount();
      const transfer = new TransferFundsPage(page);

      await test.step(`Bring ${from} to ${c.zeroBalance}`, async () => {
        await transfer.goto(from);
        await transfer.transfer(c.drainAmount, from, sink);
        await expect(transfer.resultPanel).toBeVisible();
        await accounts.expectBalance(from, c.zeroBalance);
        await expect(accounts.transactionRows).toHaveCount(2);
      });

      await bill.goto(from);
      await bill.pay(paymentFor('TC-BILLPAY-034', from));

      await expectNoMoneyMoved(from, c.zeroBalance, 2);
    });

    test('TC-BILLPAY-035 | Very large Amount 999999999 does not succeed', async () => {
      const from = await openFreshAccount();

      await bill.goto(from);
      await bill.pay(paymentFor('TC-BILLPAY-035', from));

      await expectNoMoneyMoved(from);
    });
  });

  test.describe('Security and session', () => {
    test('TC-BILLPAY-040 | Rapid double-click on Send Payment produces exactly one debit', async ({ page }) => {
      // Expect defect (AS13): the button is not disabled; each click posts a payment.
      const c = cases['TC-BILLPAY-040'];
      const from = await openFreshAccount();

      await bill.goto(from);
      const requests = bill.trackPaymentRequests();
      let finished = 0;
      page.on('requestfinished', (r) => { if (BillPayPage.paymentRequestPattern.test(r.url())) finished++; });
      page.on('requestfailed', (r) => { if (BillPayPage.paymentRequestPattern.test(r.url())) finished++; });

      await bill.fill(paymentFor('TC-BILLPAY-040', from));
      await bill.sendPaymentButton.dblclick();
      await bill.waitForOutcome();
      // Let every request that was sent complete before reading the balance.
      await expect.poll(() => finished).toBe(requests.length);

      await accounts.expectBalance(from, c.expectedBalance);
      await expect(accounts.transactionRows.filter({ hasText: msg.descriptionPrefix + data.payee.payeeName })).toHaveCount(1);
    });

    test('TC-BILLPAY-042 | Send Payment after session expiry makes no debit and sends user to log in', async ({ page }) => {
      const from = await openFreshAccount();

      await bill.goto(from);
      await bill.fill(paymentFor('TC-BILLPAY-042', from));
      await page.context().clearCookies();
      await bill.sendPaymentButton.click();
      await bill.waitForOutcome();

      await expect.soft(bill.resultPanel).toBeHidden();
      await expect.soft(login.logInButton, 'user is directed to log in').toBeVisible();

      expect(await login.login(credentials), 're-login').toBe(true);
      await expectNoMoneyMoved(from);
    });

    test('TC-BILLPAY-043 | Script markup in Payee Name is shown literally on confirmation', async ({ page }) => {
      const c = cases['TC-BILLPAY-043'];
      const dialogs: string[] = [];
      page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });
      const from = await openFreshAccount();

      await bill.goto(from);
      await bill.pay(paymentFor('TC-BILLPAY-043', from));

      await expect(bill.resultPayeeName).toHaveText(c.payeeName);
      await expect(bill.resultMessage).toHaveText(confirmation(c.payeeName, c.expectedAmount, from));
      await expect(bill.resultPanel.locator('img')).toHaveCount(0);
      expect(dialogs, 'no alert may fire').toEqual([]);
    });

    test('TC-BILLPAY-044 | Script markup in Payee Name is not executed in Account Activity (stored XSS)', async ({ page }) => {
      // Expect defect (AS15 / O15): activity.jsp concatenates the description into HTML.
      const c = cases['TC-BILLPAY-044'];
      const dialogs: string[] = [];
      page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });
      const from = await openFreshAccount();

      await bill.goto(from);
      await bill.pay(paymentFor('TC-BILLPAY-044', from));
      await expect(bill.resultHeading).toHaveText(msg.paymentComplete);

      await accounts.openActivity(from);
      await expect(accounts.transactionRows).toHaveCount(2);
      await expect.soft(accounts.transactionRows.nth(1).locator('td').nth(1)).toHaveText(msg.descriptionPrefix + c.payeeName);
      await expect.soft(page.locator('#transactionTable img'), 'no injected img element').toHaveCount(0);
      expect.soft(dialogs, 'no alert may fire').toEqual([]);
    });

    test('TC-BILLPAY-045 | SQL meta-characters in payee fields are handled literally', async ({ page }) => {
      const c = cases['TC-BILLPAY-045'];
      const from = await openFreshAccount();
      const other = await openFreshAccount();

      await bill.goto(from);
      await bill.pay(paymentFor('TC-BILLPAY-045', from));

      await expectPaymentComplete(page, c.payeeName, c.expectedAmount, from);
      await accounts.expectBalance(from, c.expectedBalance);
      await expect(accounts.transactionRows).toHaveCount(2);
      expect((await accounts.transactions())[1].description).toBe(msg.descriptionPrefix + c.payeeName);
      await accounts.expectBalance(other, opening);
      expect(await accounts.accountIds(), 'Accounts Overview still loads').toEqual(expect.arrayContaining([from, other]));
    });
  });
});

test.describe('Bill Pay – logged out', () => {
  test('TC-BILLPAY-041 | Opening billpay.htm while logged out redirects to login', async ({ page }) => {
    await page.goto('billpay.htm');

    await expect(bill.form).toHaveCount(0);
    await expect(bill.sendPaymentButton).toHaveCount(0);
    await expect(login.logInButton).toBeVisible();
  });
});

// Sub-cent balances make every account read of the owning customer fail (Transfer R1),
// and the cross-customer case needs a second customer: both run under a throwaway user
// registered inside the test, never under ficusroot2's shared accounts.
test.describe('Bill Pay – throwaway customers', () => {
  for (const id of ['TC-BILLPAY-030', 'TC-BILLPAY-031'] as const) {
    const titles = {
      'TC-BILLPAY-030': 'Sub-cent Amount 0.001 is rejected or rounded without corrupting the balance',
      'TC-BILLPAY-031': 'Three-decimal Amount 10.005 is rejected or rounded consistently',
    };
    test(`${id} | ${titles[id]}`, async () => {
      const c = cases[id];
      const throwaway = { username: uniqueUsername(), password: data.user.password };
      expect(await login.register(throwaway, data.registrationProfile)).toBe(true);
      const [first] = await accounts.accountIds();
      const from = await openFreshAccount(first);

      await bill.goto(from);
      await bill.pay(paymentFor(id, from));

      let expectedBalance = opening;
      if (await bill.resultPanel.isVisible()) {
        const shown = (await bill.resultAmount.textContent())!.trim();
        expect(c.acceptedAmounts, `confirmation amount ${shown} must be rounded to 2 dp`).toContain(shown);
        expectedBalance = c.acceptedBalances[c.acceptedAmounts.indexOf(shown)];
      } else {
        await expect(bill.validationError('amount-invalid')).toHaveText(msg.amountInvalid);
      }

      expect(await accounts.accountIds(), 'Accounts Overview still loads').toContain(from);
      await accounts.expectBalance(from, expectedBalance);
    });
  }

  test('TC-BILLPAY-039 | Bill-pay API refuses a From account owned by another customer', async ({ page }) => {
    // Expect defect (AS9): the API only checks that someone is logged in.
    const c = cases['TC-BILLPAY-039'];
    const other = { username: uniqueUsername(), password: data.user.password };
    expect(await login.register(other, data.registrationProfile)).toBe(true);
    const [otherAccount] = await accounts.accountIds();
    const before = await readBalance(otherAccount);

    await page.goto('logout.htm');
    expect(await login.login(credentials), `login as ${credentials.username}`).toBe(true);

    const response = await page.request.post('services_proxy/bank/billpay', {
      params: { accountId: otherAccount, amount: c.amount },
      data: {
        name: data.payee.payeeName,
        address: { street: data.payee.address, city: data.payee.city, state: data.payee.state, zipCode: data.payee.zipCode },
        phoneNumber: data.payee.phone,
        accountNumber: data.payee.account,
      },
    });
    expect.soft(response.status(), 'must be refused with 4xx').toBeGreaterThanOrEqual(400);
    expect.soft(response.status(), 'must be refused with 4xx').toBeLessThan(500);

    await page.goto('logout.htm');
    expect(await login.login(other), 'login as the other customer').toBe(true);
    await accounts.expectBalance(otherAccount, before);
    // Wait for the AJAX history to render (rows, or the "no transactions" note for a brand-new customer).
    await expect(accounts.transactionRows.first().or(page.locator('#noTransactions')).filter({ visible: true }).first()).toBeVisible();
    await expect(accounts.transactionRows.filter({ hasText: msg.descriptionPrefix + data.payee.payeeName })).toHaveCount(0);
  });
});
