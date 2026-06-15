# Project Scope: Anomaly Handling Policies & Database Schema

This document details the exact anomaly detection rules and database structure utilized by the Spreetail Shared Expenses system to manage real-world messy data.

---

## 1. CSV Anomaly Handling Policies

The import service streams CSV records and evaluates each row against a rules engine. The engine logs all occurrences in the `import_anomalies` table and applies the following policies:

### 1. Duplicate Expenses
* **Example**: "Dinner at Marina Bites" and "dinner - marina bites" uploaded with matching dates, payers, and amounts.
* **Detection**: Matches date, payer, amount, currency, and description (case-insensitive) against existing database rows and current batch rows.
* **Policy**: Set `duplicateFlag = true` and `needsReview = true` on the imported record. Present to user on the anomalies dashboard for manual review/approval. Never auto-delete.

### 2. Duplicate Expenses with Different Amounts
* **Example**: "Thalassa dinner 2400" and "Thalassa dinner 2450".
* **Detection**: Identical description, payer, currency, and date, but different amounts.
* **Policy**: Set `needsReview = true`. Log the discrepancy in the import report and require manual confirmation.

### 3. Missing Payer
* **Example**: Empty `Paid By` cell.
* **Policy**: Log `MISSING_PAYER` warning anomaly. Import the expense with `needsReview = true`, leaving `paidByUserId` blank or mapping to a fallback, and prompt the user in the resolver UI to map the correct payer.

### 4. Missing Currency
* **Example**: Currency column is empty.
* **Policy**: Automatically default to `"INR"`, log a `MISSING_CURRENCY` warning anomaly in the report, and import the row.

### 5. Multiple Date Formats
* **Examples**: `2026-02-01`, `01/03/2026`, `Mar 14`.
* **Policy**: Run standard regex matchers to parse formats and normalize values to ISO `YYYY-MM-DD`. Log `MULTIPLE_DATE_FORMATS` as an `INFO` anomaly.

### 6. Ambiguous Date
* **Example**: `04/05/2026` (Could be April 5th or May 4th).
* **Policy**: If month and day values are both $\le 12$, set `needsReview = true` and log `AMBIGUOUS_DATE`. Do not guess; display date picker to the user in the resolver UI.

### 7. Negative Amount
* **Example**: `-850.00` for "Parasailing refund".
* **Policy**: Convert the amount to its absolute positive value, set `transactionType = "REFUND"`, and log `NEGATIVE_AMOUNT` warning. The balance engine reverses calculation credits/debits for refunds.

### 8. Settlement Logged as Expense
* **Example**: "Rohan paid Aisha back" in description.
* **Policy**: Convert the record into a `Settlement` object, removing it from expense total calculations. Log `SETTLEMENT_TRANSACTION` info anomaly.

### 9. Zero Amount Transaction
* **Example**: `0.00` Software license.
* **Policy**: Log `ZERO_AMOUNT` warning, set `needsReview = true` or import with warning to alert the user.

### 10. Name Inconsistency
* **Examples**: `Priya`, `priya`, `PRIYA`.
* **Policy**: Map names case-insensitively to registered users. Normalize spelling to database Title Case (e.g. `Priya`), store original raw name in `originalPayer` for auditing, and log `NAME_INCONSISTENCY` info.

### 11. Invalid Percentage Split
* **Example**: Percentages total 110% in `Split Details`.
* **Policy**: Log `INVALID_PERCENTAGE_SPLIT` warning, set `needsReview = true`. Force the user to edit split percentages to total exactly 100%.

### 12. Split-Type Conflict
* **Example**: Split Type says "EQUAL" but detailed splits exist in `Split Details`.
* **Policy**: Log `SPLIT_TYPE_CONFLICT` warning, set `needsReview = true`. The dashboard prompts the user to either clear the splits or change the Split Type.

### 13. Membership Timeline Violation
* **Example**: Meera included in June expense after leaving flat in March.
* **Policy**: Flag `MEMBERSHIP_TIMELINE_VIOLATION` warning. Automatically remove the inactive participant from the split, recalculate splits among active members, and document the adjustment in the audit log.

### 14. Membership Eligibility
* **Example**: Sam joined in April and should not pay for March rent.
* **Policy**: Enforced at the engine layer: members are only eligible for splits on dates falling within their `joinedAt` and `leftAt` membership timeline.

### 15. Foreign Currency Expenses
* **Example**: Expense in USD.
* **Policy**: Store original currency. Look up the effective exchange rate for the expense date in `ExchangeRate` and convert to base currency (INR) for net balance calculations, leaving an audit trail.

---

## 2. Relational Database Schema

Below is the database schema mapping, which is configured in PostgreSQL using Prisma:

```
  +-------------------------------------------------------+
  |                        users                          |
  +-------------------------------------------------------+
  | id (Int, PK)                                          |
  | name (String)                                         |
  | email (String, Unique)                                |
  | password_hash (String)                                |
  | created_at (DateTime)                                 |
  +-------------------------------------------------------+
                             |
                             | 1:N
                             v
  +-------------------------------------------------------+
  |                     group_members                     |
  +-------------------------------------------------------+
  | id (Int, PK)                                          |
  | group_id (Int, FK -> groups)                          |
  | user_id (Int, FK -> users)                            |
  | joined_at (DateTime)                                  |
  | left_at (DateTime, Nullable)                          |
  +-------------------------------------------------------+
                             |
                             | 1:N
                             v
  +-------------------------------------------------------+
  |                       expenses                        |
  +-------------------------------------------------------+
  | id (Int, PK)                                          |
  | group_id (Int, FK -> groups)                          |
  | description (String)                                  |
  | amount (Decimal)                                      |
  | currency (String)                                     |
  | paid_by (Int, FK -> users)                            |
  | expense_date (DateTime)                               |
  | split_type (String)                                   |
  | transaction_type (String)                             |
  | import_id (String, Nullable)                          |
  | row_number (Int, Nullable)                            |
  | original_payer (String, Nullable)                     |
  | needs_review (Boolean)                                |
  | duplicate_flag (Boolean)                              |
  | created_at (DateTime)                                 |
  +-------------------------------------------------------+
                             |
              +--------------+--------------+
              | 1:N                         | 1:N
              v                             v
  +-----------------------+     +-------------------------+
  |    expense_shares     |     |    import_anomalies     |
  +-----------------------+     +-------------------------+
  | id (Int, PK)          |     | id (Int, PK)            |
  | expense_id (Int, FK)  |     | import_id (String)      |
  | user_id (Int, FK)     |     | row_number (Int)        |
  | share_amount (Decimal)|     | anomaly_type (String)   |
  | share_percentage (Dec)|     | anomaly_description(Str)|
  +-----------------------+     | action_taken (String)   |
                                | severity (String)       |
                                | expense_id (Int, Null)  |
                                | resolved (Boolean)      |
                                | created_at (DateTime)   |
                                +-------------------------+

  +-------------------------------------------------------+
  |                      settlements                      |
  +-------------------------------------------------------+
  | id (Int, PK)                                          |
  | group_id (Int, FK -> groups)                          |
  | from_user (Int, FK -> users)                          |
  | to_user (Int, FK -> users)                            |
  | amount (Decimal)                                      |
  | settlement_date (DateTime)                            |
  +-------------------------------------------------------+

  +-------------------------------------------------------+
  |                    exchange_rates                     |
  +-------------------------------------------------------+
  | id (Int, PK)                                          |
  | from_currency (String)                                |
  | to_currency (String)                                  |
  | rate (Decimal)                                        |
  | effective_date (DateTime)                             |
  +-------------------------------------------------------+
```
