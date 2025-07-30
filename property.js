const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const jwt = require('jsonwebtoken');
const { OpenAIEmbeddings } = require('../services/openai');

const router = express.Router();
const prisma = new PrismaClient();
const embeddings = new OpenAIEmbeddings();

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

// Input validation schemas
const propertySchema = z.object({
  name: z.string().min(2),
  phoneNumber: z.string().min(10),
});

const propertyDetailsSchema = z.object({
  checkInTime: z.string().optional(),
  checkOutTime: z.string().optional(),
  wifiPassword: z.string().optional(),
  houseRules: z.string().optional(),
  location: z.string().optional(),
  nearbyAttractions: z.string().optional(),
  emergencyContacts: z.string().optional(),
  faqs: z.record(z.string()).optional(),
  customNotes: z.string().optional(),
});

// Create a new property
router.post('/', authenticate, async (req, res) => {
  try {
    // Validate input
    const validatedData = propertySchema.parse(req.body);
    
    // Create property
    const property = await prisma.property.create({
      data: {
        name: validatedData.name,
        phoneNumber: validatedData.phoneNumber,
        userId: req.userId,
      },
    });
    
    res.status(201).json(property);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid input', errors: error.errors });
    }
    console.error('Property creation error:', error);
    res.status(500).json({ message: 'Server error during property creation' });
  }
});

// Get all properties for a user
router.get('/', authenticate, async (req, res) => {
  try {
    const properties = await prisma.property.findMany({
      where: { userId: req.userId },
      include: { propertyDetails: true },
    });
    
    res.status(200).json(properties);
  } catch (error) {
    console.error('Get properties error:', error);
    res.status(500).json({ message: 'Server error while fetching properties' });
  }
});

// Get a specific property
router.get('/:id', authenticate, async (req, res) => {
  try {
    const property = await prisma.property.findUnique({
      where: { id: req.params.id },
      include: { propertyDetails: true },
    });
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }
    
    // Check if user owns the property
    if (property.userId !== req.userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    res.status(200).json(property);
  } catch (error) {
    console.error('Get property error:', error);
    res.status(500).json({ message: 'Server error while fetching property' });
  }
});

// Update property details
router.put('/:id/details', authenticate, async (req, res) => {
  try {
    // Validate input
    const validatedData = propertyDetailsSchema.parse(req.body);
    
    // Check if property exists and belongs to user
    const property = await prisma.property.findUnique({
      where: { id: req.params.id },
    });
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }
    
    if (property.userId !== req.userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    // Update or create property details
    const propertyDetails = await prisma.propertyDetails.upsert({
      where: { propertyId: req.params.id },
      update: validatedData,
      create: {
        ...validatedData,
        propertyId: req.params.id,
      },
    });
    
    // Generate embeddings for the property details
    await generateEmbeddings(req.params.id, validatedData);
    
    res.status(200).json(propertyDetails);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid input', errors: error.errors });
    }
    console.error('Update property details error:', error);
    res.status(500).json({ message: 'Server error during property details update' });
  }
});

// Toggle property active status
router.patch('/:id/toggle-status', authenticate, async (req, res) => {
  try {
    // Check if property exists and belongs to user
    const property = await prisma.property.findUnique({
      where: { id: req.params.id },
    });
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }
    
    if (property.userId !== req.userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    // Toggle isActive status
    const updatedProperty = await prisma.property.update({
      where: { id: req.params.id },
      data: { isActive: !property.isActive },
    });
    
    res.status(200).json(updatedProperty);
  } catch (error) {
    console.error('Toggle property status error:', error);
    res.status(500).json({ message: 'Server error during property status update' });
  }
});

// Delete a property
router.delete('/:id', authenticate, async (req, res) => {
  try {
    // Check if property exists and belongs to user
    const property = await prisma.property.findUnique({
      where: { id: req.params.id },
    });
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }
    
    if (property.userId !== req.userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    // Delete property (cascade will delete related records)
    await prisma.property.delete({
      where: { id: req.params.id },
    });
    
    res.status(204).send();
  } catch (error) {
    console.error('Delete property error:', error);
    res.status(500).json({ message: 'Server error during property deletion' });
  }
});

// Helper function to generate embeddings for property details
async function generateEmbeddings(propertyId, propertyDetails) {
  try {
    // Delete existing embeddings for this property
    await prisma.vectorEmbedding.deleteMany({
      where: { propertyId },
    });
    
    // Create content chunks from property details
    const chunks = [];
    
    if (propertyDetails.checkInTime) {
      chunks.push(`Check-in time: ${propertyDetails.checkInTime}`);
    }
    
    if (propertyDetails.checkOutTime) {
      chunks.push(`Check-out time: ${propertyDetails.checkOutTime}`);
    }
    
    if (propertyDetails.wifiPassword) {
      chunks.push(`WiFi password: ${propertyDetails.wifiPassword}`);
    }
    
    if (propertyDetails.houseRules) {
      chunks.push(`House rules: ${propertyDetails.houseRules}`);
    }
    
    if (propertyDetails.location) {
      chunks.push(`Location information: ${propertyDetails.location}`);
    }
    
    if (propertyDetails.nearbyAttractions) {
      chunks.push(`Nearby attractions: ${propertyDetails.nearbyAttractions}`);
    }
    
    if (propertyDetails.emergencyContacts) {
      chunks.push(`Emergency contacts: ${propertyDetails.emergencyContacts}`);
    }
    
    if (propertyDetails.customNotes) {
      chunks.push(`Additional information: ${propertyDetails.customNotes}`);
    }
    
    if (propertyDetails.faqs && Object.keys(propertyDetails.faqs).length > 0) {
      for (const [question, answer] of Object.entries(propertyDetails.faqs)) {
        chunks.push(`FAQ - ${question}: ${answer}`);
      }
    }
    
    // Generate embeddings for each chunk
    for (const chunk of chunks) {
      const embedding = await embeddings.generateEmbedding(chunk);
      
      await prisma.vectorEmbedding.create({
        data: {
          propertyId,
          content: chunk,
          embedding,
          metadata: { type: 'property_details' },
        },
      });
    }
    
    console.log(`Generated ${chunks.length} embeddings for property ${propertyId}`);
  } catch (error) {
    console.error('Error generating embeddings:', error);
    // Don't throw, just log the error to prevent API failure
  }
}

module.exports = router;