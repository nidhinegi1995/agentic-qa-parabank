/**
 * Excel Test Management Helper
 * ----------------------------------------------------------------------------
 * Single utility for maintaining feature test-case workbooks, as defined in
 * .claude/skills/excel-test-management.md.
 *
 *   Workbook : test-cases/<FeatureName>_TestCases.xlsx  (one per feature)
 *   Sheets   : TestCases | Defects | Traceability
 *
 * Every write function is bound to one agent role and can only touch the
 * columns that role owns:
 *
 *   Role                 Function              Writes
 *   -------------------  --------------------  -------------------------------
 *   test-author          upsertTestCases()     TestCases A–J
 *   automation-engineer  updateAutomation()    TestCases K–L
 *   execution-sync       syncExecution()       TestCases M–O + Defects rows
 *   traceability         buildTraceability()   Traceability sheet only
 *
 * CLI (see printUsage() at the bottom):
 *   node utils/excel-helper.js init        <feature>
 *   node utils/excel-helper.js add-cases   <feature> <cases.json>
 *   node utils/excel-helper.js automation  <feature> <automation.json>
 *   node utils/excel-helper.js sync        <feature> <playwright-report.json>
 *   node utils/excel-helper.js trace       <feature> [story-titles.json]
 *   node utils/excel-helper.js list        <feature>
 */

'use strict';

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

// ---------------------------------------------------------------------------
// Schema (fixed order — do not rename; mirrors excel-test-management.md)
// ---------------------------------------------------------------------------

const TEST_CASE_COLUMNS = [
  { key: 'id', header: 'Test Case ID', width: 16 },               // A
  { key: 'storyId', header: 'User Story ID', width: 15 },         // B
  { key: 'title', header: 'Title', width: 40 },                   // C
  { key: 'priority', header: 'Priority', width: 10 },             // D
  { key: 'type', header: 'Type', width: 12 },                     // E
  { key: 'preconditions', header: 'Preconditions', width: 35 },   // F
  { key: 'steps', header: 'Test Steps', width: 50 },              // G
  { key: 'testData', header: 'Test Data', width: 30 },            // H
  { key: 'expectedResult', header: 'Expected Result', width: 45 },// I
  { key: 'automatable', header: 'Automatable', width: 13 },       // J
  { key: 'automationStatus', header: 'Automation Status', width: 18 }, // K
  { key: 'scriptRef', header: 'Script Reference', width: 40 },    // L
  { key: 'executionStatus', header: 'Execution Status', width: 17 },   // M
  { key: 'lastExecuted', header: 'Last Executed', width: 14 },    // N
  { key: 'defectId', header: 'Defect ID', width: 14 },            // O
  { key: 'comments', header: 'Comments', width: 35 },             // P
];

const DEFECT_COLUMNS = [
  { key: 'defectId', header: 'Defect ID', width: 14 },
  { key: 'testCaseId', header: 'Test Case ID', width: 16 },
  { key: 'summary', header: 'Summary', width: 60 },
  { key: 'severity', header: 'Severity', width: 11 },
  { key: 'stepsToReproduce', header: 'Steps to Reproduce', width: 50 },
  { key: 'screenshotPath', header: 'Screenshot Path', width: 45 },
  { key: 'status', header: 'Status', width: 10 },
  { key: 'loggedDate', header: 'Logged Date', width: 13 },
];

const TRACE_COLUMNS = [
  { key: 'storyId', header: 'User Story ID', width: 15 },
  { key: 'storyTitle', header: 'User Story Title', width: 40 },
  { key: 'total', header: 'Total Test Cases', width: 16 },
  { key: 'automated', header: 'Automated', width: 11 },
  { key: 'automatedPct', header: 'Automated %', width: 12 },
  { key: 'passed', header: 'Passed', width: 9 },
  { key: 'failed', header: 'Failed', width: 9 },
  { key: 'notRun', header: 'Not Run', width: 9 },
  { key: 'passPct', header: 'Pass %', width: 9 },
  { key: 'coverageStatus', header: 'Coverage Status', width: 16 },
  { key: 'riskFlag', header: 'Risk Flag', width: 10 },
];

