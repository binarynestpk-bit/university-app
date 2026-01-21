// backend/src/models/Announcement.js
const mongoose = require("mongoose");

const updateHistorySchema = new mongoose.Schema({
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Changed from "Admin" to "User"
  updatedAt: { type: Date, default: Date.now },
  changes: { type: Object, default: {} }
});

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    
    mediaUrl: { 
      type: String, 
      default: null,
      validate: {
        validator: function(v) {
          // Allow null, empty string, or valid URL
          return v === null || v === '' || v.startsWith('http');
        },
        message: 'Media URL must be a valid URL or empty'
      }
    },
    
    mediaType: { 
      type: String, 
      enum: ["image", "video", null, ""], 
      default: null 
    },

    duration: { type: String, required: true },
    expiresAt: { type: Date, required: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Changed from "Admin" to "User"

    updateHistory: [updateHistorySchema],

    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

// Add pre-save middleware to automatically handle empty values
announcementSchema.pre('save', function(next) {
  // Convert empty mediaUrl to null
  if (this.mediaUrl === '') {
    this.mediaUrl = null;
  }
  
  // Convert empty mediaType to null
  if (this.mediaType === '') {
    this.mediaType = null;
  }
  
  next();
});

// Add pre-update middleware for findOneAndUpdate operations
announcementSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  
  if (update.mediaUrl === '') {
    update.mediaUrl = null;
  }
  
  if (update.mediaType === '') {
    update.mediaType = null;
  }
  
  next();
});

module.exports = mongoose.model("Announcement", announcementSchema);