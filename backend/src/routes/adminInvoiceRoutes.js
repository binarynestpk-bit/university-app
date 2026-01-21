const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const Invoice = require('../models/Invoice');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { sendSocketNotification, sendAdminNotification } = require('../utils/socketHelper');

const router = express.Router();

// Only admin can access
router.use(authMiddleware('admin'));

// 🔹 GET: Invoice statistics for admin dashboard
router.get('/stats', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const totalInvoices = await Invoice.countDocuments();
    const pendingInvoices = await Invoice.countDocuments({ status: 'under_review' });
    const todayInvoices = await Invoice.countDocuments({
      createdAt: { $gte: today, $lt: tomorrow }
    });
    const totalRevenue = await Invoice.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        totalInvoices,
        pendingInvoices,
        todayInvoices,
        totalRevenue: totalRevenue[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Error fetching invoice stats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 GET: Get all invoices with filters
router.get('/', async (req, res) => {
  try {
    const { status, startDate, endDate, search } = req.query;
    
    // Build filter object
    let filter = {};
    
    // Status filter - FIXED: Only apply if not 'all'
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    // Date range filter
    if (startDate || endDate) {
  filter.createdAt = {};

  if (startDate) {
    const start = new Date(startDate);
    filter.createdAt.$gte = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
      0, 0, 0, 0
    );
  }

  if (endDate) {
    const end = new Date(endDate);
    filter.createdAt.$lte = new Date(
      end.getFullYear(),
      end.getMonth(),
      end.getDate(),
      23, 59, 59, 999
    );
  }
}

    
    // Search filter - FIXED: Better search implementation
    if (search) {
      // Try to find users by name, email, or registration number
      const users = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { registrationNumber: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      
      const userIds = users.map(user => user._id);
      
      // If we found users, search by user ID OR invoice number
      if (userIds.length > 0) {
        filter.$or = [
          { invoiceNumber: { $regex: search, $options: 'i' } },
          { student: { $in: userIds } }
        ];
      } else {
        // If no users found, just search by invoice number
        filter.invoiceNumber = { $regex: search, $options: 'i' };
      }
    }
    
    console.log('Filter:', filter); // Debug log
    
    const invoices = await Invoice.find(filter)
      .populate({
        path: 'student',
        select: 'name email registrationNumber',
        match: { _id: { $exists: true } } // Ensure student exists
      })
      .populate({
        path: 'booking',
        select: 'bookingType totalAmount route',
        match: { _id: { $exists: true } } // Ensure booking exists
      })
      .populate('processedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    
    // Filter out invoices where student or booking population failed
    const validInvoices = invoices.filter(invoice => 
      invoice.student && invoice.booking
    );
    
    res.status(200).json({
      success: true,
      data: validInvoices
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 GET: Get invoice by ID
router.get('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('student', 'name email registrationNumber department semester mobileNumber address')
      .populate('booking', 'bookingType totalAmount route subRouteDetails timeSlotDetails month year bookingDate')
      .populate('processedBy', 'name email')
      .lean();
    
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }
    
    // Ensure booking field exists
    if (!invoice.booking) {
      console.warn(`Invoice ${invoice._id} has no associated booking`);
    }
    
    res.status(200).json({
      success: true,
      data: invoice
    });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 PUT: Approve invoice
router.put('/:id/approve', async (req, res) => {
  try {
    const { notes } = req.body;
    const adminId = req.user.id;
    
    const invoice = await Invoice.findById(req.params.id);
    
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }
    
    if (invoice.status !== 'under_review') {
      return res.status(400).json({
        success: false,
        message: 'Invoice is not under review'
      });
    }
    
    // Update invoice
    invoice.status = 'approved';
    invoice.processedBy = adminId;
    invoice.processedAt = new Date();
    if (notes) invoice.notes = notes;
    await invoice.save();
    
    // Update booking status if exists
    if (invoice.booking) {
      await Booking.findByIdAndUpdate(invoice.booking, {
        status: 'approved'
      });
      
      // Update user's booking status and unlock the section
      const user = await User.findById(invoice.student);
      const booking = await Booking.findById(invoice.booking).populate('route');
      
      if (user && booking) {
        if (booking.bookingType === 'monthly') {
          user.hasMonthlyBooking = true;
          // Set expiry to 30 days from now
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + 30);
          user.monthlyBookingExpiry = expiryDate;
        } else if (booking.bookingType === 'daily') {
          user.hasDailyBooking = true;
          // Set expiry to today at 5 PM
          const today = new Date();
          today.setHours(17, 0, 0, 0); // 5 PM
          user.dailyBookingExpiry = today;
        }
        
        user.activeBooking = invoice.booking;
        await user.save();
      }
    }
    
    // Create notification for student
    const notification = new Notification({
      userId: invoice.student,
      role: 'student',
      message: `Your invoice ${invoice.invoiceNumber} has been approved.`
    });
    
    await notification.save();
    
    // Send real-time notification to student
    if (typeof sendSocketNotification === 'function') {
      sendSocketNotification(invoice.student.toString(), {
        message: `Your invoice ${invoice.invoiceNumber} has been approved.`,
        type: 'invoice_approved',
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber
      });
    }
    
    // Notify admin that action was taken
    if (typeof sendAdminNotification === 'function') {
      sendAdminNotification({
        message: `Invoice ${invoice.invoiceNumber} approved for ${invoice.student.name}`,
        type: 'admin_action'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Invoice approved successfully',
      data: invoice
    });
    
  } catch (error) {
    console.error('Error approving invoice:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 PUT: Reject invoice
router.put('/:id/reject', async (req, res) => {
  try {
    const { notes } = req.body;
    const adminId = req.user.id;
    
    const invoice = await Invoice.findById(req.params.id);
    
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }
    
    if (invoice.status !== 'under_review') {
      return res.status(400).json({
        success: false,
        message: 'Invoice is not under review'
      });
    }
    
    // Update invoice
    invoice.status = 'rejected';
    invoice.processedBy = adminId;
    invoice.processedAt = new Date();
    if (notes) invoice.notes = notes;
    await invoice.save();
    
    // Update booking status if exists
    if (invoice.booking) {
      await Booking.findByIdAndUpdate(invoice.booking, {
        status: 'rejected'
      });
    }
    
    // Create notification for student
    const notification = new Notification({
      userId: invoice.student,
      role: 'student',
      message: `Your invoice ${invoice.invoiceNumber} has been rejected. Reason: ${notes || 'No reason provided'}`
    });
    
    await notification.save();
    
    // Send real-time notification to student
    if (typeof sendSocketNotification === 'function') {
      sendSocketNotification(invoice.student.toString(), {
        message: `Your invoice ${invoice.invoiceNumber} has been rejected. Reason: ${notes || 'No reason provided'}`,
        type: 'invoice_rejected',
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber
      });
    }
    
    // Notify admin
    if (typeof sendAdminNotification === 'function') {
      sendAdminNotification({
        message: `Invoice ${invoice.invoiceNumber} rejected`,
        type: 'admin_action'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Invoice rejected successfully',
      data: invoice
    });
    
  } catch (error) {
    console.error('Error rejecting invoice:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;