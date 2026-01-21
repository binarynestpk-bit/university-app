// backend/src/models/Driver.js
const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  contactEmail: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true
  },
  address: {
    type: String,
    required: [true, 'Address is required']
  },
  cnic: {
    type: String,
    required: [true, 'CNIC is required'],
    unique: true,
    match: [/^[0-9]{5}-[0-9]{7}-[0-9]$/, 'Please provide a valid CNIC']
  },
  cnicFrontImage: {
    type: String,
    required: [true, 'CNIC front image is required']
  },
  cnicBackImage: {
    type: String,
    required: [true, 'CNIC back image is required']
  },
  profileImage: {
    type: String,
    default: ''
  },
  licenseNumber: {
    type: String,
    default: ''
  },
  licenseExpiry: {
    type: Date
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'on_leave'],
    default: 'active'
  },
  notes: {
    type: String,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for better query performance
driverSchema.index({ name: 1, phoneNumber: 1, cnic: 1 });
driverSchema.index({ status: 1 });

const Driver = mongoose.model('Driver', driverSchema);
module.exports = Driver;