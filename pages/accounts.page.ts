import { expect, type Locator, type Page } from '@playwright/test';

export type AccountType = 'CHECKING' | 'SAVINGS';

export interface TransactionRow {
  date: string;
  description: string;
  debit: string;
  credit: string;
}

/** Accounts Overview, Open New Account and Account Activity: the pages transfer tests use for setup and verification. */
export class AccountsPage {
  readonly accountLinks: Locator;
  readonly activityBalance: Locator;
  readonly transactionRows: Locator;

  constructor(private readonly page: Page) {
    this.accountLinks = page.locator('#accountTable a[href^="activity.htm"]');
    this.activityBalance = page.locator('#balance');
    this.transactionRows = page.locator('#transactionTable tbody tr');
  }

  /** Account IDs listed on Accounts Overview, in display order. */
  async accountIds(): Promise<string[]> {
    await this.page.goto('overview.htm');
    await expect(this.accountLinks.first()).toBeVisible();
    return (await this.accountLinks.allTextContents()).map((id) => id.trim());
  }

  /** Opens a new account funded from `fromAccountId` and returns its ID. */
  async openNewAccount(type: AccountType, fromAccountId: string): Promise<string> {
    await this.page.goto('openaccount.htm');
    const from = this.page.locator('#fromAccountId');
    await expect(from.locator(`option[value="${fromAccountId}"]`)).toBeAttached();
    await this.page.locator('#type').selectOption({ label: type });
    await from.selectOption(fromAccountId);
    await this.page.getByRole('button', { name: 'Open New Account' }).click();

    await expect(this.page.getByRole('heading', { name: 'Account Opened!' })).toBeVisible();
    const newAccountId = this.page.locator('#newAccountId');
    await expect(newAccountId).toHaveText(/^\d+$/);
    return (await newAccountId.textContent())!.trim();
  }

  /** Navigates to Account Activity; assert on `activityBalance` / `transactionRows` afterwards. */
  async openActivity(accountId: string): Promise<void> {
    await this.page.goto(`activity.htm?id=${accountId}`);
    await expect(this.page.locator('#accountId')).toHaveText(accountId);
  }

  async expectBalance(accountId: string, expected: string): Promise<void> {
    await this.openActivity(accountId);
    await expect(this.activityBalance, `balance of account ${accountId}`).toHaveText(expected);
  }

  /** Transactions on the Activity page that is currently open. */
  async transactions(): Promise<TransactionRow[]> {
    const rows = await this.transactionRows.all();
    return Promise.all(
      rows.map(async (row) => {
        const [date, description, debit, credit] = (await row.locator('td').allTextContents()).map((c) => c.trim());
        return { date, description, debit, credit };
      }),
    );
  }
}
