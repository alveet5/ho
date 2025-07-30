const { openai } = require('./openai');
const { PrismaClient } = require('@prisma/client');
const VectorDatabase = require('./vector-database');

const prisma = new PrismaClient();
const vectorDb = new VectorDatabase();

class AIAssistant {
  /**
   * Process a message from a guest and generate a response
   * @param {string} propertyId - The property ID
   * @param {string} conversationId - The conversation ID
   * @param {string} message - The message from the guest
   * @returns {Promise<string>} - The AI-generated response
   */
  async processMessage(propertyId, conversationId, message) {
    try {
      // Get property details
      const property = await prisma.property.findUnique({
        where: { id: propertyId },
        include: { propertyDetails: true },
      });
      
      if (!property) {
        throw new Error('Property not found');
      }
      
      // Get conversation history (last 10 messages)
      const messageHistory = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      
      // Reverse to get chronological order
      const chronologicalMessages = [...messageHistory].reverse();
      
      // Find relevant information using vector database
      const relevantInfo = await vectorDb.searchSimilar(message, propertyId, 3, 0.6);
      
      // Format conversation history for the prompt
      const formattedHistory = chronologicalMessages.map(msg => {
        const role = msg.isFromGuest ? 'Guest' : 'Host';
        return `${role}: ${msg.content}`;
      }).join('\n');
      
      // Format relevant information for the prompt
      const formattedRelevantInfo = relevantInfo.map(info => info.content).join('\n');
      
      // Create system prompt
      const systemPrompt = this.createSystemPrompt(property, formattedRelevantInfo);
      
      // Generate response using GPT
      const completion = await openai.createChatCompletion({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Conversation history:\n${formattedHistory}\n\nGuest's latest message: ${message}` },
        ],
        max_tokens: 500,
        temperature: 0.7,
      });
      
      return completion.data.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error processing message with AI:', error);
      return 'I apologize, but I encountered an issue processing your request. Please try again later or contact the host directly.';
    }
  }
  
  /**
   * Create a system prompt for the AI based on property details
   * @param {Object} property - The property object with details
   * @param {string} relevantInfo - Relevant information for the query
   * @returns {string} - The system prompt
   */
  createSystemPrompt(property, relevantInfo) {
    const { name } = property;
    const details = property.propertyDetails || {};
    
    return `You are an AI assistant for ${name}, an Airbnb/rental property. Your name is Hostenly.

Your role is to assist guests by providing accurate information about the property and answering their questions in a friendly, helpful manner.

Here is specific information about the property that you can use to answer guest questions:

${relevantInfo}

Additional property details:
${details.checkInTime ? `- Check-in time: ${details.checkInTime}` : ''}
${details.checkOutTime ? `- Check-out time: ${details.checkOutTime}` : ''}
${details.wifiPassword ? `- WiFi password: ${details.wifiPassword}` : ''}
${details.location ? `- Location: ${details.location}` : ''}

Important guidelines:
1. Only provide information that is contained in the property details above.
2. If you don't know the answer to a question, politely say so and offer to relay the message to the host.
3. Be conversational and friendly, but professional.
4. Keep responses concise and to the point.
5. Do not make up or hallucinate any information that is not provided.
6. If asked about something not in your knowledge base, say: "I don't have that information available, but I can ask the host for you."
7. Never share the WiFi password unless specifically asked for it.

Respond to the guest's latest message based on the conversation history and the information provided.`;
  }
}

module.exports = {
  AIAssistant,
};