const SHEETS = {
  testCases: 'TestCases',
  defects: 'Defects',
  traceability: 'Traceability',
};

const ALLOWED = {
  priority: ['P1', 'P2', 'P3'],
  type: ['Positive', 'Negative', 'Boundary', 'Security'],
  automatable: ['Yes', 'No'],
  automationStatus: ['Not Started', 'In Progress', 'Automated'],
  executionStatus: ['Not Run', 'Pass', 'Fail', 'Blocked'],
  defectStatus: ['Open', 'Fixed'],
};

const TC_ID_PATTERN = /^TC-[A-Z0-9]+-\d{3}$/;
const STORY_ID_PATTERN = /^US-[A-Z0-9]+-\d{2}$/;
const TITLE_ID_PATTERN = /^\s*(TC-[A-Z0-9]+-\d{3})\s*\|/; // Join Key Rule

const SEVERITY_BY_PRIORITY = { P1: 'Critical', P2: 'Major', P3: 'Minor' };

/** Column numbers (1-based) owned by each role. */
const ROLE_COLUMNS = {
  author: range(1, 10),     // A–J
  automation: [11, 12],     // K–L
  execution: [13, 14, 15],  // M–O
};

const DEFAULT_DIR = path.resolve(__dirname, '..', 'test-cases');
const VALIDATION_ROWS = 1000;

// ---------------------------------------------------------------------------
// Workbook location & lifecycle
// ---------------------------------------------------------------------------

/** "transfer-funds" | "transfer funds" | "TransferFunds" -> "TransferFunds" */
function toFeatureName(feature) {
  if (!feature || !String(feature).trim()) throw new Error('Feature name is required.');
  const parts = String(feature).trim().split(/[\s_\-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('');
}

function workbookPath(feature, dir = DEFAULT_DIR) {
  return path.join(dir, `${toFeatureName(feature)}_TestCases.xlsx`);
}

/** Opens the feature workbook, creating it (with all three sheets) if missing. */
async function openWorkbook(feature, dir = DEFAULT_DIR) {
  const file = workbookPath(feature, dir);
  const wb = new ExcelJS.Workbook();
  if (fs.existsSync(file)) {
    await wb.xlsx.readFile(file);
  } else {
    wb.creator = 'excel-helper';
    wb.created = new Date();
  }
  ensureSheet(wb, SHEETS.testCases, TEST_CASE_COLUMNS);
  ensureSheet(wb, SHEETS.defects, DEFECT_COLUMNS);
  ensureSheet(wb, SHEETS.traceability, TRACE_COLUMNS);
  return { wb, file };
}

async function saveWorkbook(wb, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  applyValidations(wb);
  try {
    await wb.xlsx.writeFile(file);
  } catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') {
      throw new Error(`Cannot write ${file} — close it in Excel and retry.`);
    }
    throw err;
  }
}

/** Creates the workbook with empty, formatted sheets. Safe to re-run. */
async function initWorkbook(feature, dir = DEFAULT_DIR) {
  const { wb, file } = await openWorkbook(feature, dir);
  await saveWorkbook(wb, file);
  return file;
}

function ensureSheet(wb, name, columns) {
  let ws = wb.getWorksheet(name);
  if (!ws) ws = wb.addWorksheet(name);

  const header = ws.getRow(1);
  columns.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    const current = cellText(cell);
    if (current && current !== col.header) {
      throw new Error(
        `Sheet "${name}" column ${colLetter(i + 1)} is "${current}", expected "${col.header}". ` +
        'The schema is fixed — fix the header before writing.'
      );
    }
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder();
    ws.getColumn(i + 1).width = col.width;
  });
  header.height = 30;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

