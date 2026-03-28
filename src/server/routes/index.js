const express = require('express');
const { getHealth } = require('../controllers/healthController');
const authRoutes = require('./authRoutes');
const paymentRoutes = require('./paymentRoutes');
const scoreRoutes = require('./scoreRoutes');
const drawRoutes = require('./drawRoutes');
const charityRoutes = require('./charityRoutes');
const winnerRoutes = require('./winnerRoutes');
const contactRoutes = require('./contactRoutes');
const reportRoutes = require('./reportRoutes');
const auditLogRoutes = require('./auditLogRoutes');
const notificationRoutes = require('./notificationRoutes');
const adminRoutes = require('./adminRoutes');

const router = express.Router();

router.get('/health', getHealth);
router.use('/auth', authRoutes);
router.use('/payments', paymentRoutes);
router.use('/scores', scoreRoutes);
router.use('/draws', drawRoutes);
router.use('/charities', charityRoutes);
router.use('/winners', winnerRoutes);
router.use('/contact', contactRoutes);
router.use('/reports', reportRoutes);
router.use('/audit-logs', auditLogRoutes);
router.use('/notifications', notificationRoutes);
router.use('/admin', adminRoutes);

module.exports = router;