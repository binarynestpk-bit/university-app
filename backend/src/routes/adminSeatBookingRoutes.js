const express = require('express');
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/authMiddleware');
const Route = require('../models/Route');
const SeatBooking = require('../models/SeatBooking');
const User = require('../models/User');

const router = express.Router();

// Only admin can access
router.use(authMiddleware('admin'));

// 🔹 GET: Get all seat bookings with filters
router.get('/', async (req, res) => {
  try {
    const {
      routeId,
      timeSlotId,
      vehicleId,
      bookingDate,
      status,
      page = 1,
      limit = 20,
      search
    } = req.query;

    // Build filter
    const filter = {};

    if (routeId) filter.route = routeId;
    if (timeSlotId) filter.timeSlot = timeSlotId;
    if (vehicleId) filter.vehicle = vehicleId;
    if (status) filter.status = status;
    
    if (bookingDate) {
      const date = new Date(bookingDate);
      date.setHours(0, 0, 0, 0);
      const dateEnd = new Date(date);
      dateEnd.setHours(23, 59, 59, 999);
      filter.bookingDate = { $gte: date, $lte: dateEnd };
    }

    // Search by student name, registration number, or vehicle number
    if (search) {
      // First, find users matching the search
      const users = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { registrationNumber: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');

      const userIds = users.map(user => user._id);

      // Search in seat bookings
      filter.$or = [
        { student: { $in: userIds } },
        { vehicleNumber: { $regex: search, $options: 'i' } },
        { seatLabel: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    // Get bookings with populated data
    const bookings = await SeatBooking.find(filter)
      .populate('student', 'name email registrationNumber')
      .populate('route', 'name startingPoint mainDestination')
      .populate('monthlyBooking', 'bookingType')
      .sort({ bookingDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await SeatBooking.countDocuments(filter);

    // Get statistics
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const stats = {
      totalBookings: await SeatBooking.countDocuments(),
      todayBookings: await SeatBooking.countDocuments({
        bookingDate: { $gte: today, $lte: todayEnd },
        status: 'booked'
      }),
      activeBookings: await SeatBooking.countDocuments({ status: 'booked' }),
      cancelledBookings: await SeatBooking.countDocuments({ status: 'cancelled' })
    };

    res.status(200).json({
      success: true,
      data: {
        bookings,
        stats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching seat bookings:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 GET: Get seat booking by ID
router.get('/:id', async (req, res) => {
  try {
    const booking = await SeatBooking.findById(req.params.id)
      .populate('student', 'name email registrationNumber mobileNumber department semester')
      .populate('route', 'name startingPoint mainDestination monthlyFare')
      .populate('monthlyBooking', 'bookingType totalAmount')
      .lean();

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Seat booking not found'
      });
    }

    res.status(200).json({
      success: true,
      data: booking
    });
  } catch (error) {
    console.error('Error fetching seat booking:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 GET: Get seat availability for a vehicle
router.get('/vehicles/:vehicleId/availability', async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const { date } = req.query;

    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const dateEnd = new Date(targetDate);
    dateEnd.setHours(23, 59, 59, 999);

    // Get all bookings for this vehicle on this date
    const bookings = await SeatBooking.find({
      vehicle: vehicleId,
      bookingDate: { $gte: targetDate, $lte: dateEnd },
      status: 'booked'
    })
      .populate('student', 'name registrationNumber')
      .sort('seatNumber')
      .lean();

    // Get vehicle details (need to find which route/time slot this vehicle belongs to)
    const route = await Route.findOne({
      'timeSlots.vehicles._id': vehicleId
    });

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found in any route'
      });
    }

    // Find the specific vehicle
    let vehicleDetails = null;
    let timeSlotDetails = null;

    for (const timeSlot of route.timeSlots) {
      const vehicle = timeSlot.vehicles.id(vehicleId);
      if (vehicle) {
        vehicleDetails = vehicle;
        timeSlotDetails = {
          _id: timeSlot._id,
          time: timeSlot.time
        };
        break;
      }
    }

    if (!vehicleDetails) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle details not found'
      });
    }

    // Create seat map
    const totalSeats = vehicleDetails.totalSeats;
    const seatsPerRow = 4;
    const rows = Math.ceil(totalSeats / seatsPerRow);
    const seatMap = [];

    const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    for (let row = 0; row < rows; row++) {
      const rowSeats = [];
      for (let seatInRow = 0; seatInRow < seatsPerRow; seatInRow++) {
        const seatNumber = (row * seatsPerRow) + seatInRow + 1;
        
        if (seatNumber > totalSeats) {
          rowSeats.push(null);
          continue;
        }

        const seatLabel = `${rowLabels[row]}${seatInRow + 1}`;
        const booking = bookings.find(b => b.seatNumber === seatNumber);

        rowSeats.push({
          seatNumber,
          seatLabel,
          isBooked: !!booking,
          booking: booking ? {
            student: booking.student,
            gender: booking.gender,
            bookedAt: booking.createdAt
          } : null
        });
      }
      seatMap.push(rowSeats);
    }

    res.status(200).json({
      success: true,
      data: {
        vehicle: {
          _id: vehicleId,
          vehicleNumber: vehicleDetails.vehicleNumber,
          vehicleType: vehicleDetails.vehicleType,
          totalSeats
        },
        timeSlot: timeSlotDetails,
        route: {
          _id: route._id,
          name: route.name
        },
        date: targetDate,
        seatMap,
        bookings,
        statistics: {
          totalSeats,
          bookedSeats: bookings.length,
          availableSeats: totalSeats - bookings.length,
          maleSeats: bookings.filter(b => b.gender === 'male').length,
          femaleSeats: bookings.filter(b => b.gender === 'female').length
        }
      }
    });
  } catch (error) {
    console.error('Error fetching seat availability:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 DELETE: Cancel booking (admin)
router.delete('/:id', async (req, res) => {
  try {
    const booking = await SeatBooking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Seat booking not found'
      });
    }

    // Update status to cancelled
    booking.status = 'cancelled';
    await booking.save();

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

// 🔹 GET: Get analytics for seat bookings
router.get('/analytics/overview', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const filter = {};
    if (startDate || endDate) {
      filter.bookingDate = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.bookingDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.bookingDate.$lte = end;
      }
    }

    // Total bookings
    const totalBookings = await SeatBooking.countDocuments(filter);

    // Bookings by status
    const bookingsByStatus = await SeatBooking.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Bookings by route
    const bookingsByRoute = await SeatBooking.aggregate([
      { $match: filter },
      { $group: { _id: '$route', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Populate route names
    for (const item of bookingsByRoute) {
      if (item._id) {
        const route = await Route.findById(item._id).select('name');
        item.routeName = route ? route.name : 'Unknown';
      }
    }

    // Daily bookings for last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const dailyBookings = await SeatBooking.aggregate([
      {
        $match: {
          ...filter,
          bookingDate: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$bookingDate' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Vehicle utilization
    const vehicleUtilization = await SeatBooking.aggregate([
      { $match: filter },
      { $group: { _id: '$vehicleNumber', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalBookings,
        bookingsByStatus,
        bookingsByRoute,
        dailyBookings,
        vehicleUtilization
      }
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;