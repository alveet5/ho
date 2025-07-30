const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class StripeService {
  /**
   * Create a Stripe customer for a user
   * @param {Object} user - User object with id, name, and email
   * @returns {Promise<string>} - Stripe customer ID
   */
  async createCustomer(user) {
    try {
      // Check if user already has a Stripe customer ID
      if (user.stripeCustomerId) {
        return user.stripeCustomerId;
      }
      
      // Create a new customer in Stripe
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || user.email,
        metadata: {
          userId: user.id,
        },
      });
      
      // Update user with Stripe customer ID
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customer.id },
      });
      
      return customer.id;
    } catch (error) {
      console.error('Error creating Stripe customer:', error);
      throw error;
    }
  }

  /**
   * Create a checkout session for subscription
   * @param {string} customerId - Stripe customer ID
   * @param {string} priceId - Stripe price ID for the subscription plan
   * @param {string} successUrl - URL to redirect after successful payment
   * @param {string} cancelUrl - URL to redirect after cancelled payment
   * @returns {Promise<Object>} - Checkout session
   */
  async createCheckoutSession(customerId, priceId, successUrl, cancelUrl) {
    try {
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      
      return session;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      throw error;
    }
  }

  /**
   * Create a portal session for managing subscription
   * @param {string} customerId - Stripe customer ID
   * @param {string} returnUrl - URL to return to after portal session
   * @returns {Promise<Object>} - Portal session
   */
  async createPortalSession(customerId, returnUrl) {
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      
      return session;
    } catch (error) {
      console.error('Error creating portal session:', error);
      throw error;
    }
  }

  /**
   * Cancel a subscription
   * @param {string} subscriptionId - Stripe subscription ID
   * @returns {Promise<Object>} - Cancelled subscription
   */
  async cancelSubscription(subscriptionId) {
    try {
      const subscription = await stripe.subscriptions.cancel(subscriptionId);
      return subscription;
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      throw error;
    }
  }

  /**
   * Get subscription details
   * @param {string} subscriptionId - Stripe subscription ID
   * @returns {Promise<Object>} - Subscription details
   */
  async getSubscription(subscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      return subscription;
    } catch (error) {
      console.error('Error retrieving subscription:', error);
      throw error;
    }
  }

  /**
   * Get all subscriptions for a customer
   * @param {string} customerId - Stripe customer ID
   * @returns {Promise<Array>} - List of subscriptions
   */
  async getCustomerSubscriptions(customerId) {
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        expand: ['data.default_payment_method'],
      });
      
      return subscriptions.data;
    } catch (error) {
      console.error('Error retrieving customer subscriptions:', error);
      throw error;
    }
  }

  /**
   * Handle Stripe webhook events
   * @param {Object} event - Stripe event object
   * @returns {Promise<void>}
   */
  async handleWebhookEvent(event) {
    try {
      const { type, data } = event;
      
      switch (type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionChange(data.object);
          break;
          
        case 'customer.subscription.deleted':
          await this.handleSubscriptionCancelled(data.object);
          break;
          
        case 'invoice.payment_succeeded':
          await this.handleInvoicePaid(data.object);
          break;
          
        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(data.object);
          break;
      }
    } catch (error) {
      console.error('Error handling webhook event:', error);
      throw error;
    }
  }

  /**
   * Handle subscription created or updated
   * @param {Object} subscription - Stripe subscription object
   * @returns {Promise<void>}
   */
  async handleSubscriptionChange(subscription) {
    try {
      const customerId = subscription.customer;
      const status = subscription.status;
      const planId = subscription.items.data[0].price.id;
      
      // Get user by Stripe customer ID
      const user = await prisma.user.findUnique({
        where: { stripeCustomerId: customerId },
      });
      
      if (!user) {
        console.error(`No user found with Stripe customer ID: ${customerId}`);
        return;
      }
      
      // Map Stripe plan to subscription tier
      let subscriptionTier = 'FREE';
      let messageLimit = 100; // Default free tier limit
      
      // These IDs should match your Stripe product IDs
      if (planId === process.env.STRIPE_STARTER_PLAN_ID) {
        subscriptionTier = 'STARTER';
        messageLimit = 500;
      } else if (planId === process.env.STRIPE_PRO_PLAN_ID) {
        subscriptionTier = 'PRO';
        messageLimit = 2000;
      } else if (planId === process.env.STRIPE_ENTERPRISE_PLAN_ID) {
        subscriptionTier = 'ENTERPRISE';
        messageLimit = 10000; // Or any high number for "unlimited"
      }
      
      // Calculate subscription end date
      const subscriptionEnds = new Date(subscription.current_period_end * 1000);
      
      // Update user subscription details
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionTier,
          messageLimit,
          subscriptionEnds: status === 'active' ? subscriptionEnds : null,
        },
      });
    } catch (error) {
      console.error('Error handling subscription change:', error);
      throw error;
    }
  }

  /**
   * Handle subscription cancelled
   * @param {Object} subscription - Stripe subscription object
   * @returns {Promise<void>}
   */
  async handleSubscriptionCancelled(subscription) {
    try {
      const customerId = subscription.customer;
      
      // Get user by Stripe customer ID
      const user = await prisma.user.findUnique({
        where: { stripeCustomerId: customerId },
      });
      
      if (!user) {
        console.error(`No user found with Stripe customer ID: ${customerId}`);
        return;
      }
      
      // Update user subscription details
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionTier: 'FREE',
          messageLimit: 100, // Reset to free tier limit
          subscriptionEnds: null,
        },
      });
    } catch (error) {
      console.error('Error handling subscription cancellation:', error);
      throw error;
    }
  }

  /**
   * Handle invoice payment succeeded
   * @param {Object} invoice - Stripe invoice object
   * @returns {Promise<void>}
   */
  async handleInvoicePaid(invoice) {
    // This could be used for additional logic when an invoice is paid
    // For example, sending a receipt email or updating usage records
  }

  /**
   * Handle invoice payment failed
   * @param {Object} invoice - Stripe invoice object
   * @returns {Promise<void>}
   */
  async handleInvoicePaymentFailed(invoice) {
    try {
      const customerId = invoice.customer;
      
      // Get user by Stripe customer ID
      const user = await prisma.user.findUnique({
        where: { stripeCustomerId: customerId },
      });
      
      if (!user) {
        console.error(`No user found with Stripe customer ID: ${customerId}`);
        return;
      }
      
      // You could implement logic to notify the user about the failed payment
      // For example, sending an email or adding a notification in the app
    } catch (error) {
      console.error('Error handling invoice payment failure:', error);
      throw error;
    }
  }
}

module.exports = new StripeService();