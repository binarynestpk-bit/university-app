const express = require('express');
const mongoose = require('mongoose');
const moment = require('moment');
const authMiddleware = require('../middleware/authMiddleware');
const Route = require('../models/Route');
const Booking = require('../models/Booking');
const SeatBooking = require('../models/SeatBooking');
const RouteTries = require('../models/RouteTries');
const User = require('../models/User');

const router = express.Router();

// Middleware - only students can access
router.use(authMiddleware('student'));

// 🔹 GET: Get routes for seat booking with try counter
router.get('/routes', async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();

    // 1. Get user's active monthly booking
    const user = await User.findById(userId)
      .populate('activeBooking')
      .populate('mainRoute');

    if (!user || !user.activeBooking) {
      return res.status(400).json({
        success: false,
        message: 'No active monthly booking found'
      });
    }

    // 2. Get route tries for current month
    const routeTries = await RouteTries.findOne({
      student: userId,
      month,
      year
    });

    const alternativeTriesUsed = routeTries ? routeTries.alternativeRouteTries : 0;
    const canUseAlternative = alternativeTriesUsed < 3;

    // 3. Get user's main route (from registration)
    let mainRoute = user.mainRoute;
    if (!mainRoute && user.activeBooking.route) {
      mainRoute = await Route.findById(user.activeBooking.route);
      // Update user's main route for future
      user.mainRoute = mainRoute._id;
      await user.save();
    }

    // 4. Get all routes
    const allRoutes = await Route.find({});

    // 5. Check if user has already booked for today
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const todayBooking = await SeatBooking.findOne({
      student: userId,
      bookingDate: { $gte: todayStart, $lte: todayEnd },
      status: 'booked'
    });

    const hasBookedToday = !!todayBooking;

    res.status(200).json({
      success: true,
      data: {
        mainRoute: mainRoute ? {
          _id: mainRoute._id,
          name: mainRoute.name,
          startingPoint: mainRoute.startingPoint,
          mainDestination: mainRoute.mainDestination
        } : null,
        alternativeTriesUsed,
        alternativeTriesRemaining: 3 - alternativeTriesUsed,
        canUseAlternative,
        hasBookedToday,
        todayBooking: hasBookedToday ? {
          route: todayBooking.route,
          timeSlot: todayBooking.timeSlotTime,
          seatNumber: todayBooking.seatNumber
        } : null,
        allRoutes: allRoutes.map(route => ({
          _id: route._id,
          name: route.name,
          startingPoint: route.startingPoint,
          mainDestination: route.mainDestination,
          monthlyFare: route.monthlyFare,
          subRoutesCount: route.subRoutes.length,
          timeSlotsCount: route.timeSlots.length
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching routes for seat booking:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 GET: Get available time slots for a route (with time logic)
router.get('/routes/:routeId/timeslots', async (req, res) => {
  try {
    const userId = req.user.id;
    const { routeId } = req.params;
    const { bookingDate } = req.query; // Optional: specific date, default today

    // Parse booking date or use today
    const targetDate = bookingDate ? new Date(bookingDate) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    // 1. Check if user has already booked for this date
    const dateEnd = new Date(targetDate);
    dateEnd.setHours(23, 59, 59, 999);

    const existingBooking = await SeatBooking.findOne({
      student: userId,
      bookingDate: { $gte: targetDate, $lte: dateEnd },
      status: 'booked'
    });

    if (existingBooking) {
      return res.status(400).json({
        success: false,
        message: 'You already have a booking for this date',
        existingBooking: {
          _id: existingBooking._id,
          timeSlot: existingBooking.timeSlotTime,
          seatNumber: existingBooking.seatNumber
        }
      });
    }

    // 2. Get route with time slots
    const route = await Route.findById(routeId);
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    // 3. Get current time for time slot filtering
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes(); // in minutes

    // 4. Filter time slots based on time logic
    const availableTimeSlots = route.timeSlots.map(timeSlot => {
      // Parse time slot time (e.g., "2:00 PM")
      const timeStr = timeSlot.time;
      const [time, modifier] = timeStr.split(' ');
      let [hours, minutes] = time.split(':').map(Number);

      // Convert to 24-hour format
      if (modifier === 'PM' && hours !== 12) hours += 12;
      if (modifier === 'AM' && hours === 12) hours = 0;

      const slotTimeInMinutes = hours * 60 + minutes;

      // Calculate if slot is available
      const isPastSlot = slotTimeInMinutes < currentTime;
      const isWithin30MinCutoff = (slotTimeInMinutes - currentTime) <= 30;
      const isAvailable = !isPastSlot && !isWithin30MinCutoff;

      // Get vehicles with available seats
      const vehiclesWithAvailability = timeSlot.vehicles.map(vehicle => {
        // Count booked seats for this vehicle on this date and time slot
        return {
          ...vehicle.toObject(),
          availableSeats: vehicle.totalSeats, // We'll calculate this in a separate query
          isFull: false // Temporary
        };
      });

      return {
        _id: timeSlot._id,
        time: timeSlot.time,
        isAvailable,
        isPastSlot,
        cutoffTime: new Date(now.getTime() + (slotTimeInMinutes - currentTime - 30) * 60000),
        vehicles: vehiclesWithAvailability,
        message: !isAvailable ? 
          (isPastSlot ? 'This time slot has passed' : 'Booking closed (30 min cutoff)') : 
          null
      };
    });

    // 5. Check if all time slots have passed (show tomorrow message)
    const allSlotsPassed = availableTimeSlots.every(slot => slot.isPastSlot);
    const tomorrow = new Date(targetDate);
    tomorrow.setDate(tomorrow.getDate() + 1);

    res.status(200).json({
      success: true,
      data: {
        route: {
          _id: route._id,
          name: route.name,
          startingPoint: route.startingPoint,
          mainDestination: route.mainDestination
        },
        bookingDate: targetDate,
        timeSlots: availableTimeSlots,
        allSlotsPassed,
        tomorrowDate: allSlotsPassed ? tomorrow : null,
        message: allSlotsPassed ? 
          'All time slots for today have passed. Bookings will be available tomorrow.' : 
          null
      }
    });
  } catch (error) {
    console.error('Error fetching time slots:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 GET: Get seat map for a vehicle
router.get('/vehicles/:vehicleId/seats', async (req, res) => {
  try {
    const userId = req.user.id;
    const { vehicleId } = req.params;
    const { routeId, timeSlotId, bookingDate } = req.query;

    if (!routeId || !timeSlotId || !bookingDate) {
      return res.status(400).json({
        success: false,
        message: 'Route ID, Time Slot ID, and Booking Date are required'
      });
    }

    // 1. Get route and vehicle details
    const route = await Route.findById(routeId);
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    // Find the time slot
    const timeSlot = route.timeSlots.id(timeSlotId);
    if (!timeSlot) {
      return res.status(404).json({
        success: false,
        message: 'Time slot not found'
      });
    }

    // Find the vehicle
    const vehicle = timeSlot.vehicles.id(vehicleId);
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }

    // 2. Parse booking date
    const targetDate = new Date(bookingDate);
    targetDate.setHours(0, 0, 0, 0);
    const dateEnd = new Date(targetDate);
    dateEnd.setHours(23, 59, 59, 999);

    // 3. Get all booked seats for this vehicle on this date and time slot
    const bookedSeats = await SeatBooking.find({
      vehicle: vehicleId,
      timeSlot: timeSlotId,
      bookingDate: { $gte: targetDate, $lte: dateEnd },
      status: 'booked'
    }).select('seatNumber seatLabel gender student');

    // 4. Create seat map
    const totalSeats = vehicle.totalSeats;
    const seatsPerRow = 4; // Default, can be configurable
    const rows = Math.ceil(totalSeats / seatsPerRow);
    const seatMap = [];

    // Generate seat layout
    const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    
    for (let row = 0; row < rows; row++) {
      const rowSeats = [];
      for (let seatInRow = 0; seatInRow < seatsPerRow; seatInRow++) {
        const seatNumber = (row * seatsPerRow) + seatInRow + 1;
        
        // Skip if seat number exceeds total seats
        if (seatNumber > totalSeats) {
          rowSeats.push(null); // Empty space for layout
          continue;
        }

        const seatLabel = `${rowLabels[row]}${seatInRow + 1}`;
        
        // Check if seat is booked
        const bookedSeat = bookedSeats.find(s => s.seatNumber === seatNumber);
        
        const seatInfo = {
          seatNumber,
          seatLabel,
          isBooked: !!bookedSeat,
          bookedByUser: bookedSeat ? bookedSeat.student.toString() === userId : false,
          gender: bookedSeat ? bookedSeat.gender : null,
          bookedBy: bookedSeat ? {
            studentId: bookedSeat.student,
            // We could populate student name here if needed
          } : null,
          isAvailable: !bookedSeat
        };

        rowSeats.push(seatInfo);
      }
      seatMap.push(rowSeats);
    }

    // 5. Get user's current booking for this date (if any)
    const userBooking = await SeatBooking.findOne({
      student: userId,
      bookingDate: { $gte: targetDate, $lte: dateEnd },
      status: 'booked'
    });

    res.status(200).json({
      success: true,
      data: {
        vehicle: {
          _id: vehicle._id,
          vehicleNumber: vehicle.vehicleNumber,
          vehicleType: vehicle.vehicleType,
          totalSeats: vehicle.totalSeats
        },
        timeSlot: {
          _id: timeSlot._id,
          time: timeSlot.time
        },
        route: {
          _id: route._id,
          name: route.name
        },
        bookingDate: targetDate,
        seatMap,
        totalSeats,
        availableSeats: totalSeats - bookedSeats.length,
        bookedSeats: bookedSeats.length,
        userHasBooking: !!userBooking,
        userBooking: userBooking ? {
          seatNumber: userBooking.seatNumber,
          seatLabel: userBooking.seatLabel,
          timeSlot: userBooking.timeSlotTime
        } : null
      }
    });
  } catch (error) {
    console.error('Error fetching seat map:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 POST: Book a seat
router.post('/book', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user.id;
    const {
      routeId,
      timeSlotId,
      vehicleId,
      seatNumber,
      gender,
      bookingDate
    } = req.body;

    // 1. Validate required fields
    if (!routeId || !timeSlotId || !vehicleId || !seatNumber || !gender || !bookingDate) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // 2. Parse booking date
    const targetDate = new Date(bookingDate);
    targetDate.setHours(0, 0, 0, 0);
    const dateEnd = new Date(targetDate);
    dateEnd.setHours(23, 59, 59, 999);

    // 3. Check if user already has a booking for this date
    const existingBooking = await SeatBooking.findOne({
      student: userId,
      bookingDate: { $gte: targetDate, $lte: dateEnd },
      status: 'booked'
    }).session(session);

    if (existingBooking) {
      // Cancel the existing booking (auto-cancel when booking new one)
      existingBooking.status = 'cancelled';
      await existingBooking.save({ session });
    }

    // 4. Get user and active booking
    const user = await User.findById(userId).session(session);
    if (!user || !user.activeBooking) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'No active monthly booking found'
      });
    }

    // 5. Get route details
    const route = await Route.findById(routeId).session(session);
    if (!route) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    // 6. Check if this is an alternative route
    const isAlternativeRoute = user.mainRoute && 
      user.mainRoute.toString() !== routeId;

    // 7. If alternative route, check and update route tries
    if (isAlternativeRoute) {
      const today = new Date();
      const month = today.getMonth() + 1;
      const year = today.getFullYear();

      let routeTries = await RouteTries.findOne({
        student: userId,
        month,
        year
      }).session(session);

      if (!routeTries) {
        routeTries = new RouteTries({
          student: userId,
          monthlyBooking: user.activeBooking,
          month,
          year,
          alternativeRouteTries: 0,
          alternativeRouteDates: []
        });
      }

      if (!routeTries.canUseAlternativeRoute()) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'You have used all 3 alternative route tries for this month'
        });
      }

      // Use alternative route
      routeTries.useAlternativeRoute(routeId);
      await routeTries.save({ session });
    }

    // 8. Get time slot and vehicle details
    const timeSlot = route.timeSlots.id(timeSlotId);
    if (!timeSlot) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Time slot not found'
      });
    }

    const vehicle = timeSlot.vehicles.id(vehicleId);
    if (!vehicle) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }

    // 9. Check if seat is already booked
    const seatAlreadyBooked = await SeatBooking.findOne({
      vehicle: vehicleId,
      timeSlot: timeSlotId,
      seatNumber,
      bookingDate: { $gte: targetDate, $lte: dateEnd },
      status: 'booked'
    }).session(session);

    if (seatAlreadyBooked) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Seat is already booked'
      });
    }

    // 10. Calculate expiry time (end of time slot)
  // 10. Calculate expiry time (end of time slot)
   const expiresAt = new Date(targetDate);
const timeStr = timeSlot.time;
console.log('Parsing time string:', timeStr); // Debug log

try {
  // Use the helper function to parse time
  const { hours, minutes } = parseTimeString(timeStr);
  console.log('Parsed hours:', hours, 'minutes:', minutes); // Debug log
  
  // Create a new date object for expiresAt
  const expiresAt = new Date(targetDate);
  
  // Validate date
  if (isNaN(expiresAt.getTime())) {
    console.error('Invalid targetDate:', targetDate);
    // Set expiresAt to 24 hours from now as fallback
    expiresAt.setTime(Date.now() + 24 * 60 * 60 * 1000);
  } else {
    // Set the hours and minutes
    expiresAt.setHours(hours, minutes, 0, 0);
    
    // If expiresAt is in the past (shouldn't happen with time validation), add 1 day
    if (expiresAt < new Date()) {
      console.warn('ExpiresAt is in the past, adding 1 day');
      expiresAt.setDate(expiresAt.getDate() + 1);
    }
  }
  
  console.log('Final expiresAt:', expiresAt); // Debug log
} catch (error) {
  console.error('Error calculating expiresAt:', error);
  // Set a default expiry (1 day from now)
  expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
}

   
    

    // 11. Create seat booking
    const seatLabel = generateSeatLabel(seatNumber, vehicle.totalSeats);
    
    const seatBooking = new SeatBooking({
      monthlyBooking: user.activeBooking._id,
      student: userId,
      route: routeId,
      timeSlot: timeSlotId,
      timeSlotTime: timeSlot.time,
      vehicle: vehicleId,
      vehicleNumber: vehicle.vehicleNumber,
      vehicleType: vehicle.vehicleType,
      seatNumber,
      seatLabel,
      gender,
      bookingDate: targetDate,
      isAlternativeRoute,
      expiresAt,
      status: 'booked'
    });

    await seatBooking.save({ session });

    // 12. Commit transaction
    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      message: 'Seat booked successfully!',
      data: {
        booking: seatBooking,
        isAlternativeRoute,
        alternativeTriesUsed: isAlternativeRoute ? 
          (await RouteTries.findOne({ student: userId, month: new Date().getMonth() + 1 }))?.alternativeRouteTries : 0
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error booking seat:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 POST: Cancel booking
router.post('/cancel', async (req, res) => {
  try {
    const userId = req.user.id;
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID is required'
      });
    }

    // Find and cancel the booking
    const booking = await SeatBooking.findOne({
      _id: bookingId,
      student: userId,
      status: 'booked'
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Active booking not found'
      });
    }

    // Check if booking can be cancelled (not within 30 mins of time slot)
    const timeSlotTime = booking.timeSlotTime;
    const [time, modifier] = timeSlotTime.split(' ');
    let [hours, minutes] = time.split(':').map(Number);

    if (modifier === 'PM' && hours !== 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;

    const slotTime = new Date(booking.bookingDate);
    slotTime.setHours(hours, minutes, 0, 0);
    
    const now = new Date();
    const timeDiff = (slotTime - now) / (1000 * 60); // difference in minutes

    if (timeDiff <= 30) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel booking within 30 minutes of time slot'
      });
    }

    // Update booking status
    booking.status = 'cancelled';
    await booking.save();

    // If this was an alternative route, refund the try? 
    // Decision: We don't refund tries to prevent abuse

    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
      data: booking
    });

  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 GET: Get user's seat booking history
