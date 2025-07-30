const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const documentsController = require('../controllers/documents.controller');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Routes for property documents
router.get('/properties/:propertyId/documents', documentsController.getPropertyDocuments);
router.post('/properties/:propertyId/documents', documentsController.createDocument);
router.get('/properties/:propertyId/documents/:documentId', documentsController.getDocument);
router.put('/properties/:propertyId/documents/:documentId', documentsController.updateDocument);
router.delete('/properties/:propertyId/documents/:documentId', documentsController.deleteDocument);

// Route for regenerating embeddings
router.post('/properties/:propertyId/regenerate-embeddings', documentsController.regenerateEmbeddings);

module.exports = router;