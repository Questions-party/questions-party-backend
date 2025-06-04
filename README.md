# English Learning Website - Backend API

A Node.js/Express backend API for an interactive English learning platform where users can submit words, generate AI-powered sentences, and explore community-generated content.

## Features

- **User Authentication**: JWT-based authentication with registration and login
- **Word Management**: CRUD operations for user's word collections
- **AI Sentence Generation**: SiliconFlow/Qwen integration for generating sentences using user's words
- **Dynamic Model Selection**: Automatically selects optimal AI model based on input complexity
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
- **SiliconFlow API** - Primary AI sentence generation with dynamic model selection
  - **Qwen/Qwen3-8B** - Light model for simple inputs
  - **Qwen/Qwen3-14B** - Medium model for moderate complexity
  - **Qwen/Qwen3-30B-A3B** - Heavy model for complex inputs
- **OpenAI API** - Optional/backup AI provider
- **Joi** - Data validation
- **bcryptjs** - Password hashing

## Dynamic Model Selection

The platform automatically selects the most appropriate AI model based on input complexity to optimize performance, cost, and quality:

### Word Generation (Max: 50 words)
- **🚀 Light Model (Qwen/Qwen3-8B)**: 1-16 words
  - Fast processing for simple sentence generation
  - Optimal for basic vocabulary practice
- **⚡ Medium Model (Qwen/Qwen3-14B)**: 17-33 words
  - Balanced performance for moderate complexity
  - Better handling of multi-concept sentences
- **🔥 Heavy Model (Qwen/Qwen3-30B-A3B)**: 34-50 words
  - Advanced processing for complex sentence structures
  - Superior quality for challenging word combinations

### Sentence Checking (Max: 800 characters)
- **🚀 Light Model (Qwen/Qwen3-8B)**: 1-266 characters
  - Quick analysis for short sentences
  - Efficient grammar checking for basic text
- **⚡ Medium Model (Qwen/Qwen3-14B)**: 267-533 characters
  - Enhanced analysis for paragraph-length text
  - Better context understanding
- **🔥 Heavy Model (Qwen/Qwen3-30B-A3B)**: 534-800 characters
  - Comprehensive analysis for long, complex sentences
  - Advanced reasoning for sophisticated grammar patterns

### Benefits
- **Performance Optimization**: Faster responses for simple inputs
- **Cost Efficiency**: Resource allocation based on actual needs
- **Quality Scaling**: Advanced models for complex tasks requiring deeper analysis
- **Automatic Selection**: No manual configuration required

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

# AI Service - SiliconFlow (Primary with Dynamic Model Selection)
SILICONFLOW_API_KEY=your_siliconflow_api_key_here
SILICONFLOW_API_URL=https://api.siliconflow.cn/v1/chat/completions

# Dynamic Model Configuration (based on input complexity)
# Light model for simple inputs (1-16 words / 1-266 characters)
SILICONFLOW_MODEL_LIGHT=Qwen/Qwen3-8B
# Medium model for moderate inputs (17-33 words / 267-533 characters)
SILICONFLOW_MODEL_MEDIUM=Qwen/Qwen3-14B
# Heavy model for complex inputs (34-50 words / 534-800 characters)
SILICONFLOW_MODEL_HEAVY=Qwen/Qwen3-30B-A3B

# Legacy model for backward compatibility
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

### Sentence Generation (with Dynamic Model Selection)
- `POST /api/generate` - Generate sentence with AI **[Auth Required]**
- `GET /api/generations` - Get user's generations **[Auth Required]**
- `GET /api/generations/public` - Get public generations feed **[Public Access]**
- `GET /api/generations/:id` - Get single generation **[Public for public content]**
- `POST /api/generations/:id/like` - Toggle like on generation **[Auth Required]**
- `PUT /api/generations/:id/privacy` - Update generation privacy **[Auth Required]**
- `DELETE /api/generations/:id` - Delete generation **[Auth Required]**

### Sentence Checking (with Dynamic Model Selection)
- `POST /api/check` - Check sentence with AI **[Auth Required]**
- `GET /api/checks` - Get user's sentence checks **[Auth Required]**
- `GET /api/checks/public` - Get public sentence checks feed **[Public Access]**
- `GET /api/checks/:id` - Get single sentence check **[Public for public content]**
- `POST /api/checks/:id/like` - Toggle like on sentence check **[Auth Required]**
- `PUT /api/checks/:id/privacy` - Update sentence check privacy **[Auth Required]**
- `DELETE /api/checks/:id` - Delete sentence check **[Auth Required]**

