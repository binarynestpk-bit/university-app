const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const Route = require('../models/Route');
const Booking = require('../models/Booking');
const Invoice = require('../models/Invoice');
const InvoiceHelper = require('../utils/invoiceHelper');
const User = require('../models/User');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// Middleware - only students can access
router.use(authMiddleware('student'));

// Configure multer for memory storage (to upload directly to Cloudinary)
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// 🔹 GET: Get all available routes with sub-routes
router.get('/routes', async (req, res) => {
  try {
    const routes = await Route.find({})
      .select('name startingPoint mainDestination monthlyFare subRoutes timeSlots')
      .lean();
    
    res.status(200).json({
      success: true,
      data: routes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 GET: Get user profile data for registration form
router.get('/profile-data', async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId)
      .select('name email registrationNumber department semester mobileNumber address dateOfBirth cnic');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 POST: Upload payment screenshot to Cloudinary
router.post('/upload-payment-screenshot', upload.single('image'), async (req, res) => {
  try {
    // Note: userId is intentionally declared but may not be used immediately
    // We're keeping it for future reference if needed
    const userId = req.user.id; // This is valid even if not used yet
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image uploaded'
      });
    }

    // Get uploadToCloudinary function
    const { uploadToCloudinary } = require('../utils/cloudinary');
    
    // Convert buffer to base64 for Cloudinary
    // No need to import Buffer - it's a global in Node.js
    const b64 = req.file.buffer.toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;
    
    // Upload to Cloudinary with user-specific folder
    const uploadResult = await uploadToCloudinary(dataURI, {
      folder: `wise-route-payment-screenshots/user-${userId}`,
      resource_type: 'image',
    });

    res.status(200).json({
      success: true,
      data: {
        imageUrl: uploadResult.secure_url,
        publicId: uploadResult.public_id
      }
    });
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload image'
    });
  }
});

// 🔹 POST: Create booking registration
router.post('/register-booking', async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      routeId,
      subRouteId,
      bookingType,
      month,
      year,
      bookingDate,
      timeSlotId
    } = req.body;

    // 1. Validate input
    if (!routeId || !bookingType) {
      return res.status(400).json({
        success: false,
        message: 'Route ID and booking type are required'
      });
    }

    // 2. Fetch route and validate
    const route = await Route.findById(routeId);
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    // 3. Validate sub-route if provided
    let subRoute = null;
    if (subRouteId) {
      subRoute = route.subRoutes.id(subRouteId);
      if (!subRoute) {
        return res.status(404).json({
          success: false,
          message: 'Sub-route not found'
        });
      }
    }

    // 4. Validate time slot if provided
    let timeSlot = null;
    if (timeSlotId) {
      timeSlot = route.timeSlots.id(timeSlotId);
      if (!timeSlot) {
        return res.status(404).json({
          success: false,
          message: 'Time slot not found'
        });
      }
    }

    // 5. Calculate amount
 // 5. Calculate amount (FIXED)
let totalAmount = 0;

