const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const billingController = require('../controllers/billingController');

const router = express.Router();

router.use(authenticate, requireRole('admin', 'manager'));

router.get('/', billingController.listBills);
router.post('/', billingController.createBill);
router.patch('/:id', billingController.updateBill);
router.patch('/:id/void', requireRole('admin'), billingController.voidBill);
router.post('/approve-all', requireRole('admin'), billingController.approveAllBills);

module.exports = router;