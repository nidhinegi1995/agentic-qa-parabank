// spec: specs/transfer-funds.md
// manual design: test/transfer-funds-test-design.md
import { test, expect } from '@playwright/test';
import data from '../test-data/transfer-funds.json';
import { LoginPage } from '../pages/login.page';
import { AccountsPage, type AccountType } from '../pages/accounts.page';
import { TransferFundsPage } from '../pages/transfer-funds.page';

const msg = data.messages;
const opening = data.setup.newAccountOpeningBalance;

/** PARABANK_USER / PARABANK_PASS override the JSON credentials (e.g. in CI secrets). */
const credentials = {
  username: process.env.PARABANK_USER ?? data.user.username,
  password: process.env.PARABANK_PASS ?? data.user.password,
};

/** Activity pages show dates as MM-DD-YYYY in the server's local time zone. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${d.getFullYear()}`;
}

/** Opens two new accounts funded from the customer's first account; each starts at exactly `opening`. */
async function openFundedPair(accounts: AccountsPage, toType: AccountType = 'CHECKING') {
  return test.step(`Open two fresh accounts (${opening} each)`, async () => {
    const [funding] = await accounts.accountIds();
    const from = await accounts.openNewAccount('CHECKING', funding);
    const to = await accounts.openNewAccount(toType, funding);
    await accounts.expectBalance(from, opening);
    await accounts.expectBalance(to, opening);
    return { from, to };
  });
}

/** For rejected transfers: no confirmation, and neither account moved. */
async function expectNoMoneyMoved(transfer: TransferFundsPage, accounts: AccountsPage, from: string, to: string) {
  await expect(transfer.resultPanel, 'transfer must not report success').toBeHidden();
  await accounts.expectBalance(from, opening);
  await accounts.expectBalance(to, opening);
}

let login: LoginPage;
let accounts: AccountsPage;
let transfer: TransferFundsPage;

test.beforeEach(async ({ page }) => {
  login = new LoginPage(page);
  accounts = new AccountsPage(page);
  transfer = new TransferFundsPage(page);
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach('screenshot-on-failure', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  }
});

