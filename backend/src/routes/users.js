const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const userController = require('../controllers/userController');

const router = express.Router();

router.use(authenticate);

// Available to both Owner and Manager
router.patch('/me/password', userController.changeOwnPassword);

// Owner (admin) only
router.get('/', requireRole('admin'), userController.listUsers);
router.post('/', requireRole('admin'), userController.createUser);
router.patch('/:id/status', requireRole('admin'), userController.setUserStatus);
router.patch('/:id/password', requireRole('admin'), userController.resetUserPassword);
router.patch('/:id/username', requireRole('admin'), userController.updateUsername);

module.exports = router;
