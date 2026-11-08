
---

# **Generate Playwright Tests**

1. Load the agent defined in `agents/playwright-automation-agent.md`.  
2. Read `CLAUDE.md` for automation standards before starting.

**Feature to automate:** `$ARGUMENTS`

---

## **Phase 1 – Exploration (Playwright Planner Agent)**

Use the Playwright Planner agent with the MCP browser to:

1. Load `playwright-automation-standards.md` — apply locator rules throughout.  
2. Load `banking-qa-knowledge.md` — apply domain knowledge to test scenarios.  
3. Navigate to the application and log in using provided credentials.  
4. Navigate to the feature page for: `$ARGUMENTS`.  
5. Explore the feature completely — all form fields, dropdowns, buttons, flows.  
6. Explore both the success state and error/validation states.  
7. Produce a structured test plan:
   - All test scenarios for: `$ARGUMENTS`.  
   - Step-by-step actions per scenario.  
   - Expected outcomes per scenario.  
   - All selectors observed in the live DOM during exploration.

---

## **Phase 2 – Script Generation (Playwright Generator Agent)**

Using the test plan and live selectors from Phase 1:

8. Generate a Page Object Model class for the feature.  
9. Generate a complete Playwright TypeScript spec file covering all scenarios.  
10. Apply `CLAUDE.md` financial policies to every assertion (no generic checks).  
11. Add `screenshot-on-failure` `afterEach` hook.  
12. Externalize all credentials, amounts, and account values to a JSON test data file.

---

## **Phase 3 – Healing (Playwright Healer Agent)**

After running the generated tests:  
13. If all tests pass — report success, no healing needed  
14. If any tests fail:  
   - Use the Playwright Healer agent via MCP to detect the failing assertion  
   - Navigate to the live page and inspect the current DOM  
   - Produce a diff: broken selector vs. live DOM selector  
   - Apply healing rules from `playwright-automation-standards.md`  
   - Patch safe-to-heal locators in the Page Object file  
   - Flag financial-field locators for human review without auto-patching  
   - Re-run the full test suite to confirm all tests pass  
   - Save heal audit log to: `/test-results/heal-log.md`

---

## **Credentials and Base URL**

Read from the `.env` file at the project root:  
- `APP_BASE_URL` — the application base URL  
- `APP_USERNAME` — login username  
- `APP_PASSWORD` — login password  

---

## **Output Files**

- Save spec file to: `/tests/<feature-name>.spec.ts`  
- Save Page Object to: `/pages/<feature-name>.page.ts`  
- Save test data to: `/test-data/<feature-name>.json`

---