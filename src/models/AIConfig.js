const mongoose = require('mongoose');

const aiConfigSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  apiUrl: {
    type: String,
    required: true
  },
  apiKey: {
    type: String,
    required: true
  },
  apiKeyPlacement: {
    type: String,
    enum: ['header', 'body', 'custom_header'],
    default: 'header'
  },
  apiKeyHeader: String,
  apiKeyBodyPath: String,
  model: {
    type: String,
    default: 'Qwen/QwQ-32B'
  },
  requestTemplate: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  responseTemplate: {
    type: mongoose.Schema.Types.Mixed
  },
  // Path configurations
  requestMessageGroupPath: String,
  requestRolePathFromGroup: String,
  requestTextPathFromGroup: String,
  responseTextPath: String,
  responseThinkingTextPath: String,
  // Role mappings
  requestUserRoleField: String,
  requestAssistantField: String,
  requestSystemField: String,
  
  headers: {
    type: Map,
    of: String,
    default: new Map([['Content-Type', 'application/json']])
  },
  isAvailable: {
    type: Boolean,
    default: false
  },
  lastUsedTime: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
aiConfigSchema.index({ userId: 1, isAvailable: 1 });
aiConfigSchema.index({ userId: 1, lastUsedTime: -1 });

module.exports = mongoose.model('AIConfig', aiConfigSchema); 