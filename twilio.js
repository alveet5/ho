const twilio = require('twilio');
const { PrismaClient } = require('@prisma/client');
const AIAssistant = require('./ai-assistant');

const prisma = new PrismaClient();
const aiAssistant = new AIAssistant();

class TwilioService {
  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  }

  /**
   * Send a message via Twilio (WhatsApp)
   * @param {string} from - The sender's phone number (host/property number)
   * @param {string} to - The recipient's phone number (guest number)
   * @param {string} body - The message content
   * @returns {Promise} - The Twilio API response
   */
  async sendMessage(from, to, body) {
    try {
      // Format numbers for WhatsApp if they don't already have the WhatsApp: prefix
      const formattedFrom = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
      const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
      
      // Send message via Twilio
      const message = await this.client.messages.create({
        from: formattedFrom,
        to: formattedTo,
        body,
      });
      
      console.log(`Message sent via Twilio: ${message.sid}`);
      return message;
    } catch (error) {
      console.error('Error sending message via Twilio:', error);
      throw new Error('Failed to send message via Twilio');
    }
  }

  /**
   * Send WhatsApp message using the default Twilio number
   * @param {string} to - Recipient phone number
   * @param {string} body - Message content
   * @returns {Promise<Object>} - Twilio message object
   */
  async sendWhatsAppMessage(to, body) {
    try {
      // Format recipient number for WhatsApp
      const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
      
      // Send message via Twilio
      const message = await this.client.messages.create({
        from: `whatsapp:${this.twilioPhoneNumber}`,
        to: formattedTo,
        body,
      });
      
      return message;
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      throw error;
    }
  }

  /**
   * Process incoming WhatsApp message
   * @param {Object} messageData - Twilio message data
   * @returns {Promise<Object>} - Processing result
   */
  async processIncomingMessage(messageData) {
    try {
      const { From, To, Body, ProfileName } = messageData;
      
      // Format phone numbers (remove WhatsApp: prefix if present)
      const guestPhoneNumber = From.replace('whatsapp:', '');
      const propertyPhoneNumber = To.replace('whatsapp:', '');
      
      // Find property by phone number
      const property = await prisma.property.findFirst({
        where: { phoneNumber: propertyPhoneNumber },
      });
      
      if (!property) {
        console.error(`No property found with phone number: ${propertyPhoneNumber}`);
        return { success: false, error: 'Property not found' };
      }
      
      // Check if user has reached message limit
      const user = await prisma.user.findUnique({
        where: { id: property.userId },
      });
      
      if (user.messageCount >= user.messageLimit) {
        // Send message limit reached notification
        await this.sendWhatsAppMessage(
          guestPhoneNumber,
          'I apologize, but this property has reached its message limit. Please contact the host directly.'
        );
        
        return { success: false, error: 'Message limit reached' };
      }
      
      // Find or create conversation
      let conversation = await prisma.conversation.findFirst({
        where: {
          propertyId: property.id,
          guestPhoneNumber,
        },
      });
      
      if (!conversation) {
        // Create new conversation
        conversation = await prisma.conversation.create({
          data: {
            propertyId: property.id,
            guestPhoneNumber,
            guestName: ProfileName || 'Guest',
          },
        });
      }
      
      // Store guest message
      const message = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          content: Body,
          isFromGuest: true,
        },
      });
      
      // Increment user message count
      await prisma.user.update({
        where: { id: property.userId },
        data: { messageCount: { increment: 1 } },
      });
      
      // Generate AI response
      const aiResponse = await aiAssistant.processMessage(
        property.id,
        conversation.id,
        Body
      );
      
      // Store AI response
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          content: aiResponse,
          isFromGuest: false,
        },
      });
      
      // Increment user message count again (for AI response)
      await prisma.user.update({
        where: { id: property.userId },
        data: { messageCount: { increment: 1 } },
      });
      
      // Send response via WhatsApp
      await this.sendWhatsAppMessage(guestPhoneNumber, aiResponse);
      
      return {
        success: true,
        propertyId: property.id,
        conversationId: conversation.id,
        messageId: message.id,
      };
    } catch (error) {
      console.error('Error processing incoming WhatsApp message:', error);
      throw error;
    }
  }

  /**
   * Send manual message from host
   * @param {string} conversationId - Conversation ID
   * @param {string} content - Message content
   * @returns {Promise<Object>} - Message object
   */
  async sendManualMessage(conversationId, content) {
    try {
      // Get conversation
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { property: true },
      });
      
      if (!conversation) {
        throw new Error('Conversation not found');
      }
      
      // Store host message
      const message = await prisma.message.create({
        data: {
          conversationId,
          content,
          isFromGuest: false,
        },
      });
      
      // Increment user message count
      await prisma.user.update({
        where: { id: conversation.property.userId },
        data: { messageCount: { increment: 1 } },
      });
      
      // Send message via WhatsApp
      await this.sendWhatsAppMessage(conversation.guestPhoneNumber, content);
      
      return message;
    } catch (error) {
      console.error('Error sending manual message:', error);
      throw error;
    }
  }

  /**
   * Generate QR code for WhatsApp
   * @param {string} propertyId - Property ID
   * @returns {Promise<string>} - QR code URL
   */
  async generateWhatsAppQRCode(propertyId) {
    try {
      // Get property
      const property = await prisma.property.findUnique({
        where: { id: propertyId },
      });
      
      if (!property) {
        throw new Error('Property not found');
      }
      
      // Format phone number for WhatsApp
      const formattedNumber = property.phoneNumber.startsWith('+') 
        ? property.phoneNumber.substring(1) 
        : property.phoneNumber;
      
      // Generate WhatsApp link
      const whatsappLink = `https://wa.me/${formattedNumber}`;
      
      // Generate QR code URL using a third-party service
      // For simplicity, we're using the Google Charts API here
      const qrCodeUrl = `https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=${encodeURIComponent(whatsappLink)}`;
      
      return qrCodeUrl;
    } catch (error) {
      console.error('Error generating WhatsApp QR code:', error);
      throw error;
    }
  }
}

module.exports = new TwilioService();