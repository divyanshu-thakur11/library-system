const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const settingsController = require('../controllers/settingsController');

const router = express.Router();

router.use(authenticate, requireRole('admin', 'manager'));

router.get('/', settingsController.getSettings);
router.patch('/', requireRole('admin'), settingsController.updateSettings);

module.exports = router;
