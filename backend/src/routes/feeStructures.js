const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const feeStructureController = require('../controllers/feeStructureController');

const router = express.Router();

router.use(authenticate, requireRole('admin', 'manager'));

router.get('/', feeStructureController.listFeeStructures);
router.post('/', requireRole('admin'), feeStructureController.createFeeStructure);
router.patch('/:id', requireRole('admin'), feeStructureController.updateFeeStructure);
router.delete('/:id', requireRole('admin'), feeStructureController.deleteFeeStructure);

module.exports = router;