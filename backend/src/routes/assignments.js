const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const assignmentController = require('../controllers/assignmentController');

const router = express.Router();

router.use(authenticate, requireRole('admin', 'manager'));

router.post('/', assignmentController.assignCabin);
router.patch('/:id/end', assignmentController.endAssignment);
router.post('/vacate/:memberId', assignmentController.vacateMember);
router.get('/special-cases', assignmentController.listSpecialCases);

module.exports = router;
