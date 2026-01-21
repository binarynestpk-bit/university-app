const mongoose = require('mongoose');

const ChatContextSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  // Current conversation context
  currentRoute: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route'
  },
  currentRouteName: String,
  currentTimeSlot: String,
  currentVehicle: String,
  currentIntent: String,
  
  // Conversation flow state
  conversationState: {
    type: String,
    enum: [
      'idle', 
      'awaiting_time_slot', 
      'awaiting_vehicle', 
      'awaiting_seat_confirmation',
      'awaiting_route_confirmation'
    ],
    default: 'idle'
  },
  
  // Last query details
  lastQuery: {
    intent: String,
    routeName: String,
    timeSlot: String,
    vehicleNumber: String,
    timestamp: Date
  },
  
  // User preferences/history
  frequentlyAskedRoutes: [{
    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route'
    },
    routeName: String,
    queryCount: Number,
    lastAsked: Date
  }],
  
  // Misspelling corrections
  spellingCorrections: {
    type: Map,
    of: String,
    default: {}
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('ChatContext', ChatContextSchema);