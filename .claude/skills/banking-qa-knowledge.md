name: banking-qa-knowledge
description: Apply banking QA knowledge – risk categories, boundary values, and test case format for ParaBank features

## Risk Categories – Always Evaluate All of These

### Financial Risks
- Transfer amount exceeds available balance
- Decimal precision issues (e.g. 0.001 rounding behaviour)
- Amount exceeds configured daily/transaction limit

### Fraud Risks
- Double submission: user clicks Submit twice rapidly
- Session replay: reusing an expired authenticated session
- Cross-account access: transferring from account user does not own

### Boundary Values – Always Test for Amount Fields
| Value        | Type              | Expected Behaviour         |
|---------------|------------------|-----------------------------|
| 0             | Zero boundary    | Reject – invalid            |
| -1            | Negative         | Reject – invalid            |
| 0.01          | Minimum valid    | Accept                      |
| [balance]     | Exact balance    | Accept – edge case          |
| [balance+0.01]| Over balance     | Reject – insufficient       |
| 999999999     | Max integer      | Reject or cap               |
| 0.001         | Precision test   | Validate rounding           |

### Validation Risks
- SQL injection in any input field
- Non-numeric characters in amount field
- Empty form submission
- Invalid account number format

### Business Rule Risks
- Self-transfer: same source and destination account
- Transfer to closed or suspended account

### Concurrency Risks
- Simultaneous transfers draining the same source account

## Test Case Output Format – Always Use This Structure
TC-ID | Title | Risk Level (High/Medium/Low) | Risk Category |
Preconditions | Test Steps | Test Data (exact values) |
Expected Result (specific message or data change) | Automation (Yes/No/Partial)

Rule: Never write vague expected results like “should work correctly”.
Always specify the exact UI message, balance change, or error text.
