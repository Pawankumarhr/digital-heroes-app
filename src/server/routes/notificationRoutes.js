const express = require('express');
const {
	listNotifications,
	markNotificationRead,
	markAllNotificationsRead,
} = require('../controllers/notificationController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const { validateObjectIdParam } = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(protect, authorizeRoles('user', 'admin'));
router.get('/', listNotifications);
router.post('/read-all', markAllNotificationsRead);
router.patch('/:id/read', validateObjectIdParam('id'), markNotificationRead);

module.exports = router;