### Health Check
- `GET /api/health` - Server health status **[Public Access]**

## Public Access Features

The API supports public access for viewing content without authentication:

- **Public Generations Feed**: Anyone can view public generations at `/api/generations/public`
- **Public Sentence Checks Feed**: Anyone can view public sentence checks at `/api/checks/public`
- **Individual Public Content**: Public generations and checks can be viewed by anyone
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
    showPublicGenerations: Boolean,
    grammarExplanationLanguage: String // 'combined' | 'pure'
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
  chineseTranslation: String, // Chinese translation
  thinkingText: String, // AI reasoning (from QwQ model)
  isPublic: Boolean, // default true
  likes: [{
    userId: ObjectId,
    createdAt: Date
  }],
  likeCount: Number, // denormalized
  aiModel: String, // AI model used (default: Qwen/QwQ-32B)
  promptVersion: String, // prompt version
  // Dynamic model selection information
  modelSelection: {
    inputSize: Number, // Number of words used
    selectedModel: String, // Actual model used (e.g., 'Qwen/Qwen3-8B')
    selectionReason: String // Reason for selection (e.g., 'Word count: 5 words')
  },
  createdAt: Date,
  updatedAt: Date
}
```

### SentenceChecks Collection
```javascript
{
  userId: ObjectId, // reference to Users
  originalSentence: String, // sentence to check (max 800 chars)
  grammarAnalysis: String, // AI grammar analysis
  grammarCorrection: String, // AI grammar correction
  keywordAnalysis: String, // AI keyword analysis
  chineseDefinition: String, // Chinese definition
  thinkingText: String, // AI reasoning process
  rawResponseContent: String, // Raw AI response for debugging
  isPublic: Boolean, // default true
  likes: [{
    userId: ObjectId,
    createdAt: Date
  }],
  likeCount: Number, // denormalized
  aiModel: String, // AI model used
  grammarLanguageOption: String, // 'combined' | 'pure'
  // Dynamic model selection information
  modelSelection: {
    inputSize: Number, // Number of characters in sentence
    selectedModel: String, // Actual model used (e.g., 'Qwen/Qwen3-8B')
    selectionReason: String // Reason for selection (e.g., 'Sentence length: 150 characters')
  },
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

### SiliconFlow (Primary Provider with Dynamic Selection)
- **Light Model**: Qwen/Qwen3-8B for simple inputs
- **Medium Model**: Qwen/Qwen3-14B for moderate complexity
- **Heavy Model**: Qwen/Qwen3-30B-A3B for complex inputs
- **Features**: 
  - Dynamic model selection based on input complexity
  - Cost optimization through appropriate model usage
  - Performance scaling for different use cases
  - Advanced reasoning capabilities

### Configuration-Driven Approach
- **Dynamic Request Building**: Configurable request templates and paths
- **Response Parsing**: Dynamic content extraction using path configurations
- **API Key Management**: Encrypted storage with multiple placement options
- **Multi-Provider Support**: Easy integration of different AI providers
- **Model Selection Logic**: Automatic complexity-based model selection

### Model Selection Algorithm
```javascript
// Word Generation (max 50 words)
if (wordCount < 17) {
  selectedModel = "Qwen/Qwen3-8B"      // Light: 1-16 words
} else if (wordCount < 34) {
  selectedModel = "Qwen/Qwen3-14B"     // Medium: 17-33 words
} else {
  selectedModel = "Qwen/Qwen3-30B-A3B" // Heavy: 34-50 words
}

// Sentence Checking (max 800 characters)
if (charCount < 267) {
  selectedModel = "Qwen/Qwen3-8B"      // Light: 1-266 chars
} else if (charCount < 534) {
  selectedModel = "Qwen/Qwen3-14B"     // Medium: 267-533 chars
} else {
  selectedModel = "Qwen/Qwen3-30B-A3B" // Heavy: 534-800 chars
}
```

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
├── services/       # Business logic services (including AI service with dynamic selection)
└── utils/          # Utility functions (HTTP utils, encryption)

config/             # Configuration files (including dynamic model config)
```

### Adding New Features

1. Create model in `src/models/`
2. Create controller in `src/controllers/`
3. Create routes in `src/routes/`
4. Add middleware if needed
5. Update main app.js to mount routes

## Deployment

1. Set production environment variables (including all dynamic model configurations)
2. Ensure MongoDB is accessible
3. Configure SiliconFlow API key and model configurations
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