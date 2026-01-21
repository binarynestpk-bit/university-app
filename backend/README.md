# WiseRoute Backend API

Backend server for WiseRoute - University Transport Management System

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB Atlas
- **File Storage:** Cloudinary
- **Real-time:** Socket.io
- **Authentication:** JWT, Passport.js

## Features

- User authentication (students, admins, drivers)
- Route and booking management
- Real-time bus tracking with Socket.io
- Announcements and notifications
- Invoice generation
- Seat booking system
- AI-powered chatbot
- Email notifications

## Environment Variables

Create a `.env` file with:

```env
PORT=5000
MONGO_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret
EMAIL_USER=your_email
EMAIL_PASS=your_email_password
NODE_ENV=production
```

## Installation

```bash
npm install
```

## Running

```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

- `/api/auth` - Authentication
- `/api/users` - User management
- `/api/admin` - Admin operations
- `/api/student` - Student operations
- `/api/notifications` - Notifications
- `/api/announcements` - Announcements
- `/api/chat` - Chatbot

## Deployment

This backend is configured for deployment on Railway.app or Render.com

## License

ISC
