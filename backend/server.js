import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Route Imports
import authRoutes from './src/routes/authRoutes.js';
import groupRoutes from './src/routes/groupRoutes.js';
import expenseRoutes from './src/routes/expenseRoutes.js';
import settlementRoutes from './src/routes/settlementRoutes.js';
import importRoutes from './src/routes/importRoutes.js';

// Load Env variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Static Uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Register API Routes
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/expenses', expenseRoutes); // Contains both nested and root routes
app.use('/api', expenseRoutes); // Safe binding for general expense endpoints
app.use('/api', settlementRoutes); // Handles balances & settlements
app.use('/api', importRoutes); // Handles CSV parsing

// Base Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Something went wrong on the server!' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

export default app; // For testing purposes
