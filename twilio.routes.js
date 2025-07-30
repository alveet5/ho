const express = require('express');
const twilioController = require('../controllers/twilio.controller');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Protected routes (require authentication)
router.use(authenticateToken);

// Send manual message from host to guest
router.post('/send-message', twilioController.sendManualMessage);

// Generate WhatsApp QR code for a property
router.get('/qr-code/:propertyId', twilioController.generateWhatsAppQR);

module.exports = router;