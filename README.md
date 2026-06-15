# Spreetail Shared Expenses Solution

Spreetail Shared Expenses is a production-ready, full-stack shared expenses management and CSV import engine. It is designed to handle messy real-world data imports, enforce group membership timeline histories (join/leave dates), convert foreign currencies dynamically, and calculate simplified debts to minimize transaction flow.

## Project Metadata
* **GitHub Repository**: [SriKrishnaSaiRamKurra/expense-import-system](https://github.com/SriKrishnaSaiRamKurra/expense-import-system)
* **GitHub Username**: `SriKrishnaSaiRamKurra`
* **Repository Name**: `expense-import-system`
* **Deployment Guide**: [DEPLOYMENT.md](file:///C:/Users/SRI%20KRISHNA/.gemini/antigravity-ide/scratch/spreetail-shared-expenses/DEPLOYMENT.md)

---

## Technical Stack
* **Frontend**: React 19 (Vite) + Lucide Icons + Google Fonts ("Outfit") + Premium Glassmorphism UI
* **Backend**: Node.js + Express API
* **ORM**: Prisma ORM (v5)
* **Database**: PostgreSQL (relational database only)
* **Authentication**: JWT (JSON Web Tokens) with bcrypt password hashing
* **Test Suite**: Jest with ES Modules support

---

## Core Directory Structure

```
expense-import-system/
├── backend/                  # Express API Backend
│   ├── prisma/               # Schema definitions and database seeding scripts
│   └── src/
│       ├── controllers/      # Route logic handlers (auth, group, expense, imports, settlements)
│       ├── middleware/       # JWT Authorization middleware
│       ├── routes/           # REST endpoints
│       └── services/         # Balance calculations and Anomaly detection pipeline
├── frontend/                 # Vite + React Frontend Client
│   ├── public/               # Static icons/assets
│   └── src/
│       ├── components/       # Reusable components (ExpenseForm, Navbar, Modal)
│       ├── context/          # Global React state (AuthContext)
│       └── pages/            # View pages (Login, Register, Dashboard, ImportPage)
├── .env.example              # Template for environment configuration
├── .gitignore                # Global git ignored files
├── vercel.json               # Vercel deployment routing configurations
└── render.yaml               # Render infrastructure orchestration blueprint
```

---

## Documentation System

To aid code audits and interview preparation, the project contains these dedicated documentation records:
1. [SCOPE.md](file:///C:/Users/SRI%20KRISHNA/.gemini/antigravity-ide/scratch/spreetail-shared-expenses/SCOPE.md): Defines the exact CSV parsing policies, normalized schema definitions, and validation rules.
2. [DECISIONS.md](file:///C:/Users/SRI%20KRISHNA/.gemini/antigravity-ide/scratch/spreetail-shared-expenses/DECISIONS.md): The Engineering Log capturing key architectural design decisions, alternatives, and rationales.
3. [AI_USAGE.md](file:///C:/Users/SRI%20KRISHNA/.gemini/antigravity-ide/scratch/spreetail-shared-expenses/AI_USAGE.md): Chronicles AI development helpers, logs bug encounters, and lists correction strategies.
4. [DEPLOYMENT.md](file:///C:/Users/SRI%20KRISHNA/.gemini/antigravity-ide/scratch/spreetail-shared-expenses/DEPLOYMENT.md): Detailed step-by-step guide for deploying the application on Render and Vercel.

---

## Quick Start Setup (Local Development)

Follow these steps to run the application locally:

### 1. Database Setup (PostgreSQL)
A `docker-compose.yml` file is provided in the project root to run a local PostgreSQL container easily.
```bash
# Start the PostgreSQL container
docker compose up -d
```
The database will run on `localhost:5432` with credentials:
* **Username**: `postgres`
* **Password**: `password123`
* **Database**: `spreetail_expenses`

### 2. Backend Setup
1. Navigate to the `backend` directory.
2. Install dependencies:
   ```bash
   cd backend
   npm install
   ```
3. Sync the Prisma schema and create database tables:
   ```bash
   npx prisma db push
   ```
4. Seed the database with default users, timelines, and exchange rates:
   ```bash
   npx prisma db seed
   ```
5. Start the API development server:
   ```bash
   npm run dev
   ```
   The API will listen at `http://localhost:5000`.

### 3. Frontend Setup
1. Open a new terminal and navigate to the `frontend` directory.
2. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```
3. Start the Vite React development server:
   ```bash
   npm run dev
   ```
4. Access `http://localhost:5173` in your browser.
5. Log in with any of the seeded credentials:
   - **Emails**: `priya@flatmates.com`, `aisha@flatmates.com`, `rohan@flatmates.com`, `meera@flatmates.com`, `sam@flatmates.com`, `dev@flatmates.com`
   - **Password**: `password123`

### 4. Running Tests
To run unit and integration tests for the balance engine and the anomaly checker, execute:
```bash
cd backend
node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand
```

---

## Key Business Logic Highlight

1. **Timeline-based Balances**: The `balanceEngine.js` verifies membership timeline ranges (`joinedAt` and `leftAt`). Users will not participate in splits for expenses that occurred outside their active group membership window.
2. **Interactive Group Timelines**: In the frontend sidebar, users can dynamically **Add Members** (by entering their email and join date) or **Exit Active Members** (setting their exit date), which automatically recalculates balances and suggestions.
3. **Multi-Currency Normalization**: USD and INR rates are matched against the date of the expense via the `ExchangeRate` table to perform conversion during balance summation.
4. **Greedy Debt Simplification**: A min-flow optimization algorithm simplifies group debt ledgers to suggest the minimal number of direct settlement transfers.
5. **Interactive Anomaly Resolver**: Flagged rows (such as duplicates, missing fields, timeline violations, or ambiguous dates) are imported with `needsReview = true` and managed through the Import Dashboard where they can be resolved manually.
