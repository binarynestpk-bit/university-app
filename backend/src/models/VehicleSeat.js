const mongoose = require('mongoose');

const VehicleSeatSchema = new mongoose.Schema({
  // Reference to vehicle (in route's time slot)
  vehicleRef: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    // Note: This references the vehicle subdocument, not a separate Vehicle model
  },
  
  // Vehicle details (denormalized for quick access)
  vehicleNumber: String,
  vehicleType: String,
  
  // Seat layout configuration
  totalSeats: {
    type: Number,
    required: true
  },
  
  // Seat arrangement (2x2, 2x3, etc.)
  rows: {
    type: Number,
    required: true
  },
  seatsPerRow: {
    type: Number,
    required: true
  },
  
  // Reserved seats for special cases (driver, conductor, etc.)
  reservedSeats: [{
    seatNumber: Number,
    label: String,
    reason: String
  }],
  
  // Gender-specific seats configuration
  maleSeats: [Number],  // Seat numbers reserved for males
  femaleSeats: [Number], // Seat numbers reserved for females
  
  // Created/updated timestamps
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

// Generate seat labels (A1, A2, B1, B2, etc.)
VehicleSeatSchema.methods.generateSeatLabels = function() {
  const labels = [];
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  
  for (let row = 0; row < this.rows; row++) {
    for (let seat = 1; seat <= this.seatsPerRow; seat++) {
      const seatNumber = (row * this.seatsPerRow) + seat;
      const label = `${rows[row]}${seat}`;
      labels.push({ seatNumber, label });
    }
  }
  
  return labels;
};

// Check if seat is available for booking
VehicleSeatSchema.methods.isSeatAvailable = function(seatNumber, gender) {
  // Check if seat is reserved
  if (this.reservedSeats.some(rs => rs.seatNumber === seatNumber)) {
    return false;
  }
  
  // Check gender restrictions
  if (gender === 'male' && this.femaleSeats.includes(seatNumber)) {
    return false;
  }
  
  if (gender === 'female' && this.maleSeats.includes(seatNumber)) {
    return false;
  }
  
  return true;
};

module.exports = mongoose.model('VehicleSeat', VehicleSeatSchema);