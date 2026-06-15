import express from 'express';
import {
  recordSettlement,
  getSettlements,
  getBalances
} from '../controllers/settlementController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect); // Protect all routes

router.post('/groups/:groupId/settlements', recordSettlement);
router.get('/groups/:groupId/settlements', getSettlements);
router.get('/groups/:groupId/balances', getBalances);

export default router;
