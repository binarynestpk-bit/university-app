const Invoice = require('../models/Invoice');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { sendSocketNotification } = require('./socketHelper');

class InvoiceHelper {
  // Generate unique invoice number: INV-YYYYMMDD-XXXX
  static generateInvoiceNumber() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `INV-${dateStr}-${randomNum}`;
  }

  // Calculate due date (30 minutes from now)
  static getDueDate() {
    const now = new Date();
    return new Date(now.getTime() + 30 * 60000); // 30 minutes
  }

  // Create invoice for booking
  static async createInvoice(booking, studentId) {
    const invoiceNumber = this.generateInvoiceNumber();
    const dueDate = this.getDueDate();

    const invoice = new Invoice({
      invoiceNumber,
      student: studentId,
      booking: booking._id,
      issueDate: new Date(),
      dueDate,
      amount: booking.totalAmount,
      status: 'active',
      bookingDetails: {
        route: booking.route,
        subRoute: booking.subRoute,
        bookingType: booking.bookingType,
        month: booking.month,
        year: booking.year,
        bookingDate: booking.bookingDate
      }
    });

    await invoice.save();
    
    // Update booking with invoice reference
    booking.invoice = invoice._id;
    await booking.save();
    
    return invoice;
  }

  // Check and expire old invoices (run as cron job)
  static async expireOldInvoices() {
    const now = new Date();
    const expiredInvoices = await Invoice.find({
      status: 'active',
      dueDate: { $lt: now }
    });

    let expiredCount = 0;
    
    for (const invoice of expiredInvoices) {
      invoice.status = 'expired';
      await invoice.save();
      
      // Update associated booking status
      await Booking.findByIdAndUpdate(invoice.booking, {
        status: 'expired'
      });
      
      // Remove activeBooking reference from user
      await User.findByIdAndUpdate(invoice.student, {
        $unset: { activeBooking: 1 }
      });
      
      // Create notification for student
      await this.createNotification(
        invoice.student,
        'Invoice Expired',
        `Invoice ${invoice.invoiceNumber} has expired. Please create a new booking.`
      );
      
      expiredCount++;
    }

    // Also expire old bookings without invoices
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const oldBookings = await Booking.find({
      status: 'pending',
      createdAt: { $lt: thirtyMinutesAgo },
      invoice: { $exists: false }
    });

    for (const booking of oldBookings) {
      booking.status = 'expired';
      await booking.save();
      expiredCount++;
    }

    return expiredCount;
  }

  // Updated to match Notification model with title field
  static async createNotification(userId, title, message) {
    const notification = new Notification({
      userId: userId,
      role: 'student',
      title: title,  // ADDED TITLE
      message: message
    });

    await notification.save();
    
    // Send real-time notification via socket
    if (typeof sendSocketNotification === 'function') {
      sendSocketNotification(userId.toString(), {
        title: title,
        message: message,
        type: 'invoice_update'
      });
    }

    return notification;
  }
}

module.exports = InvoiceHelper;