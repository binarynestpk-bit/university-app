const mongoose = require('mongoose');

const IntentLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  userMessage: {
    type: String,
    required: true
  },
  detectedIntent: {
    type: String,
    required: true
  },
  extractedEntities: {
    route: String,
    timeSlot: String,
    vehicle: String,
    date: Date
  },
  confidence: {
    type: Number,
    default: 1.0
  },
  botResponse: String,
  contextId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatContext'
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('IntentLog', IntentLogSchema);