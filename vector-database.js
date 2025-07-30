const { createClient } = require('@supabase/supabase-js');
const { OpenAIEmbeddings } = require('./openai');

class VectorDatabase {
  constructor() {
    // Initialize Supabase client
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    // Initialize OpenAI embeddings service
    this.openaiEmbeddings = new OpenAIEmbeddings();
    
    // Table name for vector storage
    this.tableName = 'vector_embeddings';
  }

  /**
   * Store a document and its embedding in the vector database
   * @param {string} content - The text content to embed
   * @param {Object} metadata - Metadata about the content (propertyId, documentId, etc.)
   * @returns {Promise<Object>} - The stored vector record
   */
  async storeEmbedding(content, metadata) {
    try {
      // Generate embedding using OpenAI
      const embedding = await this.openaiEmbeddings.generateEmbedding(content);
      
      // Store in Supabase
      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert([
          {
            content,
            embedding,
            metadata: JSON.stringify(metadata),
            property_id: metadata.propertyId,
            created_at: new Date().toISOString()
          }
        ])
        .select();
      
      if (error) throw new Error(`Error storing embedding: ${error.message}`);
      
      return data[0];
    } catch (error) {
      console.error('Error in storeEmbedding:', error);
      throw error;
    }
  }

  /**
   * Update an existing embedding
   * @param {string} id - The ID of the embedding to update
   * @param {string} content - The new text content
   * @param {Object} metadata - Updated metadata
   * @returns {Promise<Object>} - The updated vector record
   */
  async updateEmbedding(id, content, metadata) {
    try {
      // Generate new embedding
      const embedding = await this.openaiEmbeddings.generateEmbedding(content);
      
      // Update in Supabase
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update({
          content,
          embedding,
          metadata: JSON.stringify(metadata),
          property_id: metadata.propertyId,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select();
      
      if (error) throw new Error(`Error updating embedding: ${error.message}`);
      
      return data[0];
    } catch (error) {
      console.error('Error in updateEmbedding:', error);
      throw error;
    }
  }

  /**
   * Delete an embedding by ID
   * @param {string} id - The ID of the embedding to delete
   * @returns {Promise<boolean>} - Success status
   */
  async deleteEmbedding(id) {
    try {
      const { error } = await this.supabase
        .from(this.tableName)
        .delete()
        .eq('id', id);
      
      if (error) throw new Error(`Error deleting embedding: ${error.message}`);
      
      return true;
    } catch (error) {
      console.error('Error in deleteEmbedding:', error);
      throw error;
    }
  }

  /**
   * Delete all embeddings for a property
   * @param {string} propertyId - The property ID
   * @returns {Promise<boolean>} - Success status
   */
  async deletePropertyEmbeddings(propertyId) {
    try {
      const { error } = await this.supabase
        .from(this.tableName)
        .delete()
        .eq('property_id', propertyId);
      
      if (error) throw new Error(`Error deleting property embeddings: ${error.message}`);
      
      return true;
    } catch (error) {
      console.error('Error in deletePropertyEmbeddings:', error);
      throw error;
    }
  }

  /**
   * Search for similar content using vector similarity
   * @param {string} query - The search query
   * @param {string} propertyId - The property ID to search within
   * @param {number} limit - Maximum number of results to return
   * @param {number} similarityThreshold - Minimum similarity score (0-1)
   * @returns {Promise<Array>} - Array of similar documents with scores
   */
  async searchSimilar(query, propertyId, limit = 5, similarityThreshold = 0.7) {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.openaiEmbeddings.generateEmbedding(query);
      
      // Perform vector similarity search using Supabase pgvector
      const { data, error } = await this.supabase
        .rpc('match_embeddings', {
          query_embedding: queryEmbedding,
          match_threshold: similarityThreshold,
          match_count: limit,
          p_property_id: propertyId
        });
      
      if (error) throw new Error(`Error in similarity search: ${error.message}`);
      
      // Format results
      return data.map(item => ({
        id: item.id,
        content: item.content,
        metadata: JSON.parse(item.metadata),
        similarity: item.similarity
      }));
    } catch (error) {
      console.error('Error in searchSimilar:', error);
      throw error;
    }
  }

  /**
   * Get all embeddings for a property
   * @param {string} propertyId - The property ID
   * @returns {Promise<Array>} - Array of embeddings
   */
  async getPropertyEmbeddings(propertyId) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('id, content, metadata, created_at, updated_at')
        .eq('property_id', propertyId);
      
      if (error) throw new Error(`Error fetching property embeddings: ${error.message}`);
      
      return data.map(item => ({
        ...item,
        metadata: JSON.parse(item.metadata)
      }));
    } catch (error) {
      console.error('Error in getPropertyEmbeddings:', error);
      throw error;
    }
  }
}

module.exports = VectorDatabase;