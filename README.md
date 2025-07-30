# Hostenly - AI Assistant for Airbnb Hosts

Hostenly is a SaaS platform that allows Airbnb hosts to create personalized AI assistants that automatically respond to guest inquiries via WhatsApp and other messaging channels.

## Features

- **Easy Setup**: Hosts can quickly create an AI assistant by providing their business name, contact information, and property details
- **Personalized Responses**: AI assistants use property-specific information to answer guest questions accurately
- **WhatsApp Integration**: Seamless communication through WhatsApp using Twilio API
- **Host Dashboard**: Monitor conversations, update property information, and manage AI assistant settings
- **Knowledge Base Management**: Upload and update property details, house rules, local attractions, and more

## Tech Stack

- **Frontend**: Next.js with React
- **Backend**: Node.js with Express
- **Database**: PostgreSQL with Prisma ORM
- **AI Engine**: OpenAI's GPT-4 API
- **Vector Database**: Supabase Vector for efficient knowledge retrieval
- **Messaging**: Twilio API for WhatsApp integration
- **Authentication**: NextAuth.js
- **Hosting**: Vercel

## Project Structure

```
├── client/                 # Next.js frontend
│   ├── components/         # Reusable UI components
│   ├── pages/              # Application pages
│   ├── public/             # Static assets
│   ├── styles/             # CSS and styling
│   └── utils/              # Utility functions
├── server/                 # Node.js backend
│   ├── controllers/        # Request handlers
│   ├── models/             # Database models
│   ├── routes/             # API routes
│   ├── services/           # Business logic
│   └── utils/              # Utility functions
├── prisma/                 # Database schema and migrations
└── docs/                   # Documentation
```

## Getting Started

### Prerequisites

- Node.js (v16+)
- PostgreSQL database
- OpenAI API key
- Twilio account and API credentials
- Supabase account and credentials

### Installation

1. Clone the repository
2. Install dependencies for both client and server
3. Set up environment variables
4. Run database migrations
5. Start the development servers

Detailed setup instructions can be found in the [Installation Guide](./docs/installation.md).

## License

This project is licensed under the MIT License - see the LICENSE file for details.