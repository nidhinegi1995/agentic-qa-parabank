# US-BILLPAY-01 Bill Pay: Coverage Map

Source: `user-stories/bill-pay-clarified.md` · Workbook: `test-cases/BillPay_TestCases.xlsx` (49 cases, TC-BILLPAY-001 to 049) · Source JSON: `test-cases/bill-pay-cases.json`

## Acceptance Criteria

| AC | Description | Test Cases |
|---|---|---|
| AC1 | User enters all payee fields, Amount, and selects From account # | 001, 006, 007, 008, 010, 048 |
| AC2 | Send Payment processes the payment and shows a confirmation | 001, 002, 003, 029, 032 |

## Ambiguities / Assumptions

| Ambiguity | Assumption | Test Cases | Expect defect |
|---|---|---|---|
| A1 Mandatory fields | AS1 | 008, 009, 010, 021 | |
| A2 Name/address format and length | AS2 | 007 | |
| A3 Payee Account # format | AS3 | 012, 013, 014, 015 | |
| A4 Verify Account # semantics | AS4 | 016, 017, 018, 019, 020 | |
| A5 Amount zero/negative/minimum | AS5 | 027, 028, 029 | 027, 028 |
| A6 Amount precision and formatting | AS6 | 003, 022, 023, 024, 025, 026, 030, 031 | |
| A7 Insufficient funds / overdraft | AS7 | 032, 033, 034 | 033, 034 |
| A8 Max amount / limits | AS8 | 035 | |
| A9 From account eligibility, default, ownership | AS9 | 006, 039, 049 | 039 |
| A10 Confirmation content | AS10 | 001, 003 | |
| A11 Post-payment effects | AS11 | 002, 004, 005 | |
| A12 Error presentation | AS12 | 008, 011, 013, 038, 048 | |
| A13 Double submission | AS13 | 040 | 040 |
| A14 Session expiry / unauthenticated | AS14 | 041, 042 | |
| A15 XSS / SQL injection | AS15 | 043, 044, 045 | 044 |
| A16 Payee Name length vs storage | AS16 | 036, 037 | |
| A17 Self-payment | AS17 | 004, 005 | |
| A18 Post-confirmation navigation | AS18 | 046, 047 | |

All IDs are prefixed `TC-BILLPAY-`. Every AC and every ambiguity A1 to A18 maps to at least one test case.

## Automatable = No

- TC-BILLPAY-048: visual check of layout, label alignment and error placement.
- TC-BILLPAY-049: usability of a dropdown with 600+ accounts. The expected behaviour is undefined (A9), so a person has to judge it.
