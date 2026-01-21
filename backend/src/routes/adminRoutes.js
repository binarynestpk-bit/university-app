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
router.get('/invoices/stats', async (req, res) => {
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
router.get('/invoices', async (req, res) => {
  try {
    const { status, startDate, endDate, search } = req.query;
    
    let filter = {};
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    
    if (search) {
      const users = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { registrationNumber: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      
      const userIds = users.map(user => user._id);
      
      filter.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { student: { $in: userIds } }
      ];
    }
    
    const invoices = await Invoice.find(filter)
      .populate('student', 'name email registrationNumber')
      .populate('booking', 'bookingType totalAmount route')
      .populate('processedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    
    res.status(200).json({
      success: true,
      data: invoices
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
router.get('/invoices/:id', async (req, res) => {
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
router.put('/invoices/:id/approve', async (req, res) => {
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
    
    // Update booking status
    await Booking.findByIdAndUpdate(invoice.booking, {
      status: 'approved'
    });
    
    // Update user's booking status
    const user = await User.findById(invoice.student);
    const booking = await Booking.findById(invoice.booking).populate('route');
    
    if (booking && booking.bookingType === 'monthly') {
      user.hasMonthlyBooking = true;
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30);
      user.monthlyBookingExpiry = expiryDate;
    } else if (booking && booking.bookingType === 'daily') {
      user.hasDailyBooking = true;
      const today = new Date();
      today.setHours(17, 0, 0, 0);
      user.dailyBookingExpiry = today;
    }
    
    user.activeBooking = invoice.booking;
    await user.save();
    
    // Create notification for student - WITH TITLE FIELD
    const notification = new Notification({
      userId: invoice.student,
      role: 'student',
      title: 'Invoice Approved',  // ADDED THIS
      message: `Your invoice ${invoice.invoiceNumber} has been approved. ${booking?.bookingType || 'booking'} is now active.`
    });
    
    await notification.save();
    
    // Send real-time notification
    if (typeof sendSocketNotification === 'function') {
      sendSocketNotification(invoice.student.toString(), {
        title: 'Invoice Approved',
        message: `Your invoice ${invoice.invoiceNumber} has been approved. Your booking is now active.`,
        type: 'invoice_approved',
        invoiceId: invoice._id
      });
    }
    
    // Notify admin
    if (typeof sendAdminNotification === 'function') {
      sendAdminNotification({
        title: 'Invoice Approved',
        message: `Invoice ${invoice.invoiceNumber} approved for ${user.name}`,
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
router.put('/invoices/:id/reject', async (req, res) => {
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
    
    // Update booking status
    await Booking.findByIdAndUpdate(invoice.booking, {
      status: 'rejected'
    });
    
    // Create notification for student - WITH TITLE FIELD
    const notification = new Notification({
      userId: invoice.student,
      role: 'student',
      title: 'Invoice Rejected',  // ADDED THIS
      message: `Your invoice ${invoice.invoiceNumber} has been rejected. Reason: ${notes || 'No reason provided'}`
    });
    
    await notification.save();
    
    // Send real-time notification
    if (typeof sendSocketNotification === 'function') {
      sendSocketNotification(invoice.student.toString(), {
        title: 'Invoice Rejected',
        message: `Your invoice ${invoice.invoiceNumber} has been rejected. Reason: ${notes || 'No reason provided'}`,
        type: 'invoice_rejected',
        invoiceId: invoice._id
      });
    }
    
    // Notify admin
    if (typeof sendAdminNotification === 'function') {
      sendAdminNotification({
        title: 'Invoice Rejected',
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