function applyValidations(wb) {
  const tc = wb.getWorksheet(SHEETS.testCases);
  const list = (values) => ({
    type: 'list',
    allowBlank: true,
    showErrorMessage: true,
    errorTitle: 'Invalid value',
    error: `Allowed: ${values.join(', ')}`,
    formulae: [`"${values.join(',')}"`],
  });
  const last = VALIDATION_ROWS;
  tc.dataValidations.add(`D2:D${last}`, list(ALLOWED.priority));
  tc.dataValidations.add(`E2:E${last}`, list(ALLOWED.type));
  tc.dataValidations.add(`J2:J${last}`, list(ALLOWED.automatable));
  tc.dataValidations.add(`K2:K${last}`, list(ALLOWED.automationStatus));
  tc.dataValidations.add(`M2:M${last}`, list(ALLOWED.executionStatus));

  const def = wb.getWorksheet(SHEETS.defects);
  def.dataValidations.add(`G2:G${last}`, list(ALLOWED.defectStatus));
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Returns all TestCases rows as plain objects (keys from TEST_CASE_COLUMNS). */
async function readTestCases(feature, dir = DEFAULT_DIR) {
  const { wb } = await openWorkbook(feature, dir);
  return sheetToObjects(wb.getWorksheet(SHEETS.testCases), TEST_CASE_COLUMNS);
}

async function readDefects(feature, dir = DEFAULT_DIR) {
  const { wb } = await openWorkbook(feature, dir);
  return sheetToObjects(wb.getWorksheet(SHEETS.defects), DEFECT_COLUMNS);
}

function sheetToObjects(ws, columns) {
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj = { _row: rowNumber };
    columns.forEach((col, i) => { obj[col.key] = cellText(row.getCell(i + 1)); });
    if (obj[columns[0].key]) rows.push(obj);
  });
  return rows;
}

/** Map of Test Case ID -> row number in the TestCases sheet. */
function indexById(ws) {
  const index = new Map();
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const id = cellText(row.getCell(1));
    if (id) index.set(id, rowNumber);
  });
  return index;
}

// ---------------------------------------------------------------------------
// Role 1 — Test Author: columns A–J
// ---------------------------------------------------------------------------

/**
 * Inserts new test cases or updates existing ones (matched on Test Case ID).
 * Only columns A–J are written; K–P are never touched.
 *
 * @param {string} feature
 * @param {Array<object>} cases  { id, storyId, title, priority, type,
 *   preconditions, steps (string | string[]), testData (string | object),
 *   expectedResult, automatable }
 * @returns {{ file, inserted: string[], updated: string[] }}
 */
async function upsertTestCases(feature, cases, dir = DEFAULT_DIR) {
  if (!Array.isArray(cases) || cases.length === 0) throw new Error('No test cases supplied.');

  const normalized = cases.map(normalizeTestCase);
  const errors = normalized.flatMap(validateTestCase);
  const dupes = findDuplicates(normalized.map((c) => c.id));
  dupes.forEach((id) => errors.push(`${id}: duplicated in input`));
  if (errors.length) throw new Error(`Test case validation failed:\n  - ${errors.join('\n  - ')}`);

  const { wb, file } = await openWorkbook(feature, dir);
  const ws = wb.getWorksheet(SHEETS.testCases);
  const index = indexById(ws);
  const inserted = [];
  const updated = [];

  for (const tc of normalized) {
    let rowNumber = index.get(tc.id);
    if (rowNumber) {
      updated.push(tc.id);
    } else {
      rowNumber = ws.rowCount + 1;
      index.set(tc.id, rowNumber);
      inserted.push(tc.id);
    }
    writeColumns(ws.getRow(rowNumber), ROLE_COLUMNS.author, tc);
    styleDataRow(ws.getRow(rowNumber), TEST_CASE_COLUMNS.length);
  }

  await saveWorkbook(wb, file);
  return { file, inserted, updated };
}

