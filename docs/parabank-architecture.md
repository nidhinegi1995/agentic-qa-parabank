# ParaBank – Architecture Overview

ParaBank (`parabank/`, v6.0.0-SNAPSHOT) is Parasoft's demo online banking web application. It ships as a single WAR deployed to Apache Tomcat 11 (Java 21) and exposes the same banking functionality through three channels: a JSP web UI, a REST API and a SOAP API.

## 1. Technology Stack

| Layer | Technology |
|---|---|
| Web framework | Spring MVC 7 (`*.htm` controllers, JSP views) |
| UI | JSP + JSTL, jQuery AJAX calls to the REST proxy |
| REST API | Jersey 4 (`/bank/*`), Swagger/OpenAPI (`WEB-INF/swagger.yaml`) |
| SOAP API | Apache CXF 4 (`/services/*`), WS-Security (WSS4J) |
| Persistence | Spring JDBC DAOs over an embedded HyperSQL 2.7 DB (port 9001) |
| Messaging | Apache ActiveMQ 6 (port 61616), used for JMS-based loan processing |
| Build | Maven (`mvn clean install` → `target/parabank-*.war`) |
| Test tooling | JUnit/Mockito unit tests, Parasoft SOAtest / Selenic / Jtest scripts |

## 2. Request Flow

```
Browser (JSP page)
   │  form POST (*.htm)            │  jQuery AJAX (services_proxy/bank/...)
   ▼                               ▼
Spring MVC controllers        RestServiceProxyController
   │                               │
   └────────────┬──────────────────┘
                ▼
    BankManager / AdminManager (domain logic)     ◄── ParaBankServiceImpl ◄── REST /bank/*  &  SOAP /services/*
                ▼
    DAOs (JdbcAccountDao, JdbcCustomerDao, JdbcTransactionDao, ...)
                ▼
    HyperSQL database (create.sql / insert.sql / reset.sql)
```

Servlet mappings (`webapp/WEB-INF/web.xml`):

| URL pattern | Servlet | Purpose |
|---|---|---|
| `*.htm` | Spring `parabank` | Web UI pages |
| `/services_proxy/*` | Spring `parabank` | REST proxy used by the UI's AJAX calls |
| `/bank/*` | Jersey | Public REST API |
| `/services/*` | CXF | SOAP web services (ParaBank, LoanProcessor, Bookstore) |

**Important for testing:** several core actions (transfer, bill pay, open account, request loan, update profile, find transactions, account overview) are submitted from the page via AJAX to `services_proxy/bank/...`, not via a classic form POST. UI tests should wait for the AJAX result panel. API tests can call the same endpoints directly.

**Access mode:** the `accessmode` admin parameter (default `jdbc`) controls whether controllers call `BankManager` directly or go through `AccessModeController` (SOAP/REST/XML/JSON round-trips). Changing it on the Admin page exercises the alternate service paths.

## 3. Key Modules

Package root: `src/main/java/com/parasoft/parabank/`

| Module | Responsibility | Key classes |
|---|---|---|
| `web.controller` | Spring MVC controllers, one per page | `LoginController`, `RegisterCustomerController`, `AccountsOverviewController`, `AccountActivityController`, `TransferController`, `BillPayController`, `OpenAccountController`, `RequestLoanController`, `FindTransactionController`, `UpdateCustomerController`, `CustomerLookupController`, `AdminController`, `RestServiceProxyController` |
| `web` | Session and security plumbing | `LoginInterceptor` (redirects unauthenticated users to login), `UserSession`, `ViewUtil` |
| `web.form` | Form-backing beans | `CustomerForm`, `TransferForm`, `BillPayForm`, `RequestLoanForm`, `FindTransactionForm`, `LookupForm`, `OpenAccountForm`, `AdminForm` |
| `domain` | Entities | `Customer`, `Address`, `Account` (CHECKING / SAVINGS / LOAN), `Transaction` (Credit/Debit), `Payee`, `LoanRequest`, `LoanResponse`, `Position` |
| `domain.logic` | Business logic | `BankManagerImpl` (accounts, transfers, deposits, withdrawals, loans, positions), `AdminManagerImpl`, loan processors |
| `domain.validator` | Server-side validation | `CustomerValidator`, `CustomerFormValidator`, `AddressValidator`, `TransferFormValidator`, `BillPayFormValidator`, `PayeeValidator`, `RequestLoanFormValidator`, `LookupFormValidator`, `TransactionCriteriaValidator` |
| `service` | REST and SOAP API | `ParaBankService` (JAX-RS + JAX-WS interface), `ParaBankServiceImpl`, `LoanProcessorService` |
| `messaging` | Loan provider integrations | `LocalLoanProvider`, `JmsLoanProvider`/`JmsLoanProcessor`, `WebServiceLoanProvider` |
| `dao` / `dao.jdbc` | Data access | `JdbcCustomerDao`, `JdbcAccountDao`, `JdbcTransactionDao`, `JdbcAdminDao`, `JdbcPositionDao`, `JdbcSequenceDao` |
| `com.parasoft.bookstore*` | Separate demo SOAP bookstore service (not part of the banking flows) | `CartService`, `BookStoreDB` |

