import { expect, type Locator, type Page } from '@playwright/test';

/** Everything the Bill Pay form accepts. `fromAccount` is optional: omitted keeps the preselected option. */
export interface BillPayment {
  payeeName: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  account: string;
  verifyAccount: string;
  amount: string;
  fromAccount?: string;
}

/** Suffixes of the inline error spans (`#validationModel-<key>`). */
export type ValidationKey =
  | 'name'
  | 'address'
  | 'city'
  | 'state'
  | 'zipCode'
  | 'phoneNumber'
  | 'account-empty'
  | 'account-invalid'
  | 'verifyAccount-empty'
  | 'verifyAccount-invalid'
  | 'verifyAccount-mismatch'
  | 'amount-empty'
  | 'amount-invalid';

/**
 * Bill Pay (billpay.htm).
 *
 * Validation is client-side jQuery; a valid form is sent as an AJAX
 * POST to services_proxy/bank/billpay and the page swaps #billpayForm for
 * #billpayResult (success) or #billpayError (any non-2xx).
 * Inputs only have stable `name` attributes. The Phone # input gets a random
 * id/class on every load, so it is located by name only.
 * Note: `#amount` and `#fromAccountId` are the *result* spans, not the inputs.
 */
export class BillPayPage {
  static readonly paymentRequestPattern = /services_proxy\/bank\/billpay/;

  readonly heading: Locator;
  readonly subHeading: Locator;
  readonly form: Locator;
  readonly payeeName: Locator;
  readonly address: Locator;
  readonly city: Locator;
  readonly state: Locator;
  readonly zipCode: Locator;
  readonly phone: Locator;
  readonly account: Locator;
  readonly verifyAccount: Locator;
  readonly amount: Locator;
  readonly fromAccount: Locator;
  readonly sendPaymentButton: Locator;
  readonly billPayMenuLink: Locator;

  readonly resultPanel: Locator;
  readonly resultHeading: Locator;
  readonly resultMessage: Locator;
  readonly resultPayeeName: Locator;
  readonly resultAmount: Locator;
  readonly resultFromAccount: Locator;

  readonly errorPanel: Locator;
  readonly errorHeading: Locator;
  readonly errorMessage: Locator;

  /** All inline error spans that are currently displayed. */
  readonly visibleValidationErrors: Locator;
  /** Displayed inline errors of the Amount field (empty or invalid). */
  readonly visibleAmountErrors: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Bill Payment Service' });
    this.form = page.locator('#billpayForm');
    this.subHeading = this.form.locator('p').first();
    this.payeeName = page.locator('input[name="payee.name"]');
    this.address = page.locator('input[name="payee.address.street"]');
    this.city = page.locator('input[name="payee.address.city"]');
    this.state = page.locator('input[name="payee.address.state"]');
    this.zipCode = page.locator('input[name="payee.address.zipCode"]');
    this.phone = page.locator('input[name="payee.phoneNumber"]');
    this.account = page.locator('input[name="payee.accountNumber"]');
    this.verifyAccount = page.locator('input[name="verifyAccount"]');
    this.amount = page.locator('input[name="amount"]');
    this.fromAccount = page.locator('select[name="fromAccountId"]');
    this.sendPaymentButton = page.getByRole('button', { name: 'Send Payment' });
    this.billPayMenuLink = page.locator('#leftPanel').getByRole('link', { name: 'Bill Pay' });

    this.resultPanel = page.locator('#billpayResult');
    this.resultHeading = this.resultPanel.getByRole('heading');
    this.resultMessage = this.resultPanel.locator('p').first();
    this.resultPayeeName = this.resultPanel.locator('#payeeName');
    this.resultAmount = this.resultPanel.locator('#amount');
    this.resultFromAccount = this.resultPanel.locator('#fromAccountId');

    this.errorPanel = page.locator('#billpayError');
    this.errorHeading = this.errorPanel.getByRole('heading');
    this.errorMessage = this.errorPanel.locator('.error');

    this.visibleValidationErrors = page.locator('[id^="validationModel-"]').filter({ visible: true });
    this.visibleAmountErrors = page.locator('[id^="validationModel-amount-"]').filter({ visible: true });
  }

  validationError(key: ValidationKey): Locator {
    return this.page.locator(`#validationModel-${key}`);
  }

  /** The nine text inputs, in form order. */
  textInputs(): Locator[] {
    return [
      this.payeeName, this.address, this.city, this.state, this.zipCode,
      this.phone, this.account, this.verifyAccount, this.amount,
    ];
  }

  /** Opens Bill Pay; when `expectAccountId` is given, waits until it is listed in the From dropdown. */
  async goto(expectAccountId?: string): Promise<void> {
    await this.page.goto('billpay.htm');
    await expect(this.heading).toBeVisible();
    if (expectAccountId) {
      await expect(this.fromAccount.locator(`option[value="${expectAccountId}"]`)).toBeAttached();
    }
  }

  async fill(p: BillPayment): Promise<void> {
    await this.payeeName.fill(p.payeeName);
    await this.address.fill(p.address);
    await this.city.fill(p.city);
    await this.state.fill(p.state);
    await this.zipCode.fill(p.zipCode);
    await this.phone.fill(p.phone);
    await this.account.fill(p.account);
    await this.verifyAccount.fill(p.verifyAccount);
    await this.amount.fill(p.amount);
    if (p.fromAccount) await this.fromAccount.selectOption(p.fromAccount);
  }

  /** Fills the form, clicks Send Payment and waits for the outcome. */
  async pay(p: BillPayment): Promise<void> {
    await this.fill(p);
    await this.sendPaymentButton.click();
    await this.waitForOutcome();
  }

  /** Waits until the result panel, the error panel or at least one inline error is displayed. */
  async waitForOutcome(): Promise<void> {
    await expect(
      this.resultPanel.or(this.errorPanel).or(this.visibleValidationErrors).filter({ visible: true }).first(),
    ).toBeVisible();
  }

  /** Records every bill-pay POST issued from now on (for "no request is sent" assertions). */
  trackPaymentRequests(): string[] {
    const urls: string[] = [];
    this.page.on('request', (r) => {
      if (r.method() === 'POST' && BillPayPage.paymentRequestPattern.test(r.url())) urls.push(r.url());
    });
    return urls;
  }

  async optionValues(): Promise<string[]> {
    return this.fromAccount
      .locator('option')
      .evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));
  }
}
