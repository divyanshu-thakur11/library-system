const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const auditController = require('../controllers/auditController');

const router = express.Router();

router.use(authenticate, requireRole('admin'));

router.get('/', auditController.listAuditLogs);

module.exports = router;