function normalizeTestCase(raw) {
  const steps = Array.isArray(raw.steps)
    ? raw.steps.map((s, i) => (/^\s*\d+[.)]/.test(s) ? s : `${i + 1}. ${s}`)).join('\n')
    : raw.steps;
  const testData = raw.testData && typeof raw.testData === 'object'
    ? Object.entries(raw.testData).map(([k, v]) => `${k}=${v}`).join('; ')
    : raw.testData;
  return {
    id: str(raw.id),
    storyId: str(raw.storyId),
    title: str(raw.title),
    priority: str(raw.priority).toUpperCase(),
    type: titleCase(str(raw.type)),
    preconditions: str(raw.preconditions),
    steps: str(steps),
    testData: str(testData),
    expectedResult: str(raw.expectedResult),
    automatable: titleCase(str(raw.automatable)),
  };
}

function validateTestCase(tc) {
  const e = [];
  const label = tc.id || '(missing id)';
  if (!TC_ID_PATTERN.test(tc.id)) e.push(`${label}: Test Case ID must match TC-<FEATURE>-NNN`);
  if (!STORY_ID_PATTERN.test(tc.storyId)) e.push(`${label}: User Story ID must match US-<FEATURE>-NN`);
  if (!tc.title) e.push(`${label}: Title is required`);
  if (!ALLOWED.priority.includes(tc.priority)) e.push(`${label}: Priority must be ${ALLOWED.priority.join('/')}`);
  if (!ALLOWED.type.includes(tc.type)) e.push(`${label}: Type must be ${ALLOWED.type.join('/')}`);
  if (!tc.steps) e.push(`${label}: Test Steps are required`);
  if (!tc.expectedResult) e.push(`${label}: Expected Result is required`);
  if (!ALLOWED.automatable.includes(tc.automatable)) e.push(`${label}: Automatable must be Yes/No`);
  return e;
}

// ---------------------------------------------------------------------------
// Role 2 — Automation Engineer: columns K–L
// ---------------------------------------------------------------------------

/**
 * @param {Array<{id, automationStatus, scriptRef}>} updates
 *   scriptRef may be omitted; with `specFile` it defaults to "<specFile>::<id>".
 * @returns {{ file, updated: string[], notFound: string[] }}
 */
async function updateAutomation(feature, updates, dir = DEFAULT_DIR) {
  if (!Array.isArray(updates) || updates.length === 0) throw new Error('No automation updates supplied.');

  const errors = [];
  const normalized = updates.map((u) => {
    const id = str(u.id);
    const automationStatus = str(u.automationStatus) || 'Automated';
    const scriptRef = str(u.scriptRef) || (u.specFile ? `${u.specFile}::${id}` : '');
    if (!ALLOWED.automationStatus.includes(automationStatus)) {
      errors.push(`${id}: Automation Status must be ${ALLOWED.automationStatus.join('/')}`);
    }
    if (automationStatus === 'Automated' && !/::TC-[A-Z0-9]+-\d{3}$/.test(scriptRef)) {
      errors.push(`${id}: Script Reference must be "<spec file>::<Test Case ID>" when Automated`);
    }
    return { id, automationStatus, scriptRef };
  });
  if (errors.length) throw new Error(`Automation update validation failed:\n  - ${errors.join('\n  - ')}`);

  const { wb, file } = await openWorkbook(feature, dir);
  const ws = wb.getWorksheet(SHEETS.testCases);
  const index = indexById(ws);
  const updated = [];
  const notFound = [];

  for (const u of normalized) {
    const rowNumber = index.get(u.id);
    if (!rowNumber) { notFound.push(u.id); continue; }
    writeColumns(ws.getRow(rowNumber), ROLE_COLUMNS.automation, u);
    updated.push(u.id);
  }

  await saveWorkbook(wb, file);
  return { file, updated, notFound };
}

// ---------------------------------------------------------------------------
// Role 3 — Execution Sync: columns M–O + Defects sheet
// ---------------------------------------------------------------------------

