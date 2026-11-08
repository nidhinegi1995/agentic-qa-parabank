🧭 Locator Strategy
Prioritize data‑tested attributes and ARIA roles for accessibility.

Use semantic HTML (e.g., input[name="amount"]) before resorting to CSS or XPath.

Avoid fragile selectors that break with UI changes.

✅ Assertion Standards
Always assert specific messages or values, not just visibility.

Validate success, error, and transaction outcomes precisely — including numeric precision for balances.

Confirm navigation, account details, and error handling explicitly.

⏱ Wait & Stability Rules
Use Playwright’s auto‑waiting; avoid manual timeouts.

Ensure selectors and tests work across sessions and account states.

Each test should set up its own preconditions — no dependency on prior runs.

📸 Reporting & Framework Structure
Capture screenshots on failure and log major test actions.

Follow the Page Object Model — one page class per feature.

Store test data in /test-data/<feature-name>.json and specs in /tests/<feature-name>.spec.ts.

💰 Banking Domain Assertions
Assert exact success messages for operations like Transfer Funds, Open Account, Bill Payment, and Login.

Verify balance changes with full precision (e.g., $450.00, not $450).

Ensure failed operations create no records and no balance changes.

---

# **Healing Standards – Playwright Healer Agent Rules**

### **Safe-to-Heal Fields (Auto-repair without human review)**
- Navigation links and buttons: text-based or aria-label selectors  
- Text-based form labels and placeholder text  
- Confirmation message containers  

### **Requires Human Review Before Healing**
- Account number dropdowns (financial data — any change needs sign-off)  
- Submit / Transfer / Pay buttons on financial forms  
- Any selector that triggers an irreversible financial transaction  

---

### **Healing Procedure – Always Follow This Order**
1. Run the failing test — capture the exact broken selector from the error output  
2. Navigate to the live page via MCP — do **NOT** guess the replacement  
3. Inspect the live DOM — find the element the test was trying to target  
4. Confirm the replacement selector resolves correctly before patching  
5. Patch the locator in the Page Object file (not in the spec directly)  
6. Re-run **ONLY** the previously failing test first — confirm it passes  
7. Re-run the full suite — confirm no regressions  
8. Write an audit log entry (see format below)  

---

### **Audit Log Format – Required After Every Heal**
Save to: `/test-results/heal-log.md`

**Entry format:**

```
## Heal – [Date] [Feature] [Test ID]
**Broken selector:** `input[id="amount-field"]`
**Correct selector:** `input[id="amount"]`
**Detected in:** pages/transfer-funds.page.ts, line 15
**Live DOM source:** http://localhost:8080/parabank/transfer.htm
**Tests affected:** TC-001, TC-002, TC-003 (all tests using amountInput)
**Re-validation:** All 10 tests passed after patch
**Risk level:** Medium – amount field (flagged for awareness, auto-healed)
**Healed by:** Playwright Healer Agent via MCP
```

---

### **What NOT to Do During Healing**
- Never patch the selector before verifying it exists in the live DOM  
- Never heal a financial field without logging it, even if auto-healing is permitted  
- Never run only the fixed test without re-running the full suite for regressions  
- Never delete a test that is failing — investigate and heal or flag  

---