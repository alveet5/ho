require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');
const rateLimit = require('express-rate-limit');

// Import routes
const authRoutes = require('./routes/auth');
const propertyRoutes = require('./routes/property');
const conversationRoutes = require('./routes/conversation');
const webhookRoutes = require('./routes/webhook');
const subscriptionRoutes = require('./routes/subscription.routes');
const documentsRoutes = require('./routes/documents.routes');
const twilioRoutes = require('./routes/twilio.routes');

// Initialize Express app
const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all routes
app.use(apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/twilio', twilioRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'An unexpected error occurred',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});