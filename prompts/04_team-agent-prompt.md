
---

# **Agent Team Workflow – US-BILLPAY-01**

**Read** `CLAUDE.md` and `skills/excel-test-management.md` before starting.

---

## **User Story to Process**
**US-BILLPAY-01**

**Story:**  
As a ParaBank customer, I want to pay a bill from my account by entering payee details and an amount, so that I can settle payments without visiting a branch.

**Acceptance Criteria:**  
User enters Payee Name, Address, City, State, Zip Code, Phone #, Account #, Verify Account #, Amount, and selects From account #.  
Clicking **Send Payment** processes the payment and shows a confirmation.

**Feature URL:** `http://localhost:8080/parabank`  
**Login:** username `ficusroot2`, password `test@123`

---

## **Agent Team Setup**

Spawn an agent team with these five teammates.  
Spawn each teammate **only once its dependency has completed** — do **NOT** spawn all five up front.  
This prevents idle teammates from bootstrapping context before there is work for them to do, which is the main cost driver in a 5-teammate run.

---

### **1. Teammate: story-analyst**
**Spawn using:** `story-analyst-agent.md`  
**Task:** Analyze the US-BILLPAY-01 story for ambiguity, produce a clarified story.  
**Dependencies:** None — start immediately.

---

### **2. Teammate: test-author**
**Spawn using:** `test-author-agent.md`  
**Task:** Author Excel test cases from story-analyst’s clarified story.  
**Dependencies:** Blocked until story-analyst completes. Spawn only then.

---

### **3. Teammate: automation-engineer**
**Spawn using:** `playwright-automation-agent.md`  
**Task:** Automate every *Automatable = Yes* row via Playwright MCP (Planner → Generator → Healer).  
Title every test with its Test Case ID, update Automation Status + Script Reference.  
**Dependencies:** Blocked until test-author completes. Spawn only then.  

**Guardrail:**  
- For any boundary, negative-amount, or over-balance case, use the dedicated expendable account confirmed in pre-flight — never the funded account other cases depend on.  
- Run at most **one destructive probe per account per pass**, and re-read that account’s live balance via the API immediately before each probe rather than assuming remembered state.  
- If a probe result is ambiguous or a page stops loading correctly, **stop and report** rather than repeating the probe.

---

### **4. Teammate: execution-sync**
**Spawn using:** `execution-sync-agent.md`  
**Task:** Run the suite, write Pass/Fail back to Excel, log defects.  
**Dependencies:** Blocked until automation-engineer completes. Spawn only then.

---

### **5. Teammate: traceability-agent**
**Spawn using:** `traceability-agent.md`  
**Task:** Build the Traceability sheet row for this story.  
**Dependencies:** Blocked until execution-sync completes. Spawn only then.

---

## **Final Coordination**
Wait for all five tasks to reach **“completed”** before reporting back.  
**Synthesize:**  
- What each teammate produced  
- Any defects logged  
- Final coverage/risk status from the Traceability sheet

---
