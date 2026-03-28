const express = require('express');
const {
  createCheckoutSession,
  handleStripeWebhook,
  getSubscriptionStatus,
} = require('../controllers/paymentController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/subscription-status', protect, authorizeRoles('user', 'admin'), getSubscriptionStatus);
router.post('/checkout-session', protect, authorizeRoles('user', 'admin'), createCheckoutSession);
router.post('/webhook', handleStripeWebhook);

module.exports = router;