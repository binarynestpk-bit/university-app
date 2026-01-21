// In studentRoutes.js, make sure you don't have conflicting routes
const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const Route = require('../models/Route');

const router = express.Router();

// Student can access routes
router.use(authMiddleware('student'));

// Get all routes for student
router.get('/available-routes', async (req, res) => {  // CHANGED FROM '/routes'
  try {
    const routes = await Route.find({});
    res.status(200).json(routes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single route details for student
router.get('/routes/:id', async (req, res) => {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) return res.status(404).json({ message: 'Route not found!' });
    res.status(200).json(route);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Book a seat
router.post('/book-seat', async (req, res) => {  // CHANGED FROM '/bookings'
  try {
    const { routeId, subRouteId, timeSlotId, vehicleId, seatNumber } = req.body;

    // Find the route
    const route = await Route.findById(routeId);
    if (!route) return res.status(404).json({ message: 'Route not found!' });

    // Find the time slot
    const timeSlot = route.timeSlots.id(timeSlotId);
    if (!timeSlot) return res.status(404).json({ message: 'Time slot not found!' });

    // Find the vehicle
    const vehicle = timeSlot.vehicles.id(vehicleId);
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found!' });

    // Check if seat is available
    if (vehicle.availableSeats <= 0) {
      return res.status(400).json({ message: 'No available seats!' });
    }

    // Update available seats
    vehicle.availableSeats -= 1;

    await route.save();

    res.status(201).json({ 
      message: 'Seat booked successfully!',
      booking: {
        route: route.name,
        stop: route.subRoutes.id(subRouteId)?.name,
        time: timeSlot.time,
        vehicle: vehicle.vehicleNumber,
        seatNumber,
        bookingDate: new Date()
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;