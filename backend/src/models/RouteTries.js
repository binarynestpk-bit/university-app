const mongoose = require('mongoose');

const RouteTriesSchema = new mongoose.Schema({
  // Student reference
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true  // One record per student
  },
  
  // Monthly booking reference
  monthlyBooking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  
  // Current month tracking (reset monthly)
  month: {
    type: Number,  // 1-12
    required: true
  },
  year: {
    type: Number,
    required: true
  },
  
  // Counter for alternative routes
  alternativeRouteTries: {
    type: Number,
    default: 0,
    max: 3
  },
  
  // Track which dates alternative routes were used
  alternativeRouteDates: [{
    date: Date,
    route: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route'
    }
  }],
  
  // Last reset date
  lastReset: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for month-based queries
RouteTriesSchema.index({ student: 1, month: 1, year: 1 });

// Method to check if student can use alternative route
RouteTriesSchema.methods.canUseAlternativeRoute = function() {
  return this.alternativeRouteTries < 3;
};

// Method to increment counter
RouteTriesSchema.methods.useAlternativeRoute = function(routeId) {
  if (this.canUseAlternativeRoute()) {
    this.alternativeRouteTries += 1;
    this.alternativeRouteDates.push({
      date: new Date(),
      route: routeId
    });
    return true;
  }
  return false;
};

// Static method to get or create for student
RouteTriesSchema.statics.getForStudent = async function(studentId, monthlyBookingId, month, year) {
  let routeTries = await this.findOne({ student: studentId, month, year });
  
  if (!routeTries) {
    routeTries = new this({
      student: studentId,
      monthlyBooking: monthlyBookingId,
      month,
      year,
      alternativeRouteTries: 0,
      alternativeRouteDates: []
    });
    await routeTries.save();
  }
  
  return routeTries;
};

module.exports = mongoose.model('RouteTries', RouteTriesSchema);