const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const memberController = require('../controllers/memberController');

const router = express.Router();

router.use(authenticate, requireRole('admin', 'manager'));

router.get('/', memberController.listMembers);
router.get('/next-serial', memberController.getNextSerial);
router.get('/:id', memberController.getMember);
router.get('/:id/card', memberController.getMemberCard);
router.post('/', memberController.createMember);
router.patch('/:id', memberController.updateMember);
router.delete('/:id', requireRole('admin'), memberController.deleteMember);

module.exports = router;