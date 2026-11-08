
---

## 🧩 **Excel Test Management Standards**

### **File Ownership Rule – One Workbook Per Feature**
- Each feature gets **one workbook**: `test-cases/<FeatureName>_TestCases.xlsx`.  
- Never let two teammates edit the same workbook simultaneously.  
- The workflow chain (analyst → author → automation → execution → traceability) ensures serialized writes within a feature file.  
- If multiple stories are active, each gets its own workbook.  
- The **traceability-agent** is the only role allowed to read across multiple workbooks after upstream work is complete.

### **Library**
- Use `exceljs` via `utils/excel-helper.js` — never write workbooks any other way.  
- Never manually edit `.xlsx` files — they are binary zip formats and can corrupt.

### **Helper Commands (one per role)**
| Role | Command | Writes |
|------|---------|--------|
| Any | `node utils/excel-helper.js init <feature>` | Creates the workbook with all 3 sheets |
| Test Author | `node utils/excel-helper.js add-cases <feature> <cases.json>` | TestCases A–J (insert or update by Test Case ID) |
| Automation Engineer | `node utils/excel-helper.js automation <feature> <automation.json>` | TestCases K–L |
| Execution Sync | `node utils/excel-helper.js sync <feature> <report.json>` | TestCases M–O + Defects rows |
| Traceability | `node utils/excel-helper.js trace <feature> [story-titles.json]` | Traceability sheet |
| Any | `node utils/excel-helper.js list <feature>` | Read-only |

- `cases.json`: array of `{ id, storyId, title, priority, type, preconditions, steps, testData, expectedResult, automatable }` (`steps` may be an array; `testData` may be an object).  
- `automation.json`: array of `{ id, automationStatus, specFile }` (Script Reference becomes `<specFile>::<id>`), or pass `scriptRef` directly.  
- `report.json`: generate with `PLAYWRIGHT_JSON_OUTPUT_NAME=test-results/results.json npx playwright test tests/<feature>.spec.ts --project=chromium --workers=1 --reporter=json`.  
- `sync` exits with code 2 and lists any unmatched titles or unknown Test Case IDs — report these to the lead.  
- Defect IDs are `DEF-<FEATURE>-NNN`. A re-failure of a test with an existing **Open** defect updates that defect instead of logging a duplicate.

---

### **Sheet: TestCases – Column Schema (fixed order, do not rename)**

| Column | Field | Allowed Values |
|---------|--------|----------------|
| A | Test Case ID | `TC-<FEATURE>-NNN` |
| B | User Story ID | `US-<FEATURE>-NN` |
| C | Title | Free text |
| D | Priority | P1 / P2 / P3 |
| E | Type | Positive / Negative / Boundary / Security |
| F | Preconditions | Free text |
| G | Test Steps | Numbered free text |
| H | Test Data | Inline key=value pairs |
| I | Expected Result | Free text — must be specific |
| J | Automatable | Yes / No |
| K | Automation Status | Not Started / In Progress / Automated |
| L | Script Reference | `<spec file>::<Test Case ID>` |
| M | Execution Status | Not Run / Pass / Fail / Blocked |
| N | Last Executed | ISO date |
| O | Defect ID | Link to Defects sheet or blank |
| P | Comments | Free text |

---

### **Sheet: Defects – Column Schema**
`Defect ID | Test Case ID | Summary | Severity | Steps to Reproduce | Screenshot Path | Status (Open/Fixed) | Logged Date`

---

### **Sheet: Traceability – Column Schema**
`User Story ID | User Story Title | Total Test Cases | Automated | Automated % | Passed | Failed | Not Run | Pass % | Coverage Status | Risk Flag`

---

### **Join Key Rule**
- Every Playwright test title must begin with its **Test Case ID** exactly as written in column A.  
  Example:  
  ```js
  test('TC-BP-004 | Account # and Verify Account # mismatch rejected', ...)
  ```
- This ensures reliable mapping between JSON test results and Excel rows.

---

### **Update Rules**
- **Test Author:** Writes columns A–J only. Leave K–P blank.  
- **Automation Engineer:** Writes columns K (Automation Status) and L (Script Reference) only.  
- **Execution Sync:** Writes columns M (Execution Status), N (Last Executed), and O (Defect ID). Also logs new rows in Defects sheet for any fail.  
- **Traceability Agent:** Writes only to the Traceability sheet — never edits TestCases or Defects rows.

---