import { expect, type Locator, type Page } from '@playwright/test';

export interface Credentials {
  username: string;
  password: string;
}

export interface CustomerProfile {
  firstName: string;
  lastName: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  ssn: string;
}

/**
 * Login and registration for ParaBank.
 *
 * The demo DB is rebuilt whenever ParaBank restarts, which deletes registered users,
 * so `ensureLoggedIn` registers the user when the login is rejected.
 */
export class LoginPage {
  readonly username: Locator;
  readonly password: Locator;
  readonly logInButton: Locator;
  readonly loginError: Locator;
  readonly overviewHeading: Locator;

  constructor(private readonly page: Page) {
    this.username = page.locator('input[name="username"]');
    this.password = page.locator('input[name="password"]');
    this.logInButton = page.getByRole('button', { name: 'Log In' });
    // Not `.error`: Accounts Overview always contains a hidden p.error for its own AJAX failures.
    this.loginError = page.getByText('The username and password could not be verified.');
    this.overviewHeading = page.getByRole('heading', { name: 'Accounts Overview' });
  }

  /** Submits the login form; resolves to true on success, false when the credentials are rejected. */
  async login({ username, password }: Credentials): Promise<boolean> {
    await this.page.goto('index.htm');
    await this.username.fill(username);
    await this.password.fill(password);
    await this.logInButton.click();
    await expect(this.overviewHeading.or(this.loginError)).toBeVisible();
    return this.overviewHeading.isVisible();
  }

  /** Logs in, registering the user first if it does not exist. */
  async ensureLoggedIn(credentials: Credentials, profile: CustomerProfile): Promise<void> {
    if (await this.login(credentials)) return;
    const created = await this.register(credentials, profile);
    // A parallel worker may have registered the same user first.
    if (!created) expect(await this.login(credentials), `login as ${credentials.username}`).toBe(true);
  }

  /** Registers a user (which also logs it in); resolves to false if the username already exists. */
  async register({ username, password }: Credentials, profile: CustomerProfile): Promise<boolean> {
    const field = (id: string) => this.page.locator(`[id="${id}"]`);
    await this.page.goto('register.htm');
    await field('customer.firstName').fill(profile.firstName);
    await field('customer.lastName').fill(profile.lastName);
    await field('customer.address.street').fill(profile.street);
    await field('customer.address.city').fill(profile.city);
    await field('customer.address.state').fill(profile.state);
    await field('customer.address.zipCode').fill(profile.zipCode);
    await field('customer.phoneNumber').fill(profile.phone);
    await field('customer.ssn').fill(profile.ssn);
    await field('customer.username').fill(username);
    await field('customer.password').fill(password);
    await field('repeatedPassword').fill(password);
    await this.page.getByRole('button', { name: 'Register' }).click();

    const welcome = this.page.getByRole('heading', { name: `Welcome ${username}` });
    const duplicate = this.page.getByText('This username already exists.');
    await expect(welcome.or(duplicate)).toBeVisible();
    if (await duplicate.isVisible()) return false;
    await expect(this.page.getByText('Your account was created successfully. You are now logged in.')).toBeVisible();
    return true;
  }
}
