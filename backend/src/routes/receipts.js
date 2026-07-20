const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const receiptController = require('../controllers/receiptController');

const router = express.Router();

router.use(authenticate, requireRole('admin', 'manager'));

// Both roles can view/send existing receipts.
router.get('/', receiptController.listReceipts);

// Only the Owner can approve a bill and turn it into a receipt.
router.post('/', requireRole('admin'), receiptController.createReceipt);
router.patch('/:id', requireRole('admin'), receiptController.updateReceipt);

module.exports = router;