if (subRoute) {
  totalAmount = subRoute.price;          // ✅ sub-route ALWAYS wins
} else {
  totalAmount = route.monthlyFare;       // ✅ fallback
}


    // 6. Check if user already has active booking of same type
    const existingBookings = await Booking.find({
      student: userId,
      bookingType,
      status: { $in: ['approved', 'pending'] }
    }).populate('invoice');

    let hasActiveBooking = false;
    
    for (const booking of existingBookings) {
      // If booking is approved, definitely block
      if (booking.status === 'approved') {
        hasActiveBooking = true;
        break;
      }
      
      // If booking is pending, check invoice status
      if (booking.status === 'pending' && booking.invoice) {
        const now = new Date();
        
        // Check if invoice is still active
        const invoice = await Invoice.findById(booking.invoice._id);
        if (invoice) {
          if (invoice.status === 'active' && invoice.dueDate > now) {
            hasActiveBooking = true;
            break;
          }
          
          // If invoice is expired or due date passed, update both
          if (invoice.status === 'expired' || invoice.dueDate <= now) {
            // Update invoice status if not already expired
            if (invoice.status !== 'expired') {
              invoice.status = 'expired';
              await invoice.save();
            }
            
            // Update booking status to expired
            booking.status = 'expired';
            await booking.save();
            
            // Remove activeBooking reference from user
            await User.findByIdAndUpdate(userId, {
              $unset: { activeBooking: 1 }
            });
            
            // Create notification about expiry
            await InvoiceHelper.createNotification(
              userId,
              'Booking Expired',
              `Your ${bookingType} booking has expired. You can create a new booking.`
            );
          }
        }
      }
    }

    if (hasActiveBooking) {
      return res.status(400).json({
        success: false,
        message: `You already have an active ${bookingType} booking with pending payment`
      });
    }

    // 7. Create booking record
    const booking = new Booking({
      student: userId,
      route: routeId,
      subRoute: subRouteId,
      subRouteDetails: subRoute ? {
        name: subRoute.name,
        price: subRoute.price
      } : null,
      bookingType,
      month: bookingType === 'monthly' ? month : null,
      year: bookingType === 'monthly' ? year : null,
      bookingDate: bookingType === 'daily' ? new Date(bookingDate) : null,
      timeSlot: timeSlotId,
      timeSlotDetails: timeSlot ? {
        time: timeSlot.time
      } : null,
      totalAmount,
      status: 'pending'
    });

    await booking.save();

    // 8. Create invoice
    const invoice = await InvoiceHelper.createInvoice(booking, userId);

    // 9. Update booking with invoice reference
    booking.invoice = invoice._id;
    await booking.save();

    // 10. Update user with booking reference
    await User.findByIdAndUpdate(userId, {
      activeBooking: booking._id
    });

    // 11. Send success response
    res.status(201).json({
      success: true,
      message: 'Booking registration successful! Invoice generated.',
      data: {
        booking,
        invoice
      }
    });

  } catch (error) {
    console.error('Booking registration error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 GET: Get user's active invoices
router.get('/invoices/active', async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    
    // First, check for any expired invoices and update them
    const activeInvoices = await Invoice.find({
      student: userId,
      status: 'active',
      dueDate: { $gt: now }
    });
    
    // Find invoices that have expired but still marked as active
    const expiredActiveInvoices = await Invoice.find({
      student: userId,
      status: 'active',
      dueDate: { $lte: now }
    });
    
    // Update expired invoices
    for (const invoice of expiredActiveInvoices) {
      invoice.status = 'expired';
      await invoice.save();
      
      // Also update booking status
      await Booking.findByIdAndUpdate(invoice.booking, {
        status: 'expired'
      });
      
      // Remove activeBooking reference from user
      await User.findByIdAndUpdate(userId, {
        $unset: { activeBooking: 1 }
      });
    }
    
    // Return only truly active invoices
    const invoices = await Invoice.find({
      student: userId,
      status: 'active'
    })
      .populate('booking', 'bookingType totalAmount route')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: invoices
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 GET: Get user's invoices by status
router.get('/invoices/:status', async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.params;
    
    const validStatuses = ['active', 'under_review', 'approved', 'rejected', 'expired'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const invoices = await Invoice.find({
      student: userId,
      status
    })
      .populate('booking', 'bookingType totalAmount route')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: invoices
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 GET: Get user's active bookings for cleanup
router.get('/cleanup-expired', async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    
    // Find pending bookings with expired invoices
    const pendingBookings = await Booking.find({
      student: userId,
      status: 'pending'
    }).populate('invoice');
    
    let cleanedCount = 0;
    
    for (const booking of pendingBookings) {
      if (booking.invoice) {
        const invoice = await Invoice.findById(booking.invoice._id);
        if (invoice && (invoice.status === 'expired' || invoice.dueDate <= now)) {
          // Update booking status
          booking.status = 'expired';
          await booking.save();
          
          // Update invoice status if not already
          if (invoice.status !== 'expired') {
            invoice.status = 'expired';
            await invoice.save();
          }
          
          cleanedCount++;
        }
      } else if (booking.createdAt < new Date(now.getTime() - 30 * 60 * 1000)) {
        // Booking without invoice that's older than 30 minutes
        booking.status = 'expired';
        await booking.save();
        cleanedCount++;
      }
    }
    
    // Remove activeBooking reference if it points to expired booking
    const user = await User.findById(userId);
    if (user.activeBooking) {
      const activeBooking = await Booking.findById(user.activeBooking);
      if (activeBooking && activeBooking.status === 'expired') {
        user.activeBooking = null;
        await user.save();
      }
    }

    res.status(200).json({
      success: true,
      message: `Cleaned up ${cleanedCount} expired bookings`,
      data: { cleanedCount }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 POST: Submit payment proof
router.post('/invoices/:invoiceId/pay', async (req, res) => {
  try {
    const userId = req.user.id;
    const { invoiceId } = req.params;
    const {
      bankName,
      accountNumber,
      transactionId,
      screenshot
    } = req.body;

    // 1. Find and validate invoice
    const invoice = await Invoice.findOne({
      _id: invoiceId,
      student: userId,
      status: 'active'
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Active invoice not found'
      });
    }

    // 2. Check if invoice is expired
    if (invoice.dueDate < new Date()) {
      invoice.status = 'expired';
      await invoice.save();
      
      // Also update booking status
      await Booking.findByIdAndUpdate(invoice.booking, {
        status: 'expired'
      });
      
      // Remove activeBooking reference from user
      await User.findByIdAndUpdate(userId, {
        $unset: { activeBooking: 1 }
      });
      
      return res.status(400).json({
        success: false,
        message: 'Invoice has expired. Please create a new booking.'
      });
    }

    // 3. Update invoice with payment details
    invoice.paymentMethod = 'bank_transfer';
    invoice.paymentDetails = {
      bankName,
      accountNumber,
      transactionId,
      screenshot,
      paidAt: new Date()
    };
    invoice.status = 'under_review';
    await invoice.save();

    // 4. Update booking status
    await Booking.findByIdAndUpdate(invoice.booking, {
      status: 'under_review'
    });

    // 5. Create notification for admin (will be implemented in Phase 3)
    // await createAdminNotification(...);

    res.status(200).json({
      success: true,
      message: 'Payment submitted for review. Admin will review your payment.',
      data: invoice
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 GET: Check booking status (locked/unlocked)
router.get('/booking-status', async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId)
      .select('hasMonthlyBooking hasDailyBooking monthlyBookingExpiry dailyBookingExpiry activeBooking');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const now = new Date();
    
    // Check if monthly booking is expired
    if (user.monthlyBookingExpiry && user.monthlyBookingExpiry < now) {
      user.hasMonthlyBooking = false;
      user.monthlyBookingExpiry = null;
      await user.save();
    }

    // Check if daily booking is expired
    if (user.dailyBookingExpiry && user.dailyBookingExpiry < now) {
      user.hasDailyBooking = false;
      user.dailyBookingExpiry = null;
      await user.save();
    }
    
    // Check if activeBooking reference points to expired booking
    if (user.activeBooking) {
      const activeBooking = await Booking.findById(user.activeBooking);
      if (activeBooking && activeBooking.status === 'expired') {
        user.activeBooking = null;
        await user.save();
      }
    }

    res.status(200).json({
      success: true,
      data: {
        hasMonthlyBooking: user.hasMonthlyBooking,
        hasDailyBooking: user.hasDailyBooking,
        monthlyBookingExpiry: user.monthlyBookingExpiry,
        dailyBookingExpiry: user.dailyBookingExpiry,
        monthlyLocked: !user.hasMonthlyBooking,
        dailyLocked: !user.hasDailyBooking,
        activeBooking: user.activeBooking
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 DELETE: Cancel/delete expired booking
router.delete('/booking/:bookingId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { bookingId } = req.params;

    const booking = await Booking.findOne({
      _id: bookingId,
      student: userId,
      status: 'expired'
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Expired booking not found'
      });
    }

    // Delete associated invoice if exists
    if (booking.invoice) {
      await Invoice.findByIdAndDelete(booking.invoice);
    }

    // Delete booking
    await Booking.findByIdAndDelete(bookingId);

    // Remove activeBooking reference if it points to this booking
    const user = await User.findById(userId);
    if (user.activeBooking && user.activeBooking.toString() === bookingId) {
      user.activeBooking = null;
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: 'Expired booking deleted successfully'
    });
  } catch (error) {
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
    const booking = await Booking.findOne({
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

    // REMOVED THE 30-MINUTE CHECK - Users can cancel anytime

    // Update booking status
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

module.exports = router;