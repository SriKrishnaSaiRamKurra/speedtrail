# Production Deployment Guide (DEPLOYMENT.md)

This document provides step-by-step instructions for deploying the Spreetail Shared Expenses application in a production environment. 

The architecture consists of:
* **Frontend**: React (Vite) hosted on **Vercel** (Static Site Hosting).
* **Backend**: Node.js/Express API hosted on **Render** (Web Service).
* **Database**: PostgreSQL database hosted on **Render** (Managed PostgreSQL).

---

## 1. Database Deployment (Render PostgreSQL)

1. Log in to your [Render Dashboard](https://dashboard.render.com).
2. Click **New** -> **Database**.
3. Configure the database parameters:
   * **Name**: `expense-import-db`
   * **Database**: `spreetail_expenses`
   * **Username**: `postgres`
   * **Region**: Choose the region closest to your users.
   * **PostgreSQL Version**: `15` or newer.
   * **Plan**: Choose **Free** (or your preferred paid tier).
4. Click **Create Database**.
5. Once active, note the **Internal Database URL** (for Render services) and **External Database URL** (for local configuration testing).

---

## 2. Backend API Deployment (Render Web Service)

You can deploy the backend manually via Git integration or automatically using the provided `render.yaml` blueprint.

### Option A: Using the render.yaml Blueprint (Recommended)
1. In the Render Dashboard, click **New** -> **Blueprint**.
2. Connect your GitHub repository: `SriKrishnaSaiRamKurra/expense-import-system`.
3. Render will automatically read the `render.yaml` file from the root directory and configure both the database and Web Service.
4. It will auto-populate the database connection string and generate a secure random `JWT_SECRET`.
5. Click **Approve**.

### Option B: Manual Setup
1. In the Render Dashboard, click **New** -> **Web Service**.
2. Connect your GitHub repository.
3. Configure the service:
   * **Name**: `expense-import-backend`
   * **Root Directory**: `backend`
   * **Build Command**: `npm install && npx prisma generate && npx prisma db push`
   * **Start Command**: `npm run start`
   * **Plan**: **Free**
4. Add the following **Environment Variables**:
   * `DATABASE_URL`: *Paste the Internal Database URL from Step 1.*
   * `JWT_SECRET`: *A secure random secret key (e.g. `super_secret_session_token_xyz`).*
   * `NODE_ENV`: `production`
   * `PORT`: `5000`
5. Click **Create Web Service**.

### Option C: Running the Seed File (Populating Default Users)
Once the service has deployed and the Prisma schema is pushed to the database, you need to seed the standard users (Aisha, Rohan, Priya, Meera, Sam, Dev) and default exchange rates.
1. In your Render Web Service dashboard, navigate to the **Shell** tab on the left sidebar.
2. Run the following command inside the shell:
   ```bash
   npx prisma db seed
   ```
3. You should see `Database seeded successfully!` in the shell output.

---

## 3. Frontend Deployment (Vercel)

Vercel is optimized for React static sites and will host the Vite build.

1. Log in to your [Vercel Dashboard](https://vercel.com).
2. Click **Add New** -> **Project**.
3. Import your GitHub repository: `SriKrishnaSaiRamKurra/expense-import-system`.
4. In the **Configure Project** window:
   * **Framework Preset**: Select **Vite** (Vercel should detect this automatically).
   * **Root Directory**: Click Edit and select `frontend`.
   * Under **Build and Development Settings**, verify:
     * **Build Command**: `vite build`
     * **Output Directory**: `dist`
   * Expand **Environment Variables** and add:
     * **Key**: `VITE_API_URL`
     * **Value**: *The live URL of your Render Web Service backend (e.g. `https://expense-import-backend.onrender.com/api`).*
5. Click **Deploy**.
6. Vercel will build and serve the client at a public URL (e.g., `https://expense-import-system.vercel.app`).

---

## 4. Verification Check

To confirm your production deployment is completely healthy:
1. Navigate to your live Vercel URL in a browser.
2. Register a new user or log in using seeded credentials (e.g., `priya@flatmates.com` with password `password123`).
3. If the dashboard loads correctly and displays the "Flatmates Shared Expenses" group with historical memberships, the database connection and API communication are fully functional.
4. Try uploading `test-expenses.csv` inside the CSV Import screen to verify that the CSV parsing, duplicate checking, and database transaction engines run smoothly.
