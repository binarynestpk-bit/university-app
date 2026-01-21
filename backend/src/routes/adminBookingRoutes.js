const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const Route = require('../models/Route');

const router = express.Router();

// Only admin can access booking routes
router.use(authMiddleware('admin'));

// 🔹 GET: Get all booking routes
router.get('/booking/routes', async (req, res) => {
  try {
    const routes = await Route.find({});
    res.status(200).json(routes);
  } catch (error) {
    console.error('Error fetching routes:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// 🔹 GET: Get single route by ID
router.get('/booking/routes/:id', async (req, res) => {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }
    res.status(200).json(route);
  } catch (error) {
    console.error('Error fetching route:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 POST: Create new route
router.post('/booking/routes', async (req, res) => {
  try {
    const { name, mainDestination, monthlyFare } = req.body;
    
    // Create new route with default starting point
    const route = new Route({
      name,
      startingPoint: "Capital University", // Default
      mainDestination,
      monthlyFare,
      subRoutes: [],
      timeSlots: []
    });
    
    await route.save();
    
    res.status(201).json({
      success: true,
      message: 'Route created successfully',
      data: route
    });
  } catch (error) {
    console.error('Error creating route:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 PUT: Update route
router.put('/booking/routes/:id', async (req, res) => {
  try {
    const { name, mainDestination, monthlyFare } = req.body;
    
    const route = await Route.findById(req.params.id);
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }
    
    route.name = name || route.name;
    route.mainDestination = mainDestination || route.mainDestination;
    route.monthlyFare = monthlyFare || route.monthlyFare;
    
    await route.save();
    
    res.status(200).json({
      success: true,
      message: 'Route updated successfully',
      data: route
    });
  } catch (error) {
    console.error('Error updating route:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 DELETE: Delete route
router.delete('/booking/routes/:id', async (req, res) => {
  try {
    const route = await Route.findByIdAndDelete(req.params.id);
    
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Route deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting route:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 SUB-ROUTES ENDPOINTS

// Add sub-route
router.post('/booking/routes/:id/subroutes', async (req, res) => {
  try {
    const { name, price } = req.body;
    const route = await Route.findById(req.params.id);
    
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }
    
    const subRoute = {
      name,
      price: Number(price)
    };
    
    route.subRoutes.push(subRoute);
    await route.save();
    
    res.status(201).json({
      success: true,
      message: 'Sub-route added successfully',
      data: route
    });
  } catch (error) {
    console.error('Error adding sub-route:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update sub-route
router.put('/booking/routes/:routeId/subroutes/:subRouteId', async (req, res) => {
  try {
    const { name, price } = req.body;
    const route = await Route.findById(req.params.routeId);
    
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }
    
    const subRoute = route.subRoutes.id(req.params.subRouteId);
    if (!subRoute) {
      return res.status(404).json({
        success: false,
        message: 'Sub-route not found'
      });
    }
    
    subRoute.name = name || subRoute.name;
    subRoute.price = price ? Number(price) : subRoute.price;
    
    await route.save();
    
    res.status(200).json({
      success: true,
      message: 'Sub-route updated successfully',
      data: route
    });
  } catch (error) {
    console.error('Error updating sub-route:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Delete sub-route
router.delete('/booking/routes/:routeId/subroutes/:subRouteId', async (req, res) => {
  try {
    const route = await Route.findById(req.params.routeId);
    
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }
    
    const subRoute = route.subRoutes.id(req.params.subRouteId);
    if (!subRoute) {
      return res.status(404).json({
        success: false,
        message: 'Sub-route not found'
      });
    }
    
    subRoute.remove();
    await route.save();
    
    res.status(200).json({
      success: true,
      message: 'Sub-route deleted successfully',
      data: route
    });
  } catch (error) {
    console.error('Error deleting sub-route:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 TIME SLOTS ENDPOINTS

// Add time slot
router.post('/booking/routes/:id/timeslots', async (req, res) => {
  try {
    const { time } = req.body;
    const route = await Route.findById(req.params.id);
    
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }
    
    const timeSlot = {
      time,
      vehicles: []
    };
    
    route.timeSlots.push(timeSlot);
    await route.save();
    
    res.status(201).json({
      success: true,
      message: 'Time slot added successfully',
      data: route
    });
  } catch (error) {
    console.error('Error adding time slot:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update time slot
router.put('/booking/routes/:routeId/timeslots/:timeSlotId', async (req, res) => {
  try {
    const { time } = req.body;
    const route = await Route.findById(req.params.routeId);
    
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }
    
    const timeSlot = route.timeSlots.id(req.params.timeSlotId);
    if (!timeSlot) {
      return res.status(404).json({
        success: false,
        message: 'Time slot not found'
      });
    }
    
    timeSlot.time = time || timeSlot.time;
    await route.save();
    
    res.status(200).json({
      success: true,
      message: 'Time slot updated successfully',
      data: route
    });
  } catch (error) {
    console.error('Error updating time slot:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Delete time slot
router.delete('/booking/routes/:routeId/timeslots/:timeSlotId', async (req, res) => {
  try {
    const route = await Route.findById(req.params.routeId);
    
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }
    
    const timeSlot = route.timeSlots.id(req.params.timeSlotId);
    if (!timeSlot) {
      return res.status(404).json({
        success: false,
        message: 'Time slot not found'
      });
    }
    
    timeSlot.remove();
    await route.save();
    
    res.status(200).json({
      success: true,
      message: 'Time slot deleted successfully',
      data: route
    });
  } catch (error) {
    console.error('Error deleting time slot:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 VEHICLES ENDPOINTS

// Add vehicle to time slot
router.post('/booking/routes/:routeId/timeslots/:timeSlotId/vehicles', async (req, res) => {
  try {
    const { vehicleType, vehicleNumber, totalSeats } = req.body;
    const route = await Route.findById(req.params.routeId);
    
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }
    
    const timeSlot = route.timeSlots.id(req.params.timeSlotId);
    if (!timeSlot) {
      return res.status(404).json({
        success: false,
        message: 'Time slot not found'
      });
    }
    
    const vehicle = {
      vehicleType,
      vehicleNumber,
      totalSeats: Number(totalSeats)
    };
    
    timeSlot.vehicles.push(vehicle);
    await route.save();
    
    res.status(201).json({
      success: true,
      message: 'Vehicle added successfully',
      data: route
    });
  } catch (error) {
    console.error('Error adding vehicle:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update vehicle
router.put('/booking/routes/:routeId/timeslots/:timeSlotId/vehicles/:vehicleId', async (req, res) => {
  try {
    const { vehicleType, vehicleNumber, totalSeats } = req.body;
    const route = await Route.findById(req.params.routeId);
    
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }
    
    const timeSlot = route.timeSlots.id(req.params.timeSlotId);
    if (!timeSlot) {
      return res.status(404).json({
        success: false,
        message: 'Time slot not found'
      });
    }
    
    const vehicle = timeSlot.vehicles.id(req.params.vehicleId);
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }
    
    vehicle.vehicleType = vehicleType || vehicle.vehicleType;
    vehicle.vehicleNumber = vehicleNumber || vehicle.vehicleNumber;
    vehicle.totalSeats = totalSeats ? Number(totalSeats) : vehicle.totalSeats;
    
    await route.save();
    
    res.status(200).json({
      success: true,
      message: 'Vehicle updated successfully',
      data: route
    });
  } catch (error) {
    console.error('Error updating vehicle:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Delete vehicle
router.delete('/booking/routes/:routeId/timeslots/:timeSlotId/vehicles/:vehicleId', async (req, res) => {
  try {
    const route = await Route.findById(req.params.routeId);
    
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }
    
    const timeSlot = route.timeSlots.id(req.params.timeSlotId);
    if (!timeSlot) {
      return res.status(404).json({
        success: false,
        message: 'Time slot not found'
      });
    }
    
    const vehicle = timeSlot.vehicles.id(req.params.vehicleId);
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }
    
    vehicle.remove();
    await route.save();
    
    res.status(200).json({
      success: true,
      message: 'Vehicle deleted successfully',
      data: route
    });
  } catch (error) {
    console.error('Error deleting vehicle:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;