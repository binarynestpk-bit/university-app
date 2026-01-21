const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  route: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    required: true
  },
  subRoute: {
    type: mongoose.Schema.Types.ObjectId,
    // Reference to sub-route within the route
  },
  subRouteDetails: {
    name: String,
    price: Number
  },
  bookingType: {
    type: String,
    enum: ['monthly', 'daily'],
    required: true
  },
  // For monthly booking
  month: {
    type: Number, // 1-12
  },
  year: {
    type: Number,
  },
  // For daily booking
  bookingDate: {
    type: Date,
  },
  timeSlot: {
    type: mongoose.Schema.Types.ObjectId,
    // Reference to time slot within route
  },
  timeSlotDetails: {
    time: String
  },
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    // Reference to vehicle within time slot
  },
  vehicleDetails: {
    vehicleType: String,
    vehicleNumber: String,
    totalSeats: Number
  },
 status: {
  type: String,
  enum: ['pending', 'approved', 'rejected', 'expired', 'cancelled'],
  default: 'pending'
},
  totalAmount: {
    type: Number,
    required: true
  },
  invoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice'
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

module.exports = mongoose.model('Booking', BookingSchema);