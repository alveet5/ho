const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const subscriptionController = require('../controllers/subscription.controller');

const router = express.Router();

// Public routes
router.post('/webhook', express.raw({ type: 'application/json' }), subscriptionController.handleWebhook);

// Protected routes
router.use(authenticateToken);

router.get('/plans', subscriptionController.getSubscriptionPlans);
router.get('/me', subscriptionController.getUserSubscription);
router.post('/checkout', subscriptionController.createCheckoutSession);
router.post('/portal', subscriptionController.createPortalSession);
router.post('/cancel/:subscriptionId', subscriptionController.cancelSubscription);

module.exports = router;