const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const backupController = require('../controllers/backupController');

const router = express.Router();

router.use(authenticate, requireRole('admin'));

router.get('/export', backupController.exportBackup);
// A full backup (600+ members with photos) can be much larger than the
// app-wide 6mb JSON limit, so this route gets its own, higher one.
router.post('/import', express.json({ limit: '80mb' }), backupController.importBackup);

module.exports = router;