router.get('/history', async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;

    const bookings = await SeatBooking.find({ student: userId })
      .sort({ bookingDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('route', 'name startingPoint mainDestination')
      .lean();

    const total = await SeatBooking.countDocuments({ student: userId });

    res.status(200).json({
      success: true,
      data: {
        bookings,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching booking history:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Helper function to generate seat label
function generateSeatLabel(seatNumber, totalSeats) {
  const seatsPerRow = 4;
  const row = Math.ceil(seatNumber / seatsPerRow);
  const seatInRow = ((seatNumber - 1) % seatsPerRow) + 1;
  
  const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  return `${rowLabels[row - 1]}${seatInRow}`;
}
// Helper function to parse time string (e.g., "2:00 PM")
function parseTimeString(timeStr) {
  if (!timeStr) return { hours: 0, minutes: 0 };
  
  // Clean the time string
  const cleanedTime = timeStr.trim().toUpperCase();
  
  // Split time and modifier
  const timeParts = cleanedTime.split(' ');
  let time = timeParts[0];
  let modifier = timeParts[1] || '';
  
  // Split hours and minutes
  const [hoursStr, minutesStr] = time.split(':');
  
  // Convert to numbers
  let hours = parseInt(hoursStr, 10) || 0;
  let minutes = parseInt(minutesStr, 10) || 0;
  
  // Handle 12-hour format
  if (modifier === 'PM' && hours < 12) {
    hours += 12;
  } else if (modifier === 'AM' && hours === 12) {
    hours = 0;
  }
  
  // Ensure valid hours (0-23)
  hours = Math.max(0, Math.min(23, hours));
  minutes = Math.max(0, Math.min(59, minutes));
  
  return { hours, minutes };
}
module.exports = router;