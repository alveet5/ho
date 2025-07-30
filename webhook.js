const express = require('express');
const { PrismaClient } = require('@prisma/client');
const twilioService = require('../services/twilio');

const router = express.Router();
const prisma = new PrismaClient();

// Webhook for incoming Twilio messages
router.post('/twilio', async (req, res) => {
  try {
    // Process the incoming message using the TwilioService
    const result = await twilioService.processIncomingMessage(req.body);
    
    // Return a TwiML response (empty response is fine as we've already sent the message)
    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');
  } catch (error) {
    console.error('Webhook error:', error);
    // Always return a valid TwiML response even on error
    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');
  }
});

// Endpoint to generate WhatsApp QR code for a property
router.get('/whatsapp-qr/:propertyId', async (req, res) => {
  try {
    const { propertyId } = req.params;
    
    // Generate QR code URL
    const qrCodeUrl = await twilioService.generateWhatsAppQRCode(propertyId);
    
    res.json({ success: true, qrCodeUrl });
  } catch (error) {
    console.error('Error generating WhatsApp QR code:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;