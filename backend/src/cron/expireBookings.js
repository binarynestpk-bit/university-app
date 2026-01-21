const cron = require('node-cron');
const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const Booking = require('../models/Booking');
const User = require('../models/User');

cron.schedule('* * * * *', async () => { // Runs every minute
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    // Find invoices that are active and expired
    const expiredInvoices = await Invoice.find({
      status: 'active',
      dueDate: { $lt: new Date() }
    });
    
    for (const invoice of expiredInvoices) {
      // Update invoice status
      invoice.status = 'expired';
      await invoice.save();
      
      // Update booking status
      await Booking.findByIdAndUpdate(invoice.booking, {
        status: 'expired'
      });
      
      // Remove from user's active booking
      await User.findByIdAndUpdate(invoice.student, {
        $unset: { activeBooking: 1 }
      });
      
      console.log(`Expired invoice: ${invoice.invoiceNumber}`);
    }
    
    // Also check for bookings without invoices that are old
    const oldBookings = await Booking.find({
      status: 'pending',
      createdAt: { $lt: thirtyMinutesAgo },
      invoice: { $exists: false }
    });
    
    for (const booking of oldBookings) {
      booking.status = 'expired';
      await booking.save();
    }
    
  } catch (error) {
    console.error('Cron job error:', error);
  }
});

module.exports = cron;