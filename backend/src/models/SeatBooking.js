const mongoose = require('mongoose');

const SeatBookingSchema = new mongoose.Schema({
  // Reference to the original monthly booking (for tracking)
  monthlyBooking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  
  // Student who booked the seat
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Route for this daily booking (could be main route or alternative)
  route: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    required: true
  },
  
  // Sub-route (if selected during booking)
  subRoute: {
    type: mongoose.Schema.Types.ObjectId,
    // No ref since it's embedded in Route model
  },
  subRouteName: String,
  
  // Time slot details
  timeSlot: {
    type: mongoose.Schema.Types.ObjectId,
    // No ref since it's embedded in Route model
  },
  timeSlotTime: {
    type: String,  // e.g., "2:00 PM"
    required: true
  },
  
  // Vehicle details
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    // No ref since it's embedded in Route model
  },
  vehicleNumber: {
    type: String,
    required: true
  },
  vehicleType: String,
  
  // Seat details
  seatNumber: {
    type: Number,
    required: true
  },
  seatLabel: String,  // e.g., "A1", "B3"
  gender: {
    type: String,
    enum: ['male', 'female'],
    required: true
  },
  
  // Booking date (the date for which seat is booked)
  bookingDate: {
    type: Date,
    required: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['booked', 'cancelled', 'completed'],
    default: 'booked'
  },
  
  // For 3-try counter tracking
  isAlternativeRoute: {
    type: Boolean,
    default: false
  },
  
  // Automatic expiry after time slot passes
  expiresAt: {
    type: Date,
    // This will be set to the end of the time slot
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster queries
SeatBookingSchema.index({ student: 1, bookingDate: 1 });
SeatBookingSchema.index({ vehicle: 1, bookingDate: 1, timeSlot: 1 });
SeatBookingSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model('SeatBooking', SeatBookingSchema);