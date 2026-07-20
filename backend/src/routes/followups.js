const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const followupController = require('../controllers/followupController');

const router = express.Router();

router.use(authenticate, requireRole('admin', 'manager'));

router.get('/', followupController.listFollowups);
router.post('/', followupController.createFollowup);
router.patch('/:id', followupController.updateFollowup);
router.delete('/:id', followupController.deleteFollowup);

module.exports = router;
