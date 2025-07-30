const express = require('express');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const { z } = require('zod');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware to authenticate user
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    req.userId = decoded.userId;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
    console.error('Auth middleware error:', error);
    res.status(500).json({ message: 'Server error during authentication' });
  }
};

// Get all conversations for a property
router.get('/property/:propertyId', authenticate, async (req, res) => {
  try {
    // Check if property exists and belongs to user
    const property = await prisma.property.findUnique({
      where: { id: req.params.propertyId },
    });
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }
    
    if (property.userId !== req.userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    // Get conversations
    const conversations = await prisma.conversation.findMany({
      where: { propertyId: req.params.propertyId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    
    res.status(200).json(conversations);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ message: 'Server error while fetching conversations' });
  }
});

// Get a specific conversation with messages
router.get('/:id', authenticate, async (req, res) => {
  try {
    // Get conversation with messages
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: {
        property: true,
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    
    // Check if user owns the property associated with the conversation
    const property = await prisma.property.findUnique({
      where: { id: conversation.propertyId },
    });
    
    if (property.userId !== req.userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    res.status(200).json(conversation);
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ message: 'Server error while fetching conversation' });
  }
});

// Send a message to a conversation (host sending message)
router.post('/:id/messages', authenticate, async (req, res) => {
  try {
    // Validate input
    const { content } = req.body;
    
    if (!content || typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({ message: 'Message content is required' });
    }
    
    // Get conversation
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: { property: true },
    });
    
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    
    // Check if user owns the property associated with the conversation
    if (conversation.property.userId !== req.userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    // Create message
    const message = await prisma.message.create({
      data: {
        conversationId: req.params.id,
        content,
        isFromGuest: false,
      },
    });
    
    // Update conversation updatedAt
    await prisma.conversation.update({
      where: { id: req.params.id },
      data: { updatedAt: new Date() },
    });
    
    // Send message via Twilio
    try {
      const twilioService = require('../services/twilio');
      await twilioService.sendMessage(
        conversation.property.phoneNumber,
        conversation.guestPhoneNumber,
        content
      );
    } catch (twilioError) {
      console.error('Twilio error:', twilioError);
      // Continue even if Twilio fails
    }
    
    res.status(201).json(message);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Server error while sending message' });
  }
});

// Delete a conversation
router.delete('/:id', authenticate, async (req, res) => {
  try {
    // Get conversation
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: { property: true },
    });
    
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    
    // Check if user owns the property associated with the conversation
    if (conversation.property.userId !== req.userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    // Delete conversation (cascade will delete messages)
    await prisma.conversation.delete({
      where: { id: req.params.id },
    });
    
    res.status(204).send();
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ message: 'Server error while deleting conversation' });
  }
});

module.exports = router;