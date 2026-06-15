# AI Usage Log (AI_USAGE.md)

This document logs the AI tools, prompts, incorrect outputs, and correction strategies utilized during the development of the Spreetail Shared Expenses application.

---

## 1. AI Tools & Prompts Used

* **AI Tool**: Gemini 3.5 Flash (Medium) via Antigravity Coding Agent.
* **Core Prompts**:
  1. *Prompt*: "Generate a complete relational database design using Prisma with models for User, Group, GroupMember, Expense, ExpenseShare, Settlement, and ImportAnomaly to support the Spreetail Shared Expenses Assignment."
  2. *Prompt*: "Implement an anomaly service in Express that detects duplicates, ambiguous dates, negative amounts, split conflicts, and timeline violations."
  3. *Prompt*: "Create a greedy min-flow settlement suggester and write unit tests for the balance calculation engine."

---

## 2. Incorrect AI Outputs, Detection & Corrections

### Incorrect Output 1: Invalid ES Module Mocking Syntax in Jest
* **Description**: The AI initially generated standard CommonJS mock syntax `jest.mock('../../prisma.js', () => ({ ... }))` in the test files.
* **How Detected**: The test suite threw `ReferenceError: jest is not defined` and `prisma.user.findMany.mockResolvedValue is not a function` because standard mocks are not hoisted in Node.js ESM mode (`"type": "module"`), causing the imports to evaluate before `jest.mock` ran.
* **How Corrected**:
  1. Imported `jest`, `describe`, `test`, `expect`, and `beforeEach` directly from `@jest/globals`.
  2. Substituted the static `jest.mock` block with runtime spies: `jest.spyOn(prisma.user, 'findMany').mockResolvedValue(...)`. Spies intercept calls at execution time, completely bypassing ESM hoisting conflicts.

### Incorrect Output 2: Missing Expense Check in Percentage Splits Test
* **Description**: In the percentage splits unit test inside `anomalyService.test.js`, the AI mocked `user.findMany` and `groupMember.findMany` but did not mock `expense.findMany`.
* **How Detected**: The test suite failed with `PrismaClientInitializationError: Can't reach database server at localhost:5432` during the percentage test. This occurred because `paidByUserId` and `expenseDate` were evaluated as true, causing the code to run the duplicate checker which triggered the un-mocked `prisma.expense.findMany` database query.
* **How Corrected**: Added a global spy on `prisma.expense.findMany` inside the `beforeEach` hook of `anomalyService.test.js` to return an empty array `[]` by default, ensuring no test will hit the real database server.

### Incorrect Output 3: Ambiguous Date Resolution Defaults
* **Description**: In the first date-parser draft, the AI attempted to guess the date format for ambiguous strings (like `04/05/2026`) using JS `Date.parse()` which defaulted to May 4th, violating the business rule: "Do not guess. Require manual review."
* **How Detected**: Code review of `parseDateString` revealed that ambiguous inputs were resolved automatically without triggering the `isAmbiguous` flag.
* **How Corrected**: Rewrote `parseDateString` with a regex-based parser that explicitly flags any numeric date where both components are $\le 12$ as ambiguous (`isAmbiguous: true`, `needsReview: true`), forcing it to go to the manual review dashboard.

### Incorrect Output 4: Un-validated Anomaly Date/Payer Correction
* **Description**: The AI initially built the `resolveAnomaly` endpoint to overwrite the date or payer ID directly without checking if the new date/payer violated group membership timelines.
* **How Detected**: Code review of `resolveAnomaly` in `importController.js` revealed that correcting the date of an expense to a time when a split participant was inactive bypassed timeline validations.
* **How Corrected**: Integrated `checkMemberActiveOnDate` timeline validation directly inside `resolveAnomaly` to reject any corrections that violate membership constraints with a `400 Bad Request` code.