/**
 * Reads a Playwright JSON report and writes results onto the matching rows.
 *
 * Generate the report with:
 *   PLAYWRIGHT_JSON_OUTPUT_NAME=test-results/results.json \
 *     npx playwright test tests/<feature>.spec.ts --project=chromium --workers=1 --reporter=json
 *
 * @param {string} feature
 * @param {string|object} report  path to the JSON report, or the parsed object
 * @param {{ date?: string }} [options]  date defaults to today (YYYY-MM-DD)
 * @returns {{ file, updated, defectsLogged, unmatchedTitles, unknownIds }}
 *   `unmatchedTitles` — results without a "TC-XXX-NNN |" prefix
 *   `unknownIds`      — prefixed IDs that have no row in TestCases
 *   Both must be reported to the lead (never silently dropped).
 */
async function syncExecution(feature, report, options = {}, dir = DEFAULT_DIR) {
  const json = typeof report === 'string' ? JSON.parse(fs.readFileSync(report, 'utf8')) : report;
  const date = options.date || isoDate(new Date());
  const results = collectResults(json);

  const { wb, file } = await openWorkbook(feature, dir);
  const tcSheet = wb.getWorksheet(SHEETS.testCases);
  const defSheet = wb.getWorksheet(SHEETS.defects);
  const index = indexById(tcSheet);
  const defects = sheetToObjects(defSheet, DEFECT_COLUMNS);

  const updated = [];
  const defectsLogged = [];
  const unmatchedTitles = [];
  const unknownIds = [];

  // One status per Test Case ID; if the same ID appears more than once
  // (e.g. multiple projects), the worst outcome wins.
  const byId = new Map();
  for (const r of results) {
    const match = r.title.match(TITLE_ID_PATTERN);
    if (!match) { unmatchedTitles.push(r.fullTitle); continue; }
    const id = match[1];
    const prev = byId.get(id);
    if (!prev || severityRank(r.status) > severityRank(prev.status)) byId.set(id, r);
  }

  for (const [id, r] of byId) {
    const rowNumber = index.get(id);
    if (!rowNumber) { unknownIds.push(id); continue; }
    const row = tcSheet.getRow(rowNumber);
    const values = { executionStatus: r.status, lastExecuted: date, defectId: cellText(row.getCell(15)) };

    if (r.status === 'Fail') {
      const priority = cellText(row.getCell(4));
      const open = defects.find((d) => d.testCaseId === id && d.status === 'Open');
      if (open) {
        // Re-failure of a known open defect: refresh it instead of duplicating.
        const dRow = defSheet.getRow(open._row);
        dRow.getCell(3).value = r.errorSummary;
        if (r.screenshot) dRow.getCell(6).value = r.screenshot;
        values.defectId = open.defectId;
      } else {
        const defect = {
          defectId: nextDefectId(id, defects),
          testCaseId: id,
          summary: r.errorSummary,
          severity: SEVERITY_BY_PRIORITY[priority] || 'Major',
          stepsToReproduce: cellText(row.getCell(7)),
          screenshotPath: r.screenshot || '',
          status: 'Open',
          loggedDate: date,
        };
        const dRowNumber = defSheet.rowCount + 1;
        writeColumns(defSheet.getRow(dRowNumber), range(1, DEFECT_COLUMNS.length), defect, DEFECT_COLUMNS);
        styleDataRow(defSheet.getRow(dRowNumber), DEFECT_COLUMNS.length);
        defects.push({ ...defect, _row: dRowNumber });
        defectsLogged.push(defect.defectId);
        values.defectId = defect.defectId;
      }
    }

    writeColumns(row, ROLE_COLUMNS.execution, values);
    colorStatusCell(row.getCell(13), r.status);
    updated.push(`${id}=${r.status}`);
  }

  await saveWorkbook(wb, file);
  return { file, updated, defectsLogged, unmatchedTitles, unknownIds };
}

