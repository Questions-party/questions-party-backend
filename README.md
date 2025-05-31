# English Learning Website - Backend API

A Node.js/Express backend API for an interactive English learning platform where users can submit words, generate AI-powered sentences, and explore community-generated content.

## Features

- **User Authentication**: JWT-based authentication with registration and login
- **Word Management**: CRUD operations for user's word collections
- **AI Sentence Generation**: OpenAI integration for generating sentences using user's words
- **Community Features**: Public feed of generated sentences with like system
- **Rate Limiting**: Protection against abuse with configurable rate limits
- **Data Validation**: Comprehensive input validation using Joi
- **Error Handling**: Centralized error handling with detailed responses

## Technology Stack

- **Node.js** (v18+) - Runtime environment
- **Express.js** - Web application framework
- **MongoDB** - Primary database
- **Mongoose** - MongoDB object modeling
- **JWT** - Authentication tokens
- **OpenAI API** - AI sentence generation
- **Joi** - Data validation
- **bcryptjs** - Password hashing

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd questions-party-backend
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Configure environment variables in `.env`:
```env
# Database
MONGODB_URI=mongodb://localhost:27017/english-learning

# JWT
JWT_SECRET=your_super_secret_jwt_key_here

# AI Service
OPENAI_API_KEY=your_openai_api_key_here

# Server
PORT=5000
NODE_ENV=development

# CORS
FRONTEND_URL=http://localhost:3000
```

5. Start the server:
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user info
- `PUT /api/auth/profile` - Update user profile
- `PUT /api/auth/preferences` - Update user preferences

### Words Management
- `GET /api/words` - Get user's words (with pagination, search, sorting)
- `POST /api/words` - Add new word
- `PUT /api/words/:id` - Update word
- `DELETE /api/words/:id` - Delete word
- `GET /api/words/random` - Get random words
- `GET /api/words/stats` - Get word statistics

### Sentence Generation
- `POST /api/generate` - Generate sentence with AI
- `GET /api/generations` - Get user's generations
- `GET /api/generations/public` - Get public generations feed
- `GET /api/generations/:id` - Get single generation
- `POST /api/generations/:id/like` - Toggle like on generation
- `PUT /api/generations/:id/privacy` - Update generation privacy
- `DELETE /api/generations/:id` - Delete generation

### Health Check
- `GET /api/health` - Server health status

## Database Schema

### Users Collection
```javascript
{
  username: String, // unique, 3-30 chars
  email: String, // unique, valid email
  password: String, // hashed, min 6 chars
  preferences: {
    theme: String, // 'light' | 'dark'
    language: String, // 'en' | 'zh'
    showPublicGenerations: Boolean
  },
  createdAt: Date,
  updatedAt: Date
}
```

### Words Collection
```javascript
{
  word: String, // lowercase, max 50 chars
  userId: ObjectId, // reference to Users
  definition: String, // optional, max 500 chars
  partOfSpeech: String, // optional enum
  usageCount: Number, // default 0
  createdAt: Date,
  updatedAt: Date
}
```

### Generations Collection
```javascript
{
  userId: ObjectId, // reference to Users
  words: [String], // array of words used
  sentence: String, // AI generated sentence
  explanation: String, // syntax explanation
  isPublic: Boolean, // default true
  likes: [{
    userId: ObjectId,
    createdAt: Date
  }],
  likeCount: Number, // denormalized
  aiModel: String, // AI model used
  promptVersion: String, // prompt version
  createdAt: Date,
  updatedAt: Date
}
```

## Rate Limiting

- **General API**: 100 requests per 15 minutes per IP
- **Authentication**: 5 requests per 15 minutes per IP
- **AI Generation**: 10 requests per 15 minutes per IP

## Error Responses

All errors follow this format:
```json
{
  "success": false,
  "message": "Error description",
  "stack": "Error stack (development only)"
}
```

## Security Features

- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing
- **Rate Limiting**: Request throttling
- **JWT Authentication**: Secure token-based auth
- **Password Hashing**: bcrypt with salt rounds
- **Input Validation**: Joi schema validation
- **MongoDB Injection Protection**: Mongoose sanitization

## Development

### Project Structure
```
src/
├── controllers/     # Route handlers
├── models/         # Mongoose models
├── routes/         # Express routes
├── middleware/     # Custom middleware
├── services/       # Business logic services
└── utils/          # Utility functions

config/             # Configuration files
```

### Adding New Features

1. Create model in `src/models/`
2. Create controller in `src/controllers/`
3. Create routes in `src/routes/`
4. Add middleware if needed
5. Update main app.js to mount routes

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/english-learning` |
| `JWT_SECRET` | JWT signing secret | `fallback_secret_key` |
| `OPENAI_API_KEY` | OpenAI API key | Required for AI features |
| `PORT` | Server port | `5000` |
| `NODE_ENV` | Environment mode | `development` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:3000` |

## Deployment

1. Set production environment variables
2. Ensure MongoDB is accessible
3. Configure OpenAI API key
4. Use PM2 for process management:
```bash
npm install -g pm2
pm2 start src/server.js --name "english-learning-api"
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the ISC License. 