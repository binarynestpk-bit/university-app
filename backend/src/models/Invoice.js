const mongoose = require('mongoose');

const InvoiceSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  invoiceNumber: {
    type: String,
    required: true,
    unique: true
  },
  issueDate: {
    type: Date,
    default: Date.now
  },
  dueDate: {
    type: Date,
    required: true // 30 minutes from creation
  },
  amount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'under_review', 'approved', 'rejected', 'expired'],
    default: 'active'
  },
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'cash', 'other'],
    default: 'bank_transfer'
  },
  paymentDetails: {
    bankName: String,
    accountNumber: String,
    transactionId: String,
    screenshot: String, // URL to uploaded screenshot
    paidAt: Date
  },
  // Admin who processed
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  processedAt: Date,
  notes: String, // For admin notes when approving/rejecting
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Invoice', InvoiceSchema);