/** Flattens a Playwright JSON report into { title, fullTitle, status, errorSummary, screenshot }. */
function collectResults(json) {
  const out = [];
  const walk = (suite, parents) => {
    const trail = suite.title ? [...parents, suite.title] : parents;
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const results = test.results || [];
        const last = results[results.length - 1] || {};
        const status = mapStatus(last.status, test.status);
        const shot = (last.attachments || []).find((a) => a.contentType === 'image/png' && a.path);
        out.push({
          title: spec.title,
          fullTitle: [...trail, spec.title].join(' › ') + (test.projectName ? ` [${test.projectName}]` : ''),
          status,
          errorSummary: summarizeError(last.error || (last.errors || [])[0]),
          screenshot: shot ? path.relative(process.cwd(), shot.path) : '',
        });
      }
    }
    for (const child of suite.suites || []) walk(child, trail);
  };
  for (const suite of json.suites || []) walk(suite, []);
  return out;
}

function mapStatus(resultStatus, testStatus) {
  if (testStatus === 'skipped' || resultStatus === 'skipped') return 'Blocked';
  switch (resultStatus) {
    case 'passed': return 'Pass';
    case 'failed':
    case 'timedOut': return 'Fail';
    case 'interrupted': return 'Blocked';
    default: return 'Not Run';
  }
}

function severityRank(status) {
  return { 'Not Run': 0, Pass: 1, Blocked: 2, Fail: 3 }[status] ?? 0;
}

function summarizeError(error) {
  if (!error) return 'Test failed (no error message captured)';
  const message = stripAnsi(error.message || error.value || String(error));
  const firstLines = message.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).join(' ');
  return firstLines.length > 500 ? `${firstLines.slice(0, 497)}...` : firstLines;
}

/** DEF-<FEATURE>-NNN, numbered per feature code taken from the Test Case ID. */
function nextDefectId(testCaseId, defects) {
  const code = testCaseId.split('-')[1];
  const prefix = `DEF-${code}-`;
  const max = defects
    .map((d) => d.defectId)
    .filter((d) => d && d.startsWith(prefix))
    .map((d) => parseInt(d.slice(prefix.length), 10) || 0)
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// Role 4 — Traceability: Traceability sheet only (TestCases/Defects read-only)
// ---------------------------------------------------------------------------

/**
 * Rebuilds the Traceability sheet, one row per User Story ID.
 *
 * Coverage Status (per story, at test-case level):
 *   Full    — every test case is Automated and its last run Passed
 *   Partial — at least one test case is Automated, but not all are passing
 *   None    — no Automated test cases
 * Risk Flag:
 *   Red     — any P1 test failed
 *   Yellow  — any P2 test failed, or any test not run
 *   Green   — otherwise
 *
 * @param {Record<string,string>} [storyTitles]  { "US-TF-01": "Transfer funds between own accounts" }
 *   Titles already present in the sheet are kept when not supplied.
 */
async function buildTraceability(feature, storyTitles = {}, dir = DEFAULT_DIR) {
  const { wb, file } = await openWorkbook(feature, dir);
  const cases = sheetToObjects(wb.getWorksheet(SHEETS.testCases), TEST_CASE_COLUMNS);
  const ws = wb.getWorksheet(SHEETS.traceability);

  const existingTitles = {};
  sheetToObjects(ws, TRACE_COLUMNS).forEach((r) => { existingTitles[r.storyId] = r.storyTitle; });

  const byStory = new Map();
  for (const tc of cases) {
    const key = tc.storyId || '(no story)';
    if (!byStory.has(key)) byStory.set(key, []);
    byStory.get(key).push(tc);
  }

  const rows = [...byStory.keys()].sort().map((storyId) => {
    const list = byStory.get(storyId);
    const total = list.length;
    const automated = list.filter((t) => t.automationStatus === 'Automated').length;
    const passed = list.filter((t) => t.executionStatus === 'Pass').length;
    const failed = list.filter((t) => t.executionStatus === 'Fail').length;
    const notRun = list.filter((t) => !t.executionStatus || t.executionStatus === 'Not Run').length;
    const automatedPassing = list.filter((t) => t.automationStatus === 'Automated' && t.executionStatus === 'Pass').length;

    let coverageStatus = 'None';
    if (automated > 0) coverageStatus = automatedPassing === total ? 'Full' : 'Partial';

    let riskFlag = 'Green';
    if (list.some((t) => t.priority === 'P1' && t.executionStatus === 'Fail')) riskFlag = 'Red';
    else if (notRun > 0 || list.some((t) => t.priority === 'P2' && t.executionStatus === 'Fail')) riskFlag = 'Yellow';

    return {
      storyId,
      storyTitle: storyTitles[storyId] || existingTitles[storyId] || '',
      total,
      automated,
      automatedPct: total ? automated / total : 0,
      passed,
      failed,
      notRun,
      passPct: total ? passed / total : 0,
      coverageStatus,
      riskFlag,
    };
  });

  // Clear previous data rows, keep header.
  if (ws.rowCount > 1) ws.spliceRows(2, ws.rowCount - 1);

  rows.forEach((r, i) => {
    const row = ws.getRow(i + 2);
    TRACE_COLUMNS.forEach((col, c) => { row.getCell(c + 1).value = r[col.key]; });
    row.getCell(5).numFmt = '0%';
    row.getCell(9).numFmt = '0%';
    styleDataRow(row, TRACE_COLUMNS.length);
    colorRiskCell(row.getCell(11), r.riskFlag);
  });

  await saveWorkbook(wb, file);
  return { file, stories: rows };
}

// ---------------------------------------------------------------------------
// Cell helpers
// ---------------------------------------------------------------------------

function writeColumns(row, columnNumbers, values, columns = TEST_CASE_COLUMNS) {
  for (const n of columnNumbers) {
    const key = columns[n - 1].key;
    if (values[key] !== undefined) row.getCell(n).value = values[key] === '' ? null : values[key];
  }
}

function styleDataRow(row, count) {
  for (let i = 1; i <= count; i++) {
    const cell = row.getCell(i);
    cell.alignment = { vertical: 'top', wrapText: true };
    cell.border = thinBorder();
  }
}

function colorStatusCell(cell, status) {
  const argb = { Pass: 'FFC6EFCE', Fail: 'FFFFC7CE', Blocked: 'FFFFEB9C' }[status];
  cell.fill = argb ? { type: 'pattern', pattern: 'solid', fgColor: { argb } } : undefined;
}

function colorRiskCell(cell, flag) {
  const argb = { Green: 'FFC6EFCE', Yellow: 'FFFFEB9C', Red: 'FFFFC7CE' }[flag];
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  cell.font = { bold: true };
}

function thinBorder() {
  const side = { style: 'thin', color: { argb: 'FFBFBFBF' } };
  return { top: side, left: side, bottom: side, right: side };
}

/** Plain text of a cell regardless of rich text / hyperlink / formula / date. */
function cellText(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isoDate(v);
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('').trim();
    if (v.text !== undefined) return String(v.text).trim();
    if (v.result !== undefined) return String(v.result).trim();
  }
  return String(v).trim();
}

function str(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function titleCase(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s; }
function isoDate(d) { return d.toISOString().slice(0, 10); }
function colLetter(n) { return String.fromCharCode(64 + n); }
function range(a, b) { return Array.from({ length: b - a + 1 }, (_, i) => a + i); }
function stripAnsi(s) { return s.replace(/\u001b\[[0-9;]*m/g, ''); }
function findDuplicates(ids) { return ids.filter((id, i) => id && ids.indexOf(id) !== i); }

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function readJsonFile(p) {
  if (!p) throw new Error('A JSON file argument is required for this command.');
  return JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'));
}

function printUsage() {
  console.log(`Usage: node utils/excel-helper.js <command> <feature> [file]

Commands
  init        <feature>                       Create workbook with TestCases, Defects, Traceability sheets
  add-cases   <feature> <cases.json>          [test-author]   Insert/update columns A–J
  automation  <feature> <automation.json>     [automation]    Update columns K–L
  sync        <feature> <report.json>         [execution]     Write M–O from a Playwright JSON report, log Defects
  trace       <feature> [story-titles.json]   [traceability]  Rebuild the Traceability sheet
  list        <feature>                       Print the TestCases sheet

Workbook: test-cases/<FeatureName>_TestCases.xlsx  (e.g. transfer-funds -> TransferFunds_TestCases.xlsx)`);
}

async function main(argv) {
  const [command, feature, file] = argv;
  if (!command || command === 'help' || command === '--help') { printUsage(); return 0; }

  switch (command) {
    case 'init': {
      console.log(`Workbook ready: ${await initWorkbook(feature)}`);
      return 0;
    }
    case 'add-cases': {
      const data = readJsonFile(file);
      const r = await upsertTestCases(feature, Array.isArray(data) ? data : data.testCases);
      console.log(`${r.file}\n  inserted: ${r.inserted.length} ${r.inserted.join(', ')}\n  updated : ${r.updated.length} ${r.updated.join(', ')}`);
      return 0;
    }
    case 'automation': {
      const data = readJsonFile(file);
      const r = await updateAutomation(feature, Array.isArray(data) ? data : data.updates);
      console.log(`${r.file}\n  updated  : ${r.updated.length} ${r.updated.join(', ')}`);
      if (r.notFound.length) { console.error(`  NOT FOUND: ${r.notFound.join(', ')}`); return 2; }
      return 0;
    }
    case 'sync': {
      const r = await syncExecution(feature, path.resolve(file || ''));
      console.log(`${r.file}\n  updated       : ${r.updated.length} ${r.updated.join(', ')}\n  defects logged: ${r.defectsLogged.length} ${r.defectsLogged.join(', ')}`);
      let code = 0;
      if (r.unmatchedTitles.length) {
        console.error(`  UNMATCHED (no "TC-XXX-NNN |" title prefix) — report to lead:\n    ${r.unmatchedTitles.join('\n    ')}`);
        code = 2;
      }
      if (r.unknownIds.length) {
        console.error(`  UNKNOWN IDs (not in TestCases sheet) — report to lead: ${r.unknownIds.join(', ')}`);
        code = 2;
      }
      return code;
    }
    case 'trace': {
      const titles = file ? readJsonFile(file) : {};
      const r = await buildTraceability(feature, titles);
      console.log(r.file);
      console.table(r.stories.map((s) => ({
        story: s.storyId, total: s.total, automated: s.automated, passed: s.passed,
        failed: s.failed, notRun: s.notRun, coverage: s.coverageStatus, risk: s.riskFlag,
      })));
      return 0;
    }
    case 'list': {
      const rows = await readTestCases(feature);
      console.table(rows.map((r) => ({
        id: r.id, story: r.storyId, priority: r.priority, type: r.type,
        automation: r.automationStatus, execution: r.executionStatus, defect: r.defectId,
      })));
      return 0;
    }
    default:
      console.error(`Unknown command: ${command}\n`);
      printUsage();
      return 1;
  }
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => { process.exitCode = code; })
    .catch((err) => { console.error(`ERROR: ${err.message}`); process.exitCode = 1; });
}

module.exports = {
  // schema
  TEST_CASE_COLUMNS, DEFECT_COLUMNS, TRACE_COLUMNS, SHEETS, ALLOWED,
  // workbook
  toFeatureName, workbookPath, openWorkbook, initWorkbook,
  // read
  readTestCases, readDefects,
  // role-scoped writes
  upsertTestCases, updateAutomation, syncExecution, buildTraceability,
  // exposed for testing
  collectResults,
};
