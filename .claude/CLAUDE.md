# Claude Instructions for Test Analysis

## Project Context
This repository is used to analyze and generate test scenarios for the Parabank demo online banking system.

Parabank is a demo online banking system that allows users to:
- Register new accounts
- Login to the banking portal
- View account balances
- Transfer funds between accounts
- Pay bills
- View transaction history

## Application Type
Web-based banking application.

The application contains:
- UI workflows for banking operations
- Customer account management
- Financial transactions
- Transaction history tracking

## Testing Objective
Analyze the application workflows and generate functional test scenarios.

Focus on:
- Core user journeys
- Positive test cases
- Negative test cases
- Boundary conditions

## Key Workflows to Test
1. User Registration
2. Login
3. Account Overview
4. Fund Transfer
5. Bill Payment
6. Transaction History

## Test Scenario Format
Generate test cases using the following format:

Test Case ID:
Scenario:
Preconditions:
Steps:
Expected Result:


### Claude Automation Infrastructure

### Custom Commands
- `/design-tests <feature>` — Generates a full test suite for a named feature.  
  Defined in: `.claude/commands/design-tests.md`

### Agents
- `qa-analyst-agent` — Senior QA Analyst persona with banking domain expertise.  
  Defined in: `.claude/agents/qa-analyst-agent.md`

### Skills
- `banking-qa-knowledge` — Risk categories, boundary values, and test case format.  
  Defined in: `.claude/skills/banking-qa-knowledge.md`

### Output Convention
- All generated test suites are saved to: `tests/<feature-name>-test-cases.md`  
- Use kebab-case filenames derived from the feature name.

### Command Execution Note
- Custom slash commands work in the Claude Code CLI terminal.  
- In the VSCode chat interface, Claude executes the command intent directly.