Views: `src/main/webapp/WEB-INF/jsp/content/*.jsp` (for example `register.jsp`, `overview.jsp`, `transfer.jsp`, `billpay.jsp`, `activity.jsp`, `findtrans.jsp`).

## 4. Data Model

Tables (`resources/.../dao/jdbc/sql/create.sql`): `Customer`, `Account`, `Transaction`, `Parameter`, `Sequence`, `News`, `Positions`, `Company`, `Stock`.

Admin `Parameter` defaults (`insert.sql`):

| Parameter | Default | Effect |
|---|---|---|
| `initialBalance` | 515.50 | Starting balance of a newly registered customer's first account |
| `minimumBalance` | 100.00 | Amount moved from the funding account into a newly opened account |
| `loanProvider` | `ws` | Loan provider: local / JMS / web service |
| `loanProcessor` | `funds` | Approval rule: available funds / down payment / combined |
| `loanProcessorThreshold` | 20 | Approval threshold (percent) |
| `accessmode` | `jdbc` | Controller data-access path |

Seed test data:
- `john` / `demo` (customer 12212) has 11 accounts, including negative balances (12345: -2300.00, 12678: -100.00) and a zero balance (12900).
- `parasoft` / `demo` (customer 12323) has account 13455 (2014.76).

The database can be reset from the Admin page (`admin.htm` → Initialize / Clean) or with REST `POST /bank/initializeDB` and `/bank/cleanDB`.

## 5. Banking Workflows (Business Rules)

### 5.1 User Registration (`register.htm`)
- Required fields: first name, last name, street, city, state, zip code, SSN, username, password, confirm password. Phone is optional.
- Validation errors: confirm password missing → `error.password.confirmation.required`; passwords differ → `error.password.mismatch`; duplicate username → `error.username.already.exists`.
- On success the customer is created, logged in automatically, and given one CHECKING account with `initialBalance` (515.50).

### 5.2 Login / Logout (`login.htm`, `logout.htm`)
- Empty username or password → `error.empty.username.or.password`.
- Wrong credentials → `error.invalid.username.or.password`.
- `LoginInterceptor` protects every secure page. Opening one without a session shows the login form and stores `loginForwardAction`, so the user is sent back to the requested page after logging in.
- Logout invalidates the session.

### 5.3 Accounts Overview and Activity (`overview.htm`, `activity.htm?id=`)
- Overview loads accounts by AJAX from `customers/{id}/accounts` and shows balance, available amount and total.
- Activity shows account details and transactions, filterable by month (`All`, Jan–Dec) and type (`All`, Credit, Debit).

### 5.4 Open New Account (`openaccount.htm`)
- Choose a type (CHECKING or SAVINGS; LOAN is internal only) and an existing funding account.
- `minimumBalance` (100.00) is transferred from the funding account into the new account.

### 5.5 Fund Transfer (`transfer.htm`)
- Amount, from-account and to-account. AJAX `POST services_proxy/bank/transfer`.
- `BankManagerImpl.transfer` = `withdraw` + `deposit`. It creates a Debit "Funds Transfer Sent" and a Credit "Funds Transfer Received" transaction.
- **No insufficient-funds check:** `Account.debit` simply subtracts, so overdrafts are allowed. The same account can be chosen as both source and destination. Server validation only rejects an empty amount; negative and zero amounts are not explicitly rejected. These are good candidates for negative and boundary tests.

### 5.6 Bill Pay (`billpay.htm`)
- Payee name, street, city, state, zip, phone, account #, verify account #, amount and from-account are all required.
- Account # and verify account # must match (`error.account.number.mismatch`).
- Debits the from-account and records a Debit transaction "Bill Payment to {payee}".

### 5.7 Request Loan (`requestloan.htm`)
- Inputs: loan amount, down payment, from-account.
- Rejected when the down payment is greater than the available funds (`error.insufficient.funds.for.down.payment`).
- Otherwise the configured processor checks its ratio against `loanProcessorThreshold`:
  - `funds`: available funds / loan amount
  - `downpayment`: down payment / loan amount
  - `combined`: both
- When approved, a new LOAN account is created and the down payment is withdrawn from the from-account. The response shows Approved/Denied, the provider and the new account number.

