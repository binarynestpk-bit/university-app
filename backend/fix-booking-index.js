const mongoose = require('mongoose');
require('dotenv').config();

async function fixBookingIndex() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to MongoDB');

    // Get the bookings collection
    const db = mongoose.connection.db;
    const bookingsCollection = db.collection('bookings');

    // Get all indexes
    const indexes = await bookingsCollection.indexes();
    console.log('Current indexes:', JSON.stringify(indexes, null, 2));

    // Find and drop the problematic index
    const problematicIndexName = 'route_1_timeSlot_1_vehicle_1_seatNumber_1_bookingDate_1';
    
    for (const index of indexes) {
      if (index.name === problematicIndexName) {
        console.log(`Found problematic index: ${problematicIndexName}`);
        await bookingsCollection.dropIndex(problematicIndexName);
        console.log('✅ Index dropped successfully!');
        break;
      }
    }

    // Create a better index if needed (optional)
    // This prevents duplicate active bookings for same student and route
    try {
      await bookingsCollection.createIndex(
        { 
          student: 1,
          route: 1,
          bookingType: 1,
          status: 1
        },
        { 
          name: 'student_route_booking_status',
          partialFilterExpression: {
            status: { $in: ['pending', 'approved'] }
          }
        }
      );
      console.log('✅ Created new student_route_booking_status index');
    } catch (err) {
      console.log('Note: student_route_booking_status index might already exist');
    }

    console.log('✅ All fixes applied successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixBookingIndex();