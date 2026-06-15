import express from 'express';
import {
  createExpense,
  getExpenses,
  getExpenseDetails,
  editExpense,
  deleteExpense
} from '../controllers/expenseController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect); // All expense routes are protected

// Expenses grouped by group
router.post('/groups/:groupId/expenses', createExpense);
router.get('/groups/:groupId/expenses', getExpenses);

// Single expense operations
router.get('/expenses/:id', getExpenseDetails);
router.put('/expenses/:id', editExpense);
router.delete('/expenses/:id', deleteExpense);

export default router;
