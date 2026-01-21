const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['student', 'admin'], default: 'student' },
    profilePicUrl: { type: String },
    address: { type: String },
    department: { type: String },
    registrationNumber: { type: String }, 
    semester: { type: String },
    dateOfBirth: { type: Date },
    mobileNumber: { type: String },  
    cnic: { type: String },
    registrationApproved: { type: Boolean, default: false },
    resetPasswordOTP: { type: String },
    resetPasswordExpires: { type: Date },
    
    // Booking status fields
    hasMonthlyBooking: {
      type: Boolean,
      default: false
    },
    hasDailyBooking: {
      type: Boolean,
      default: false
    },
    monthlyBookingExpiry: {
      type: Date
    },
    dailyBookingExpiry: {
      type: Date
    },
    activeBooking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking'
    },
        // Main registered route (from monthly booking)
    mainRoute: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);