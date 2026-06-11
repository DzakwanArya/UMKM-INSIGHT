const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { authenticateToken } = require('../middleware/auth');
const { validateSubscription } = require('../middleware/validation');

// Initialize a payment (Returns Midtrans Snap Token)
router.post('/create', authenticateToken, validateSubscription, subscriptionController.createSubscription);

// Check if user is premium
router.get('/status', authenticateToken, subscriptionController.checkStatus);

// Midtrans webhook notifications (No auth token needed, verified via signature/payload)
router.post('/webhook', subscriptionController.handleWebhook);

// Verification route to sync with Midtrans directly (needed for localhost development)
router.post('/verify/:orderId', authenticateToken, subscriptionController.verifyPaymentStatus);

// Simulation route for offline local testing
router.post('/simulate-payment', subscriptionController.simulatePayment);

module.exports = router;
