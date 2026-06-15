import express from 'express';
import {
  getGroups,
  getGroupDetails,
  createGroup,
  editGroup,
  addMember,
  removeMember,
  getMembershipHistory
} from '../controllers/groupController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect); // All group routes are protected by JWT

router.get('/', getGroups);
router.post('/', createGroup);
router.get('/:id', getGroupDetails);
router.put('/:id', editGroup);
router.post('/:id/members', addMember);
router.delete('/:id/members/:memberUserId', removeMember);
router.get('/:id/members/history', getMembershipHistory);

export default router;
