# English Learning Website - Backend API

A Node.js/Express backend API for an interactive English learning platform where users can submit words, generate AI-powered sentences, and explore community-generated content.

## Features

- **User Authentication**: JWT-based authentication with registration and login
- **Word Management**: CRUD operations for user's word collections
- **AI Sentence Generation**: SiliconFlow/Qwen integration for generating sentences using user's words
- **AI Configuration Management**: Flexible, configuration-driven AI provider support
- **Community Features**: Public feed of generated sentences with like system (no auth required for viewing)
- **Public Access**: Anonymous users can view public content without authentication
- **Rate Limiting**: Protection against abuse with configurable rate limits
- **Data Validation**: Comprehensive input validation using Joi
- **Error Handling**: Centralized error handling with detailed responses

## Technology Stack

- **Node.js** (v18+) - Runtime environment
- **Express.js** - Web application framework
- **MongoDB** - Primary database
- **Mongoose** - MongoDB object modeling
- **JWT** - Authentication tokens
- **SiliconFlow API** - Primary AI sentence generation (Qwen/QwQ-32B model)
- **OpenAI API** - Optional/backup AI provider
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
cp env.example .env
```

4. Configure environment variables in `.env`:
```env
# Database
MONGODB_URI=mongodb://localhost:27017/english-learning

# JWT
JWT_SECRET=your_super_secret_jwt_key_here

# AI Service - SiliconFlow (Primary)
SILICONFLOW_API_KEY=your_siliconflow_api_key_here
SILICONFLOW_API_URL=https://api.siliconflow.cn/v1/chat/completions
SILICONFLOW_MODEL=Qwen/QwQ-32B

# AI Service - OpenAI (Optional/Backup)
OPENAI_API_KEY=your_openai_api_key_here

# Server
PORT=5000
NODE_ENV=development

# CORS
FRONTEND_URL=http://localhost:3000

# Rate Limiting (Optional)
RATE_LIMIT_MAX_PUBLIC=200
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
- `GET /api/words` - Get user's words (with pagination, search, sorting) **[Auth Required]**
- `POST /api/words` - Add new word **[Auth Required]**
- `PUT /api/words/:id` - Update word **[Auth Required]**
- `DELETE /api/words/:id` - Delete word **[Auth Required]**
- `GET /api/words/random` - Get random words **[Auth Required]**
- `GET /api/words/stats` - Get word statistics **[Auth Required]**

### AI Configuration Management
- `GET /api/ai-configs` - Get user's AI configurations **[Auth Required]**
- `POST /api/ai-configs` - Create AI configuration **[Auth Required]**
- `GET /api/ai-configs/:id` - Get single AI configuration **[Auth Required]**
- `PUT /api/ai-configs/:id` - Update AI configuration **[Auth Required]**
- `DELETE /api/ai-configs/:id` - Delete AI configuration **[Auth Required]**
- `POST /api/ai-configs/:id/test` - Test AI configuration **[Auth Required]**
- `POST /api/ai-configs/default` - Create default SiliconFlow config **[Auth Required]**

### Sentence Generation
- `POST /api/generate` - Generate sentence with AI **[Auth Required]**
- `GET /api/generations` - Get user's generations **[Auth Required]**
- `GET /api/generations/public` - Get public generations feed **[Public Access]**
- `GET /api/generations/:id` - Get single generation **[Public for public content]**
- `POST /api/generations/:id/like` - Toggle like on generation **[Auth Required]**
- `PUT /api/generations/:id/privacy` - Update generation privacy **[Auth Required]**
- `DELETE /api/generations/:id` - Delete generation **[Auth Required]**

### Health Check
- `GET /api/health` - Server health status **[Public Access]**

## Public Access Features

The API supports public access for viewing content without authentication:

- **Public Generations Feed**: Anyone can view public generations at `/api/generations/public`
- **Individual Public Generations**: Public generations can be viewed by anyone
- **Higher Rate Limits**: Public endpoints have higher rate limits (200 vs 100 requests per 15 minutes)
- **Like Functionality**: Requires authentication - anonymous users can view but not like content

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
  configId: ObjectId, // reference to AIConfig (optional)
  words: [String], // array of words used
  sentence: String, // AI generated sentence
  explanation: String, // syntax explanation
  thinkingText: String, // AI reasoning (from QwQ model)
  isPublic: Boolean, // default true
  likes: [{
    userId: ObjectId,
    createdAt: Date
  }],
  likeCount: Number, // denormalized
  aiModel: String, // AI model used (default: Qwen/QwQ-32B)
  promptVersion: String, // prompt version
  createdAt: Date,
  updatedAt: Date
}
```

### AI Configurations Collection
```javascript
{
  userId: ObjectId, // reference to Users
  name: String, // configuration name
  apiUrl: String, // AI API endpoint
  apiKey: String, // encrypted API key
  apiKeyPlacement: String, // 'header' | 'body' | 'custom_header'
  model: String, // AI model name
  requestTemplate: Object, // dynamic request template
  responseTemplate: Object, // response structure example
  // Path configurations for dynamic parsing
  requestMessageGroupPath: String,
  requestRolePathFromGroup: String,
  requestTextPathFromGroup: String,
  responseTextPath: String,
  responseThinkingTextPath: String,
  // Role mappings
  requestUserRoleField: String,
  requestAssistantField: String,
  headers: Map, // custom headers
  isAvailable: Boolean, // configuration status
  lastUsedTime: Date,
  createdAt: Date,
  updatedAt: Date
}
```

## Rate Limiting

- **General API**: 100 requests per 15 minutes per IP
- **Public Content**: 200 requests per 15 minutes per IP
- **Authentication**: 5 requests per 15 minutes per IP
- **AI Generation**: 10 requests per 15 minutes per IP

## AI Integration

### SiliconFlow (Primary Provider)
- **Model**: Qwen/QwQ-32B with reasoning capabilities
- **Features**: Advanced thinking/reasoning text generation
- **Configuration**: Flexible, user-configurable API settings

### Configuration-Driven Approach
- **Dynamic Request Building**: Configurable request templates and paths
- **Response Parsing**: Dynamic content extraction using path configurations
- **API Key Management**: Encrypted storage with multiple placement options
- **Multi-Provider Support**: Easy integration of different AI providers

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
- **Rate Limiting**: Request throttling with different limits for public/private content
- **JWT Authentication**: Secure token-based auth
- **Password Hashing**: bcrypt with salt rounds
- **Input Validation**: Joi schema validation
- **MongoDB Injection Protection**: Mongoose sanitization
- **API Key Encryption**: Secure storage of AI provider API keys

## Development

### Project Structure
```
src/
├── controllers/     # Route handlers
├── models/         # Mongoose models
├── routes/         # Express routes
├── middleware/     # Custom middleware
├── services/       # Business logic services
└── utils/          # Utility functions (HTTP utils, encryption)

config/             # Configuration files
```

### Adding New Features

1. Create model in `src/models/`
2. Create controller in `src/controllers/`
3. Create routes in `src/routes/`
4. Add middleware if needed
5. Update main app.js to mount routes

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