test.describe('Transfer Funds', () => {
  test.beforeEach(async () => {
    await test.step(`Log in as ${credentials.username}`, () =>
      login.ensureLoggedIn(credentials, data.registrationProfile));
  });

  test.describe('Successful transfers', () => {
    test('transfers between own checking accounts and shows the exact confirmation', async () => {
      const t = data.successfulTransfers.standard;
      const { from, to } = await openFundedPair(accounts);

      await transfer.goto(from);
      await transfer.transfer(t.amount, from, to);

      await expect(transfer.form).toBeHidden();
      await expect(transfer.resultHeading).toHaveText(msg.transferComplete);
      await expect(transfer.resultMessage).toHaveText(
        `${t.expectedConfirmationAmount} has been transferred from account #${from} to account #${to}.`,
      );
      await expect(transfer.resultAmount).toHaveText(t.expectedConfirmationAmount);
      await expect(transfer.resultFromAccount).toHaveText(from);
      await expect(transfer.resultToAccount).toHaveText(to);
      await expect(transfer.resultPanel).toContainText(msg.seeAccountActivity);
    });

    test('debits and credits both balances with exact precision', async () => {
      const t = data.successfulTransfers.standard;
      const { from, to } = await openFundedPair(accounts);

      await transfer.goto(from);
      await transfer.transfer(t.amount, from, to);
      await expect(transfer.resultHeading).toHaveText(msg.transferComplete);

      await accounts.expectBalance(from, t.expectedFromBalance);
      await accounts.expectBalance(to, t.expectedToBalance);
    });

    test('records one Sent and one Received transaction dated today', async () => {
      const t = data.successfulTransfers.standard;
      const { from, to } = await openFundedPair(accounts);

      await transfer.goto(from);
      await transfer.transfer(t.amount, from, to);
      await expect(transfer.resultHeading).toHaveText(msg.transferComplete);

      // Each new account already holds one "Received" row for its opening deposit.
      const openingDeposit = { date: today(), description: msg.transferReceived, debit: '', credit: opening };

      await accounts.openActivity(from);
      await expect(accounts.transactionRows).toHaveCount(2);
      expect(await accounts.transactions()).toEqual([
        openingDeposit,
        { date: today(), description: msg.transferSent, debit: t.expectedConfirmationAmount, credit: '' },
      ]);

      await accounts.openActivity(to);
      await expect(accounts.transactionRows).toHaveCount(2);
      expect(await accounts.transactions()).toEqual([
        openingDeposit,
        { date: today(), description: msg.transferReceived, debit: '', credit: t.expectedConfirmationAmount },
      ]);
    });

    for (const [name, t] of [
      ['minimum valid amount', data.successfulTransfers.minimum],
      ['exact available balance', data.successfulTransfers.exactBalance],
      ['whole-number amount formatted as currency', data.successfulTransfers.wholeNumber],
    ] as const) {
      test(`accepts the ${name} (${t.amount})`, async () => {
        const { from, to } = await openFundedPair(accounts);

        await transfer.goto(from);
        await transfer.transfer(t.amount, from, to);

        await expect(transfer.resultMessage).toHaveText(
          `${t.expectedConfirmationAmount} has been transferred from account #${from} to account #${to}.`,
        );
        await accounts.expectBalance(from, t.expectedFromBalance);
        await accounts.expectBalance(to, t.expectedToBalance);
      });
    }

    test('transfers from checking to savings', async () => {
      const t = data.successfulTransfers.checkingToSavings;
      const { from, to } = await openFundedPair(accounts, 'SAVINGS');

      await transfer.goto(from);
      await transfer.transfer(t.amount, from, to);

      await expect(transfer.resultMessage).toHaveText(
        `${t.expectedConfirmationAmount} has been transferred from account #${from} to account #${to}.`,
      );
      await accounts.expectBalance(from, t.expectedFromBalance);
      await accounts.expectBalance(to, t.expectedToBalance);
    });

    test("lists only the customer's own accounts in both dropdowns", async () => {
      const { from, to } = await openFundedPair(accounts);

      await transfer.goto(from);
      const fromOptions = await transfer.optionValues(transfer.fromAccount);
      const toOptions = await transfer.optionValues(transfer.toAccount);

      // Read Overview afterwards: parallel tests on the same user may add accounts in between,
      // so every dropdown option must be one of the customer's accounts (not an exact list match).
      const ownAccounts = await accounts.accountIds();
      for (const options of [fromOptions, toOptions]) {
        expect(options).toEqual(expect.arrayContaining([from, to]));
        expect(ownAccounts).toEqual(expect.arrayContaining(options));
        expect(options).not.toContain(data.otherCustomer.accountId);
      }
      expect(toOptions).toEqual(fromOptions);
    });
  });

  test.describe('Input validation', () => {
    test('empty amount moves no money', async () => {
      const { from, to } = await openFundedPair(accounts);

      await transfer.goto(from);
      await transfer.transfer(data.invalidAmounts.empty, from, to);

      await expectNoMoneyMoved(transfer, accounts, from, to);
    });

    test('empty amount shows the inline "amount cannot be empty" message', async () => {
      test.fail(true, 'Known defect (TC-017): the UI shows the generic error panel instead of the inline message');
      const { from, to } = await openFundedPair(accounts);

      await transfer.goto(from);
      await transfer.transfer(data.invalidAmounts.empty, from, to);

      await expect(transfer.form).toBeVisible();
      await expect(transfer.inlineAmountErrors.filter({ hasText: msg.amountEmpty })).toBeVisible();
    });

    test('non-numeric amount moves no money', async () => {
      const { from, to } = await openFundedPair(accounts);

      await transfer.goto(from);
      await transfer.transfer(data.invalidAmounts.nonNumeric, from, to);

      await expectNoMoneyMoved(transfer, accounts, from, to);
    });

    test('non-numeric amount shows the inline "valid amount" message', async () => {
      test.fail(true, 'Known defect (TC-018): the UI shows the generic error panel instead of the inline message');
      const { from, to } = await openFundedPair(accounts);

      await transfer.goto(from);
      await transfer.transfer(data.invalidAmounts.nonNumeric, from, to);

      await expect(transfer.form).toBeVisible();
      await expect(transfer.inlineAmountErrors.filter({ hasText: msg.amountInvalid })).toBeVisible();
    });

    test('SQL injection in the amount is rejected without moving money', async () => {
      const { from, to } = await openFundedPair(accounts);

      await transfer.goto(from);
      await transfer.transfer(data.invalidAmounts.sqlInjection, from, to);

      await expect(transfer.errorHeading).toHaveText(msg.errorHeading);
      await expectNoMoneyMoved(transfer, accounts, from, to);
    });

    test('amount beyond storage precision is rejected without moving money', async () => {
      const { from, to } = await openFundedPair(accounts);

      await transfer.goto(from);
      await transfer.transfer(data.invalidAmounts.overflow, from, to);

      await expect(transfer.errorHeading).toHaveText(msg.errorHeading);
      await expectNoMoneyMoved(transfer, accounts, from, to);
    });
  });

  test.describe('Financial rules', () => {
    for (const [name, amount, defect] of [
      ['a zero amount', data.rejectedAmounts.zero, 'TC-008'],
      ['a negative amount', data.rejectedAmounts.negative, 'TC-009'],
      ['an amount exceeding the balance by $0.01', data.rejectedAmounts.overBalance, 'TC-010'],
      ['a very large amount', data.rejectedAmounts.veryLarge, 'TC-014'],
    ] as const) {
      test(`rejects ${name} (${amount})`, async () => {
        test.fail(true, `Known defect (${defect}): the server accepts the transfer and moves the money`);
        const { from, to } = await openFundedPair(accounts);

        await transfer.goto(from);
        await transfer.transfer(amount, from, to);

        await expectNoMoneyMoved(transfer, accounts, from, to);
      });
    }

    test('rejects a transfer to the same account', async () => {
      test.fail(true, 'Known defect (TC-024): self-transfer succeeds and adds a Sent and a Received row');
      const { from } = await openFundedPair(accounts);

      await transfer.goto(from);
      await transfer.transfer(data.selfTransferAmount, from, from);

      await expect(transfer.resultPanel).toBeHidden();
      await accounts.openActivity(from);
      await expect(accounts.transactionRows, 'only the opening deposit').toHaveCount(1);
    });
  });

  test.describe('Fraud and session', () => {
    test('a double-click on Transfer executes only one transfer', async () => {
      test.fail(true, 'Known defect (TC-029): the button stays enabled and both submissions are processed');
      const t = data.doubleSubmit;
      const { from, to } = await openFundedPair(accounts);

      await transfer.goto(from);
      await transfer.fill(t.amount, from, to);
      await transfer.transferButton.dblclick();
      await transfer.waitForOutcome();

      await accounts.expectBalance(from, t.expectedFromBalance);
      await expect(accounts.transactionRows.filter({ hasText: msg.transferSent })).toHaveCount(1);
    });

    test("cannot debit another customer's account through the transfer API", async ({ page }) => {
      test.fail(true, 'Known defect (TC-026): the API has no ownership check and returns 200');
      const { to } = await openFundedPair(accounts);

      const response = await page.request.post('services_proxy/bank/transfer', {
        params: { fromAccountId: data.otherCustomer.accountId, toAccountId: to, amount: data.crossAccountAmount },
      });

      expect(response.status(), await response.text()).toBe(403);
      await accounts.expectBalance(to, opening);
    });

    test('an expired session sends the user back to log in', async ({ page }) => {
      test.fail(true, 'Known defect (TC-030): the API returns 401 but the UI shows the generic internal error');
      const { from, to } = await openFundedPair(accounts);

      await transfer.goto(from);
      await transfer.fill(data.sessionExpiryAmount, from, to);
      await page.context().clearCookies();
      await transfer.transferButton.click();
      await transfer.waitForOutcome();

      await expect(transfer.errorMessage).not.toHaveText(msg.internalError);
      await expect(login.logInButton).toBeVisible();
    });
  });
});

// A balance with more than 2 decimals makes every read of the customer's accounts fail
// (HTTP 500 on Overview, Transfer and Activity), so this runs under a disposable user.
test.describe('Transfer Funds – precision (throwaway user)', () => {
  test('rejects a sub-cent amount and keeps both accounts readable', async () => {
    test.fail(true, 'Known defect (TC-012): 0.001 is accepted and both accounts return HTTP 500 afterwards');
    // Customer.username is VARCHAR(20); longer names fail as "This username already exists."
    const throwaway = {
      username: `${data.throwawayUserPrefix}${Date.now().toString(36)}`,
      password: data.user.password,
    };
    expect(await login.register(throwaway, data.registrationProfile)).toBe(true);
    const { from, to } = await openFundedPair(accounts);

    await transfer.goto(from);
    await transfer.transfer(data.rejectedAmounts.subCent, from, to);

    await expectNoMoneyMoved(transfer, accounts, from, to);
  });
});
