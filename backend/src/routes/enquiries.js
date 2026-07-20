const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const enquiryController = require('../controllers/enquiryController');

const router = express.Router();

router.use(authenticate, requireRole('admin', 'manager'));

router.get('/', enquiryController.listEnquiries);
router.post('/', enquiryController.createEnquiry);
router.patch('/:id', enquiryController.updateEnquiry);
router.delete('/:id', enquiryController.deleteEnquiry);

module.exports = router;
