

// backend/models/Route.js
const mongoose = require('mongoose');

const routeSchema = new mongoose.Schema({
  name: { type: String, required: true }, // Main route name
  startingPoint: { type: String, default: "Capital University" },
  mainDestination: { type: String, required: true },
  monthlyFare: { type: Number, required: true }, // Main fare
  subRoutes: [{
    name: { type: String, required: true },
    price: { type: Number, required: true }
  }],
  timeSlots: [{
    time: { type: String, required: true }, // e.g., "11:00 AM"
    vehicles: [{
      vehicleType: { type: String, required: true },
      vehicleNumber: { type: String, required: true },
      totalSeats: { type: Number, required: true }
    }]
  }]
}, { timestamps: true });

module.exports = mongoose.model('Route', routeSchema);