# Overview

This is a chat application built with a React frontend and Express backend that integrates with OpenAI's Assistant API. The application provides a conversational interface where users can interact with an AI assistant through a web chat interface. The backend handles API requests to OpenAI and creates fresh conversation threads for each message exchange.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Components**: Built with shadcn/ui component library based on Radix UI primitives
- **Styling**: Tailwind CSS with custom CSS variables for theming
- **State Management**: React Query (TanStack Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Forms**: React Hook Form with Zod validation resolvers

## Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful API structure with a single chat endpoint
- **Development Setup**: ESBuild for production bundling, TSX for development
- **Request Handling**: Express middleware for JSON parsing and URL encoding
- **Error Handling**: Centralized error handling middleware with status code management

## Data Storage
- **Database**: PostgreSQL configured with Drizzle ORM
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Connection**: Neon Database serverless driver for PostgreSQL connectivity
- **In-Memory Storage**: Fallback memory storage implementation for development

## Authentication & Session Management
- **Session Storage**: PostgreSQL-backed sessions using connect-pg-simple
- **User Schema**: Basic user model with username/password authentication
- **Validation**: Zod schemas for user input validation

## Chat System Design
- **Conversation Model**: Stateless chat - creates fresh OpenAI thread for each message
- **No Persistence**: Messages are not stored locally, relying on OpenAI's threading system
- **Real-time Features**: Typing indicators and optimistic UI updates
- **Error Handling**: Graceful error handling with user-friendly toast notifications

# External Dependencies

## AI Integration
- **OpenAI API**: Assistant API for conversational AI capabilities
- **Configuration**: Environment-based API key and Assistant ID management
- **Threading**: Creates new conversation threads for each interaction

## Database & Storage
- **Neon Database**: Serverless PostgreSQL hosting
- **Drizzle ORM**: Type-safe database queries and schema management
- **Connect PG Simple**: PostgreSQL session store for Express sessions

## UI & Design System
- **Radix UI**: Headless UI components for accessibility and functionality
- **shadcn/ui**: Pre-built component library with consistent design patterns
- **Tailwind CSS**: Utility-first CSS framework with custom design tokens
- **Lucide React**: Icon library for consistent iconography

## Development & Build Tools
- **Vite**: Fast build tool and development server
- **TypeScript**: Type safety across frontend and backend
- **ESBuild**: Fast bundling for production builds
- **Replit Integration**: Development environment optimizations and error handling