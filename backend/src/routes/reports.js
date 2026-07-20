const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const reportController = require('../controllers/reportController');

const router = express.Router();

router.use(authenticate, requireRole('admin', 'manager'));

router.get('/summary', reportController.summary);
router.get('/expired-memberships', reportController.expiredMembershipsList);
router.get('/collections', reportController.collectionsByRange);
router.get('/dues', reportController.duesReport);
router.get('/overdue-members', reportController.overdueMembers);
router.get('/expiring-soon', reportController.expiringSoon);
router.get('/best-cabins', reportController.bestAvailableCabins);
router.get('/birthdays', reportController.upcomingBirthdays);

module.exports = router;
