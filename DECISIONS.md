# Engineering Decisions Log (DECISIONS.md)

This log documents the major design choices made while architecting the Spreetail Shared Expenses application, their alternatives, and the rationales behind the final selections.

---

## 1. Database Model selection (Relational PostgreSQL vs Document Store)
* **Decision**: Implement a structured relational schema in PostgreSQL via Prisma ORM.
* **Alternatives Considered**: Document databases (MongoDB, Firestore).
* **Rationale**: 
  1. Relational databases enforce structural integrity via Foreign Key constraints. This is critical when linking users, groups, memberships, expenses, splits, and settlements.
  2. The SQL schema design ensures that deleting a user or group cascades or updates related transaction splits cleanly, avoiding dangling references.
  3. The assignment context explicitly requires a "Relational Database Only" stack.

---

## 2. Group Member Removal (Soft End-Date vs Hard Delete)
* **Decision**: Add a `leftAt` nullable timestamp to the `GroupMember` model to represent an ending timeline instead of deleting the member record.
* **Alternatives Considered**: Hard-deleting membership rows from `group_members`.
* **Rationale**:
  1. If Meera leaves the flat at the end of March, her historical split transactions in January, February, and March must remain in the database to maintain correct historical balances. Hard-deleting her membership row would break database references or skew historical totals.
  2. Utilizing `joinedAt` and `leftAt` allows the balance engine to reconstruct historical balances accurately based on the transaction date, while the expense creation controller uses it to restrict new splits to active members.

---

## 3. CSV Duplicate Transaction Policy (Auto-Delete vs User-in-the-Loop Approval)
* **Decision**: Import duplicate transactions with `needsReview = true` and `duplicateFlag = true`, log them in the anomalies table, and require manual user confirmation to approve or reject.
* **Alternatives Considered**: Auto-skipping or auto-deleting duplicate rows silently during CSV parsing.
* **Rationale**:
  1. In the real world, a user might actually make two identical payments (e.g., paying a utility bill twice by accident or buying two identical items). Silently deleting duplicates leads to data loss.
  2. Flagging duplicates preserves the raw data audit trail. By displaying them on a dedicated resolver UI, the user can easily see which rows were identical and explicitly select "Approve & Import" or ignore them.

---

## 4. Currency Conversion Architecture (Live API Lookup vs Logged Exchange Rates)
* **Decision**: Maintain a local `exchange_rates` database table containing rates with an `effectiveDate`, and perform lookups based on the transaction date.
* **Alternatives Considered**: Calling a live external exchange rate API (e.g., Fixer.io or ExchangeRate-API) at runtime.
* **Rationale**:
  1. Live APIs introduce a point of failure. If the external service is down, expense imports and balance calculations would fail.
  2. Conversion rates change daily. Calling a live API at runtime for historical expenses (e.g. an expense in March) would use current rates, leading to incorrect calculations. A logged rate table allows querying the rate effective on the specific expense date.
  3. Consistent database lookups guarantee deterministic balance calculations (the same transaction will always compute to the exact same INR amount).

---

## 5. Debt Simplification Engine (Greedy Min-Flow vs Full Bilateral Settlements)
* **Decision**: Implement a greedy min-flow algorithm to match debtors with creditors.
* **Alternatives Considered**: Standard bilateral balances (where everyone pays everyone else directly).
* **Rationale**:
  1. Bilateral settlements result in excessive transactions. If Rohan owes Aisha ₹200, Aisha owes Priya ₹200, and Rohan owes Priya ₹200, bilateral tracking requires three separate cash handovers.
  2. The min-flow algorithm simplifies the ledger, reducing the number of transactions to the minimum possible (e.g. Rohan pays Priya ₹400 directly). This provides a premium user experience and matches the expectations of a high-quality split-wise tool.

---

## 6. Strict Anomaly Resolver Timeline Validation
* **Decision**: Validate corrected dates and payer IDs during anomaly resolution against group membership timelines, rejecting edits that violate timeline constraints with a 400 Bad Request error.
* **Alternatives Considered**: Automatically allowing any corrected date/payer and letting the balance engine ignore ineligible splits, or auto-recalculating splits.
* **Rationale**: Letting invalid dates pass silently can lead to data inconsistency. Blocking invalid edits at the API validation layer ensures that only correct, timeline-compliant transactions enter the database.

---

## 7. Interactive Member Management in the Dashboard Sidebar
* **Decision**: Add interactive "Add Member" and "Exit Member" controls inside the dashboard UI.
* **Alternatives Considered**: Leaving memberships as read-only and requiring manual database seeding for timeline testing.
* **Rationale**: Group timelines are core to the balance engine's business logic. Providing direct interactive UI controls allows evaluators to dynamically add members, exit members, and immediately witness the timeline balance recalculation engine in action.

