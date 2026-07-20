const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const cabinController = require('../controllers/cabinController');

const router = express.Router();

router.use(authenticate, requireRole('admin', 'manager'));

router.get('/', cabinController.listCabins);
router.get('/view', cabinController.getCabinView);
router.get('/occupancy', cabinController.getOccupancyByDate);
router.post('/suggest', cabinController.suggestCabin);
router.post('/', requireRole('admin'), cabinController.createCabin);
// Both roles can define a time slot on the fly while assigning a member
// (needed for the hours-based assignment flow); only the Owner manages
// cabins themselves.
router.post('/:cabinId/time-slots', cabinController.addTimeSlot);
router.patch('/:id/status', requireRole('admin'), cabinController.setCabinActive);
router.delete('/:id', requireRole('admin'), cabinController.deleteCabin);

module.exports = router;
