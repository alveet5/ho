const { Configuration, OpenAIApi } = require('openai');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Configure OpenAI API
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

class OpenAIEmbeddings {
  /**
   * Generate an embedding for a text string
   * @param {string} text - The text to generate an embedding for
   * @returns {Promise<number[]>} - The embedding vector
   */
  async generateEmbedding(text) {
    try {
      const response = await openai.createEmbedding({
        model: 'text-embedding-ada-002',
        input: text,
      });
      
      return response.data.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error('Failed to generate embedding');
    }
  }
  
  /**
   * Find similar content based on a query
   * @param {string} propertyId - The property ID to search within
   * @param {string} query - The query text
   * @param {number} limit - Maximum number of results to return
   * @returns {Promise<Array>} - Array of similar content items
   */
  async findSimilarContent(propertyId, query, limit = 5) {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);
      
      // Find similar content using vector similarity search
      // Note: This is a simplified version. In production, you would use a vector database
      // like Pinecone, Weaviate, or Supabase Vector for more efficient similarity search
      const similarContent = await prisma.$queryRaw`
        SELECT 
          id, 
          content, 
          metadata,
          1 - (embedding <=> ${queryEmbedding}::vector) as similarity
        FROM "VectorEmbedding"
        WHERE "propertyId" = ${propertyId}
        ORDER BY similarity DESC
        LIMIT ${limit};
      `;
      
      return similarContent;
    } catch (error) {
      console.error('Error finding similar content:', error);
      return [];
    }
  }
}

module.exports = {
  openai,
  OpenAIEmbeddings,
};