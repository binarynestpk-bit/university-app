// models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  title: { 
    type: String, 
    required: true 
  },
  message: { 
    type: String, 
    required: true 
  },
  type: { 
    type: String, 
    enum: ['invoice_approved', 'invoice_rejected', 'invoice_update', 'booking', 'announcement', 'general'],
    default: 'general'
  },
  read: { 
    type: Boolean, 
    default: false 
  },
  role: {
    type: String,
    default: 'student'
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
});

module.exports = mongoose.model('Notification', notificationSchema);