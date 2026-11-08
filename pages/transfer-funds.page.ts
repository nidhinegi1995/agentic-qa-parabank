import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Transfer Funds (transfer.htm).
 *
 * The form never reloads the page: jQuery posts to services_proxy/bank/transfer and then
 * swaps the visible panel to #showResult (success) or #showError (any failure).
 * Inputs have no labels or data-testids, so IDs are the most stable locators.
 */
export class TransferFundsPage {
  readonly heading: Locator;
  readonly form: Locator;
  readonly amount: Locator;
  readonly fromAccount: Locator;
  readonly toAccount: Locator;
  readonly transferButton: Locator;

  readonly resultPanel: Locator;
  readonly resultHeading: Locator;
  readonly resultMessage: Locator;
  readonly resultAmount: Locator;
  readonly resultFromAccount: Locator;
  readonly resultToAccount: Locator;

  readonly errorPanel: Locator;
  readonly errorHeading: Locator;
  readonly errorMessage: Locator;
  /** Two <p> elements share id="amount.errors"; the dot means CSS `#amount.errors` would not match. */
  readonly inlineAmountErrors: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Transfer Funds' });
    this.form = page.locator('#showForm');
    this.amount = page.locator('#amount');
    this.fromAccount = page.locator('#fromAccountId');
    this.toAccount = page.locator('#toAccountId');
    this.transferButton = page.getByRole('button', { name: 'Transfer', exact: true });

    this.resultPanel = page.locator('#showResult');
    this.resultHeading = this.resultPanel.getByRole('heading');
    this.resultMessage = this.resultPanel.locator('p').first();
    this.resultAmount = page.locator('#amountResult');
    this.resultFromAccount = page.locator('#fromAccountIdResult');
    this.resultToAccount = page.locator('#toAccountIdResult');

    this.errorPanel = page.locator('#showError');
    this.errorHeading = this.errorPanel.getByRole('heading');
    this.errorMessage = this.errorPanel.locator('.error');
    this.inlineAmountErrors = page.locator('[id="amount.errors"]');
  }

  /** Opens the page and waits until the AJAX-loaded account dropdowns contain `expectAccountId`. */
  async goto(expectAccountId: string): Promise<void> {
    await this.page.goto('transfer.htm');
    await expect(this.heading).toBeVisible();
    await expect(this.fromAccount.locator(`option[value="${expectAccountId}"]`)).toBeAttached();
  }

  async fill(amount: string, fromAccountId: string, toAccountId: string): Promise<void> {
    await this.amount.fill(amount);
    await this.fromAccount.selectOption(fromAccountId);
    await this.toAccount.selectOption(toAccountId);
  }

  async transfer(amount: string, fromAccountId: string, toAccountId: string): Promise<void> {
    await this.fill(amount, fromAccountId, toAccountId);
    await this.transferButton.click();
    await this.waitForOutcome();
  }

  /** Waits for the request to finish: either the result or the error panel becomes visible. */
  async waitForOutcome(): Promise<void> {
    // Both panels are always in the DOM (one hidden), so keep only the visible match.
    await expect(this.resultPanel.or(this.errorPanel).filter({ visible: true })).toBeVisible();
  }

  async optionValues(select: Locator): Promise<string[]> {
    return select.locator('option').evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));
  }
}
