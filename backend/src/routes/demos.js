const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const demoController = require('../controllers/demoController');

const router = express.Router();

router.use(authenticate, requireRole('admin', 'manager'));

router.get('/', demoController.listDemos);
router.post('/', demoController.createDemo);
router.patch('/:id', demoController.updateDemo);
router.delete('/:id', demoController.deleteDemo);

module.exports = router;
