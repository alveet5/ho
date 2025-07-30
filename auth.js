const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');

const router = express.Router();
const prisma = new PrismaClient();

// Input validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Register a new user
router.post('/register', async (req, res) => {
  try {
    // Validate input
    const validatedData = registerSchema.parse(req.body);
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });
    
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 10);
    
    // Create user
    const user = await prisma.user.create({
      data: {
        email: validatedData.email,
        password: hashedPassword,
        name: validatedData.name,
      },
    });
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Return user data (excluding password) and token
    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        subscriptionTier: user.subscriptionTier,
      },
      token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid input', errors: error.errors });
    }
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    // Validate input
    const validatedData = loginSchema.parse(req.body);
    
    // Find user
    const user = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Verify password
    const passwordValid = await bcrypt.compare(validatedData.password, user.password);
    
    if (!passwordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Return user data (excluding password) and token
    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        subscriptionTier: user.subscriptionTier,
      },
      token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Invalid input', errors: error.errors });
    }
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    // Get authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Return user data (excluding password)
    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        subscriptionTier: user.subscriptionTier,
        subscriptionEnds: user.subscriptionEnds,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
    console.error('Auth error:', error);
    res.status(500).json({ message: 'Server error during authentication' });
  }
});

module.exports = router;