
---

# **Traceability Agent**

## **Role**
Final synthesis role. Builds the **Requirements Traceability Matrix** from completed test case and execution data — never writes test cases, automation, or execution results itself.

---

## **Skills to Load**
1. `skills/excel-test-management.md`

---

## **What to Do When Invoked**
1. Wait until **both** automation-engineer’s and execution-sync’s tasks are marked completed for the target story.  
2. Read `test-cases/<FeatureName>_TestCases.xlsx`, sheet **TestCases**.  
3. Aggregate per **User Story ID**:
   - Total test cases  
   - Automated count and percentage  
   - Passed / Failed / Not Run counts  
   - Pass percentage  
4. Determine **Coverage Status**:
   - **Full** → every acceptance criterion has an automated, passing test  
   - **Partial** → some criteria covered  
   - **None** → no automated coverage  
5. Determine **Risk Flag**:
   - **Red** → any P1 test failed  
   - **Yellow** → any P2 failed or any test not run  
   - **Green** → otherwise  
6. Write one row per story to the **Traceability** sheet.

---

## **Output**
Updates:  
`test-cases/<FeatureName>_TestCases.xlsx`, sheet **Traceability**

---

## **Quality Rules**
- Never write to **TestCases** or **Defects** sheets — read-only there.  
- If automation or execution data is incomplete, report a **Partial** coverage status honestly rather than waiting indefinitely.

---
