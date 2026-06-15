import express from 'express';
import multer from 'multer';
import {
  importCSV,
  getImportReport,
  resolveAnomaly
} from '../controllers/importController.js';
import { protect } from '../middleware/authMiddleware.js';

const upload = multer({ dest: 'uploads/' });
const router = express.Router();

router.use(protect); // Protect all routes

router.post('/groups/:groupId/imports', upload.single('file'), importCSV);
router.get('/imports/:importId/report', getImportReport);
router.post('/imports/anomalies/:anomalyId/resolve', resolveAnomaly);

export default router;