### 5.8 Find Transactions (`findtrans.htm`)
- Search one account by transaction ID, a single date, a date range (`MM-DD-YYYY`), or an amount.
- REST: `accounts/{id}/transactions/onDate/...`, `/fromDate/.../toDate/...`, `/amount/...`, `transactions/{id}`.

### 5.9 Update Contact Info (`updateprofile.htm`)
- Pre-filled with customer data; name and address fields are required. AJAX `POST customers/update/{id}`.

### 5.10 Public Pages (no login)
- Forgot login info (`lookup.htm`: first name, last name, address, zip and SSN are required; returns the username and password), Contact Us (`contact.htm`), About, Services, Site Map, News, Admin.

## 6. Backend Services (REST `/bank/*`, SOAP `/services/ParaBank`)

| Area | Endpoints |
|---|---|
| Auth | `GET /login/{username}/{password}` |
| Customer | `GET /customers/{id}`, `POST /customers/update/{id}`, `GET /customers/{id}/accounts` |
| Account | `GET /accounts/{id}`, `POST /createAccount?customerId&newAccountType&fromAccountId` |
| Money movement | `POST /transfer?fromAccountId&toAccountId&amount`, `POST /deposit`, `POST /withdraw`, `POST /billpay?accountId&amount` (Payee JSON body) |
| Transactions | `GET /accounts/{id}/transactions`, `.../month/{m}/type/{t}`, `.../onDate/{d}`, `.../fromDate/{f}/toDate/{t}`, `.../amount/{a}`, `GET /transactions/{id}` |
| Loans | `POST /requestLoan?customerId&amount&downPayment&fromAccountId` |
| Positions | `/customers/{id}/positions`, `buyPosition`, `sellPosition`, `/positions/{id}` |
| Admin | `POST /initializeDB`, `POST /cleanDB`, `POST /setParameter/{name}/{value}`, `startupJmsListener`, `shutdownJmsListener` |

The API description is at `/parabank/api-docs/` (Swagger UI) and `WEB-INF/swagger.yaml`. Errors are returned as `ParaBankServiceException` (for example "Could not find account number …", "Invalid username and/or password").

## 7. UI Flows Relevant for Testing

| # | Flow | Page(s) | Positive path | Negative / boundary focus |
|---|---|---|---|---|
| 1 | Registration | `register.htm` → `registerConfirm` | All fields valid → auto-login, new account with 515.50 | Each required field blank, password mismatch, duplicate username, very long or special-character input |
| 2 | Login | `index.htm` left panel | `john`/`demo` → Accounts Overview | Blank fields, wrong password, case sensitivity, protected URL without session → login → redirect back |
| 3 | Accounts Overview | `overview.htm` | Totals match the sum of balances; account links open Activity | Negative and zero balances shown correctly; currency formatting |
| 4 | Account Activity | `activity.htm?id=` | Month/type filters | Invalid or another customer's account ID in the URL; account with no transactions |
| 5 | Open Account | `openaccount.htm` | New CHECKING/SAVINGS, 100.00 moved from the funding account | Funding account balance below 100 (overdraft allowed) |
| 6 | Fund Transfer | `transfer.htm` | Balances updated on both sides; two transactions created | Empty, zero, negative, non-numeric or very large amounts; same from/to account; more than the balance; decimal precision |
| 7 | Bill Pay | `billpay.htm` | Confirmation shows payee, amount and account; Debit recorded | Missing fields, account/verify mismatch, invalid amount |
| 8 | Request Loan | `requestloan.htm` | Approved → new LOAN account | Down payment greater than funds; ratio just below or above the 20% threshold; zero amounts |
| 9 | Find Transactions | `findtrans.htm` | Each search type returns matching rows | Invalid date format, empty criteria, no matches, non-existent transaction ID |
| 10 | Transaction History | `transaction.htm?id=` | Details match the activity row | Invalid ID |
| 11 | Update Profile | `updateprofile.htm` | Changes saved and persist after re-login | Blank required fields |
| 12 | Forgot Login | `lookup.htm` | Valid details → credentials shown | Mismatched SSN/zip, blank fields |
| 13 | Logout / Session | `logout.htm` | Session cleared | Back button or direct URL after logout → login form |
| 14 | Admin | `admin.htm` | Initialize/Clean DB; change balances, threshold, loan provider, access mode | Invalid parameter values; re-run flows under each access mode |

### Testing tips
- Reset to a known state before a suite with `POST /bank/initializeDB` (or Admin → Initialize).
- Read expected balances through the REST API (`GET /bank/accounts/{id}`) instead of parsing the UI.
- Change `initialBalance`, `minimumBalance` and `loanProcessorThreshold` on the Admin page to drive boundary tests for registration, open account and loans.
- Existing automation assets are in `parabank/soatest/` (SOAtest suites and virtual assets) and `parabank/src/test/` (unit and integration tests).
