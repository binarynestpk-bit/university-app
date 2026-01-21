const Route = require('../models/Route');
const SeatBooking = require('../models/SeatBooking');
const mongoose = require('mongoose');

class ResponseGenerator {
  constructor() {
    this.emojis = {
      route: '🚌',
      seat: '💺',
      time: '⏰',
      fare: '💰',
      vehicle: '🚗',
      success: '✅',
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      check: '✓',
      list: '📋',
      calendar: '📅',
      location: '📍',
      switch: '🔄',
      question: '🤔',
      guide: '🗺️'
    };
  }

  // Format route information
  async formatRouteInfo(route, detailed = false) {
    let response = `${this.emojis.route} **${route.name}**\n`;
    response += `${this.emojis.location} **Path:** ${route.startingPoint} → ${route.mainDestination}\n`;
    response += `${this.emojis.fare} **Monthly Fare:** Rs. ${route.monthlyFare}\n\n`;

    if (detailed) {
      // Subroutes
      if (route.subRoutes && route.subRoutes.length > 0) {
        response += `${this.emojis.list} **Subroutes/Stops:**\n`;
        route.subRoutes.forEach((subRoute, index) => {
          const isMain = subRoute.price === route.monthlyFare;
          response += `  ${index + 1}. ${subRoute.name} - Rs. ${subRoute.price} ${isMain ? '🌟 (Main Stop)' : ''}\n`;
        });
        response += '\n';
      }

      // Time slots
      if (route.timeSlots && route.timeSlots.length > 0) {
        response += `${this.emojis.time} **Time Slots:**\n`;
        route.timeSlots.forEach((slot, index) => {
          response += `  ${index + 1}. ${slot.time}\n`;
          if (slot.vehicles && slot.vehicles.length > 0) {
            slot.vehicles.forEach(vehicle => {
              response += `     🚗 ${vehicle.vehicleNumber} (${vehicle.vehicleType}) - ${vehicle.totalSeats} seats\n`;
            });
          }
        });
      }
      
      response += `\n${this.emojis.guide} **What would you like to know next?**\n`;
      response += `• Seat availability\n`;
      response += `• Book a seat\n`;
      response += `• Switch to another route\n`;
      response += `• Or ask: "Tell me everything about ${route.name}"`;
    } else {
      // Brief version
      response += `${this.emojis.check} **Subroutes:** ${route.subRoutes.length}\n`;
      response += `${this.emojis.check} **Time Slots:** ${route.timeSlots.length}\n`;
      response += `${this.emojis.check} **Vehicles:** ${route.timeSlots.reduce((sum, ts) => sum + ts.vehicles.length, 0)}\n\n`;
      response += `${this.emojis.question} **Ask:** "Tell me more about ${route.name}" for detailed information.`;
    }

    return response;
  }

  // Add this method to the ResponseGenerator class
  async formatCompleteRouteInfo(route) {
    let response = `${this.emojis.route} **COMPLETE INFORMATION FOR ${route.name.toUpperCase()}**\n\n`;
    
    // Basic route info
    response += `📍 **Route Path:** ${route.startingPoint} → ${route.mainDestination}\n`;
    response += `💰 **Monthly Fare:** Rs. ${route.monthlyFare}\n\n`;
    
    // Subroutes
    if (route.subRoutes && route.subRoutes.length > 0) {
      response += `${this.emojis.list} **Subroutes/Stops (${route.subRoutes.length}):**\n`;
      route.subRoutes.forEach((subRoute, index) => {
        const isMain = subRoute.price === route.monthlyFare;
        response += `  ${index + 1}. ${subRoute.name} - Rs. ${subRoute.price} ${isMain ? '🌟 (Main Stop)' : ''}\n`;
      });
      response += '\n';
    }
    
    // Time slots and vehicles
    if (route.timeSlots && route.timeSlots.length > 0) {
      response += `${this.emojis.time} **Time Slots & Vehicles (${route.timeSlots.length}):**\n`;
      
      // Calculate total seats
      let totalSeats = 0;
      let totalVehicles = 0;
      
      route.timeSlots.forEach((slot, index) => {
        response += `\n  **${index + 1}. ${slot.time}**\n`;
        
        if (slot.vehicles && slot.vehicles.length > 0) {
          totalVehicles += slot.vehicles.length;
          slot.vehicles.forEach(vehicle => {
            totalSeats += vehicle.totalSeats;
            response += `     🚗 ${vehicle.vehicleNumber} (${vehicle.vehicleType}) - ${vehicle.totalSeats} seats\n`;
          });
        }
      });
      
      response += `\n📊 **Route Summary:**\n`;
      response += `   Total Vehicles: ${totalVehicles}\n`;
      response += `   Total Seats: ${totalSeats}\n`;
      response += `   Time Slots: ${route.timeSlots.length}\n`;
      response += `   Subroutes: ${route.subRoutes?.length || 0}\n`;
    }
    
    // Booking information
    response += `\n${this.emojis.info} **Booking Information:**\n`;
    response += `• Monthly Pass: Rs. ${route.monthlyFare}\n`;
    response += `• Daily Booking: Available for registered students\n`;
    response += `• Alternative Routes: 3 times per month\n`;
    
    // What you can do next
    response += `\n${this.emojis.guide} **What can you do with this route?**\n`;
    response += `1. Check seat availability\n`;
    response += `2. Book a seat\n`;
    response += `3. View time slots\n`;
    response += `4. See vehicle details\n`;
    response += `5. Check fare information\n`;
    response += `6. Switch to another route\n`;
    
    response += `\n💡 **Quick Commands:**\n`;
    response += `• "Show seat availability"\n`;
    response += `• "What are the time slots?"\n`;
    response += `• "Tell me about vehicles"\n`;
    response += `• "Switch to [different route]"`;
    
    return response;
  }

  // Format all routes
  async formatAllRoutes(routes) {
    let response = `${this.emojis.route} **All Available Routes**\n\n`;
    
    routes.forEach((route, index) => {
      response += `${index + 1}. **${route.name}**\n`;
      response += `   📍 ${route.startingPoint} → ${route.mainDestination}\n`;
      response += `   💰 Monthly: Rs. ${route.monthlyFare}\n`;
      response += `   ⏰ Slots: ${route.timeSlots.length} | 🚗 Vehicles: ${route.timeSlots.reduce((sum, ts) => sum + ts.vehicles.length, 0)}\n`;
      response += `   📋 Stops: ${route.subRoutes.length}\n\n`;
    });

    response += `\n${this.emojis.guide} **How to use:**\n`;
    response += `• Say "Tell me about [route name]" for details\n`;
    response += `• Or "Switch to [route name]" to focus on that route\n`;
    response += `• Or ask "What can you tell me about [route name]?" for complete information`;
    
    return response;
  }

  // Format fare information - FIXED VERSION
  async formatFareInfo(routes, specificRoute = null) {
    if (specificRoute) {
      // Find the specific route
      let route;
      if (typeof specificRoute === 'string') {
        route = routes.find(r => 
          r.name.toLowerCase() === specificRoute.toLowerCase() || 
          r._id.toString() === specificRoute
        );
      }
      
      if (!route) {
        // Try to find by regex if exact match fails
        route = routes.find(r => 
          r.name.toLowerCase().includes(specificRoute.toLowerCase()) ||
          specificRoute.toLowerCase().includes(r.name.toLowerCase())
        );
      }

      if (!route) {
        return `${this.emojis.error} **Route "${specificRoute}" not found!**\n\nAvailable routes:\n${routes.map(r => `• ${r.name}`).join('\n')}`;
      }
      
      let response = `${this.emojis.fare} **FARE INFORMATION FOR ${route.name.toUpperCase()}**\n\n`;
      response += `🚌 **Route:** ${route.startingPoint} → ${route.mainDestination}\n`;
      response += `💰 **Monthly Pass:** Rs. ${route.monthlyFare}\n`;
      
      if (route.subRoutes && route.subRoutes.length > 0) {
        response += `\n${this.emojis.list} **Subroute Fares:**\n`;
        
        // Separate main and intermediate stops
        const mainStop = route.subRoutes.find(sr => sr.price === route.monthlyFare);
        const intermediateStops = route.subRoutes.filter(sr => sr.price !== route.monthlyFare);
        
        if (mainStop) {
          response += `  🌟 **${mainStop.name}** - Rs. ${mainStop.price} (Monthly Pass)\n`;
        }
        
        if (intermediateStops.length > 0) {
          response += `\n  📍 **Intermediate Stops:**\n`;
          intermediateStops.forEach((subRoute, index) => {
            response += `    ${index + 1}. ${subRoute.name} - Rs. ${subRoute.price}\n`;
          });
        }
        
        // Show price range
        const prices = route.subRoutes.map(sr => sr.price);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        
        if (minPrice !== maxPrice) {
          response += `\n${this.emojis.info} **Price Range:** Rs. ${minPrice} - Rs. ${maxPrice}\n`;
        }
      }
      
      response += `\n${this.emojis.guide} **Need help?**\n`;
      response += `• Ask "Show me all fares" to compare routes\n`;
      response += `• Or "Book a seat for ${route.name}" to start booking\n`;
      response += `• Or switch to another route with "Tell me about [other route]"`;
      
      return response;
    }

    // All fares
    let response = `${this.emojis.fare} **FARES FOR ALL ROUTES**\n\n`;
    
    routes.forEach((route, index) => {
      response += `${index + 1}. **${route.name}**\n`;
      response += `   📍 ${route.startingPoint} → ${route.mainDestination}\n`;
      response += `   💰 **Monthly:** Rs. ${route.monthlyFare}\n`;
      
      if (route.subRoutes && route.subRoutes.length > 0) {
        const prices = route.subRoutes.map(sr => sr.price);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        
        if (minPrice === maxPrice) {
          response += `   📍 **Daily/Subroute:** Rs. ${minPrice}\n`;
        } else {
          response += `   📍 **Daily/Subroute:** Rs. ${minPrice} - Rs. ${maxPrice}\n`;
        }
      }
      response += '\n';
    });

    response += `${this.emojis.guide} **To get detailed fare for a specific route:**\n`;
    response += `Say "What's the fare for [route name]?" or "Show me fares for [route name]"`;
    
    return response;
  }

  // Format seat availability
  async formatSeatAvailability(routeId, timeSlot = null, vehicle = null, date = new Date()) {
    const route = await Route.findById(routeId);
    if (!route) return `${this.emojis.error} Route not found!`;

    let response = `${this.emojis.seat} **SEAT AVAILABILITY**\n`;
    response += `**Route:** ${route.name}\n`;
    response += `**Date:** ${date.toLocaleDateString()}\n\n`;

    if (timeSlot && vehicle) {
      // Specific time slot and vehicle
      const timeSlotData = route.timeSlots.find(ts => 
        ts.time.toLowerCase().includes(timeSlot.toLowerCase()) || 
        ts._id.toString() === timeSlot
      );

      if (!timeSlotData) {
        return `${this.emojis.error} **Time slot "${timeSlot}" not found!**\n\nAvailable slots:\n${
          route.timeSlots.map(ts => `• ${ts.time}`).join('\n')
        }`;
      }

      const vehicleData = timeSlotData.vehicles.find(v => 
        v.vehicleNumber.toLowerCase().includes(vehicle.toLowerCase()) || 
        v._id.toString() === vehicle
      );

      if (!vehicleData) {
        return `${this.emojis.error} **Vehicle "${vehicle}" not found!**\n\nAvailable vehicles for ${timeSlotData.time}:\n${
          timeSlotData.vehicles.map(v => `• ${v.vehicleNumber} (${v.vehicleType})`).join('\n')
        }`;
      }

      // Get booked seats for this vehicle on this date
      const bookedSeats = await SeatBooking.find({
        vehicle: vehicleData._id,
        bookingDate: {
          $gte: new Date(date.setHours(0, 0, 0, 0)),
          $lt: new Date(date.setHours(23, 59, 59, 999))
        },
        status: 'booked'
      });

      const availableSeats = vehicleData.totalSeats - bookedSeats.length;
      const utilization = ((bookedSeats.length / vehicleData.totalSeats) * 100).toFixed(1);

      response += `**Time:** ${timeSlotData.time}\n`;
      response += `**Vehicle:** ${vehicleData.vehicleNumber} (${vehicleData.vehicleType})\n`;
      response += `**Total Seats:** ${vehicleData.totalSeats}\n`;
      response += `**Booked Seats:** ${bookedSeats.length}\n`;
      response += `**Available Seats:** ${availableSeats}\n`;
      response += `**Utilization:** ${utilization}%\n\n`;

      if (availableSeats > 0) {
        response += `${this.emojis.success} **Great news!** ${availableSeats} seats are available!\n`;
        response += `You can proceed to book a seat.`;
      } else {
        response += `${this.emojis.warning} **No seats available** for this vehicle.\n`;
        response += `Please try another time slot or vehicle.`;
      }

    } else if (timeSlot) {
      // Specific time slot only
      const timeSlotData = route.timeSlots.find(ts => 
        ts.time.toLowerCase().includes(timeSlot.toLowerCase()) || 
        ts._id.toString() === timeSlot
      );

      if (!timeSlotData) {
        return `${this.emojis.error} **Time slot "${timeSlot}" not found!**\n\nAvailable slots:\n${
          route.timeSlots.map(ts => `• ${ts.time}`).join('\n')
        }`;
      }

      response += `**Time Slot:** ${timeSlotData.time}\n\n`;
      response += `**Available Vehicles:**\n`;

      let totalAvailable = 0;
      let totalSeats = 0;
      
      for (const vehicle of timeSlotData.vehicles) {
        const bookedSeats = await SeatBooking.find({
          vehicle: vehicle._id,
          bookingDate: {
            $gte: new Date(date.setHours(0, 0, 0, 0)),
            $lt: new Date(date.setHours(23, 59, 59, 999))
          },
          status: 'booked'
        });

        const availableSeats = vehicle.totalSeats - bookedSeats.length;
        totalAvailable += availableSeats;
        totalSeats += vehicle.totalSeats;
        
        response += `\n${this.emojis.vehicle} **${vehicle.vehicleNumber}** (${vehicle.vehicleType})\n`;
        response += `   💺 Seats: ${availableSeats}/${vehicle.totalSeats} available\n`;
        response += `   📊 Status: ${availableSeats > 0 ? '✅ Available' : '❌ Full'}\n`;
      }
      
      response += `\n${this.emojis.info} **Summary for ${timeSlotData.time}:**\n`;
      response += `Total Available: ${totalAvailable}/${totalSeats} seats\n`;
      response += `Overall: ${totalAvailable > 0 ? '✅ Seats Available' : '❌ All Vehicles Full'}`;

      response += `\n\n${this.emojis.guide} **Next steps:**\n`;
      response += `• Select a vehicle by saying "Show me seats for [vehicle number]"\n`;
      response += `• Or ask for another time slot\n`;
      response += `• Or switch to a different route`;

    } else {
      // All time slots for the route
      response += `**Available Time Slots:**\n\n`;

      for (const timeSlot of route.timeSlots) {
        response += `${this.emojis.time} **${timeSlot.time}**\n`;
        
        let totalAvailable = 0;
        let totalSeats = 0;
        
        for (const vehicle of timeSlot.vehicles) {
          const bookedSeats = await SeatBooking.find({
            vehicle: vehicle._id,
            bookingDate: {
              $gte: new Date(date.setHours(0, 0, 0, 0)),
              $lt: new Date(date.setHours(23, 59, 59, 999))
            },
            status: 'booked'
          });

          totalAvailable += (vehicle.totalSeats - bookedSeats.length);
          totalSeats += vehicle.totalSeats;
        }

        const utilization = totalSeats > 0 ? ((totalSeats - totalAvailable) / totalSeats * 100).toFixed(1) : 0;
        
        response += `   🚗 Vehicles: ${timeSlot.vehicles.length}\n`;
        response += `   💺 Available Seats: ${totalAvailable}/${totalSeats}\n`;
        response += `   📊 Utilization: ${utilization}%\n`;
        response += `   ✅ Status: ${totalAvailable > 0 ? 'Seats Available' : 'Limited/Full'}\n\n`;
      }

      response += `${this.emojis.guide} **What would you like to do?**\n`;
      response += `• Ask about a specific time slot\n`;
      response += `• Get comprehensive seat details\n`;
      response += `• Book a seat\n`;
      response += `• Or switch to another route`;
    }

    return response;
  }

  // Format comprehensive seat details
  async formatComprehensiveSeats(routeId, date = new Date()) {
    const route = await Route.findById(routeId).lean();
    if (!route) return `${this.emojis.error} Route not found!`;

    let response = `${this.emojis.seat} **COMPREHENSIVE SEAT REPORT**\n`;
    response += `**Route:** ${route.name}\n`;
    response += `**Date:** ${date.toLocaleDateString()}\n\n`;

    let totalRouteSeats = 0;
    let totalRouteAvailable = 0;

    for (const timeSlot of route.timeSlots) {
      response += `${this.emojis.time} **${timeSlot.time}**\n`;
      
      for (const vehicle of timeSlot.vehicles) {
        const bookedSeats = await SeatBooking.find({
          vehicle: vehicle._id,
          bookingDate: {
            $gte: new Date(date.setHours(0, 0, 0, 0)),
            $lt: new Date(date.setHours(23, 59, 59, 999))
          },
          status: 'booked'
        });

        const availableSeats = vehicle.totalSeats - bookedSeats.length;
        const utilization = ((bookedSeats.length / vehicle.totalSeats) * 100).toFixed(1);

        response += `   🚗 ${vehicle.vehicleNumber} (${vehicle.vehicleType})\n`;
        response += `      💺 Seats: ${availableSeats}/${vehicle.totalSeats} available\n`;
        response += `      📊 Utilization: ${utilization}%\n`;
        response += `      ✅ Status: ${availableSeats > 0 ? 'Available' : 'Full'}\n`;

        totalRouteSeats += vehicle.totalSeats;
        totalRouteAvailable += availableSeats;
      }
      response += '\n';
    }

    const routeUtilization = totalRouteSeats > 0 ? 
      ((totalRouteSeats - totalRouteAvailable) / totalRouteSeats * 100).toFixed(1) : 0;

    response += `📊 **ROUTE SUMMARY**\n`;
    response += `Total Vehicles: ${route.timeSlots.reduce((sum, ts) => sum + ts.vehicles.length, 0)}\n`;
    response += `Total Seats: ${totalRouteSeats}\n`;
    response += `Available Seats: ${totalRouteAvailable}\n`;
    response += `Overall Utilization: ${routeUtilization}%\n`;
    response += `Overall Status: ${totalRouteAvailable > 0 ? '✅ Seats Available' : '⚠️ All Vehicles Full'}\n\n`;

    response += `${this.emojis.guide} **Recommendations:**\n`;
    if (totalRouteAvailable > 0) {
      response += `• Book now to secure your seat\n`;
      response += `• Consider morning slots for better availability\n`;
    } else {
      response += `• Try alternative routes\n`;
      response += `• Check again tomorrow\n`;
      response += `• Contact admin for special arrangements\n`;
    }

    return response;
  }

  // Format time slots
  async formatTimeSlots(routeId) {
    const route = await Route.findById(routeId);
    if (!route) return `${this.emojis.error} Route not found!`;

    let response = `${this.emojis.time} **TIME SLOTS FOR ${route.name.toUpperCase()}**\n\n`;

    route.timeSlots.forEach((slot, index) => {
      response += `${index + 1}. **${slot.time}**\n`;
      response += `   🚗 Vehicles: ${slot.vehicles.length}\n`;
      response += `   💺 Total Seats: ${slot.vehicles.reduce((sum, v) => sum + v.totalSeats, 0)}\n\n`;
    });

    response += `${this.emojis.guide} **Next steps:**\n`;
    response += `• Ask about a specific time slot\n`;
    response += `• Check seat availability\n`;
    response += `• Or switch to another route`;
    
    return response;
  }

  // Format subroutes
  async formatSubroutes(routeId) {
    const route = await Route.findById(routeId);
    if (!route) return `${this.emojis.error} Route not found!`;

    let response = `${this.emojis.location} **SUBROUTES/STOPS FOR ${route.name.toUpperCase()}**\n\n`;

    route.subRoutes.forEach((subRoute, index) => {
      const isMain = subRoute.price === route.monthlyFare;
      response += `${index + 1}. **${subRoute.name}**\n`;
      response += `   💰 Price: Rs. ${subRoute.price}\n`;
      response += `   📍 Type: ${isMain ? '🌟 Main Stop' : 'Intermediate Stop'}\n\n`;
    });

    return response;
  }

  // Format vehicle information
  async formatVehicles(routeId, timeSlot = null) {
    const route = await Route.findById(routeId);
    if (!route) return `${this.emojis.error} Route not found!`;

    let response = `${this.emojis.vehicle} **VEHICLES**\n`;

    if (timeSlot) {
      const timeSlotData = route.timeSlots.find(ts => 
        ts.time.toLowerCase().includes(timeSlot.toLowerCase()) || 
        ts._id.toString() === timeSlot
      );

      if (!timeSlotData) {
        return `${this.emojis.error} **Time slot "${timeSlot}" not found!**\n\nAvailable slots:\n${
          route.timeSlots.map(ts => `• ${ts.time}`).join('\n')
        }`;
      }

      response += `**Time Slot:** ${timeSlotData.time}\n\n`;

      timeSlotData.vehicles.forEach((vehicle, index) => {
        response += `${index + 1}. **${vehicle.vehicleNumber}**\n`;
        response += `   🚌 Type: ${vehicle.vehicleType}\n`;
        response += `   💺 Total Seats: ${vehicle.totalSeats}\n`;
        response += `   ⚙️ Configuration: Standard\n\n`;
      });
    } else {
      response += `**Route:** ${route.name}\n\n`;
      
      let vehicleCount = 1;
      route.timeSlots.forEach(timeSlot => {
        response += `${this.emojis.time} **${timeSlot.time}**\n`;
        
        timeSlot.vehicles.forEach(vehicle => {
          response += `   ${vehicleCount}. ${vehicle.vehicleNumber} (${vehicle.vehicleType}) - ${vehicle.totalSeats} seats\n`;
          vehicleCount++;
        });
        response += '\n';
      });
    }

    response += `${this.emojis.guide} **What would you like to know?**\n`;
    response += `• Check seat availability for a specific vehicle\n`;
    response += `• Book a seat\n`;
    response += `• Or ask about another route`;

    return response;
  }

  // Format booking help
  formatBookingHelp() {
    return `${this.emojis.info} **BOOKING PROCESS**\n\n
1. **Monthly Booking:**
   • Register for a monthly pass via the app
   • Upload payment screenshot
   • Wait for admin approval (usually within 24 hours)
   • Once approved, you can book daily seats

2. **Daily Seat Booking:**
   • You must have an active monthly booking
   • Select your route
   • Choose a time slot
   • Select a vehicle
   • Pick an available seat
   • Confirm your booking

3. **Alternative Routes:**
   • You can book alternative routes 3 times per month
   • Your main route is set during monthly registration

4. **Booking Rules:**
   • Bookings open at 12:00 AM daily
   • You can cancel up to 30 minutes before departure
   • No-shows may affect future booking privileges

${this.emojis.guide} **Need help with a specific route?**\nSay "Tell me about [route name]" to get started!`;
  }

  // Format error response
  formatError(message, suggestions = []) {
    let response = `${this.emojis.error} **Oops!** ${message}\n\n`;
    
    if (suggestions.length > 0) {
      response += `${this.emojis.info} **Try asking:**\n`;
      suggestions.forEach((suggestion, index) => {
        response += `${index + 1}. "${suggestion}"\n`;
      });
    }

    response += `\n${this.emojis.guide} **Or try:**\n`;
    response += `• "Show me all routes"\n`;
    response += `• "What can you help me with?"\n`;
    response += `• "Switch to a different route"`;

    return response;
  }

  // Format clarification question
  formatClarification(missingInfo, options = []) {
    let response = `${this.emojis.info} **I need a bit more information...**\n\n`;
    
    if (missingInfo === 'route') {
      response += `**Which route are you asking about?**\n`;
      if (options.length > 0) {
        response += `\nAvailable routes:\n`;
        options.forEach((route, index) => {
          response += `${index + 1}. ${route}\n`;
        });
      }
    } else if (missingInfo === 'timeSlot') {
      response += `**Which time slot are you interested in?**\n`;
      if (options.length > 0) {
        response += `\nAvailable time slots:\n`;
        options.forEach((slot, index) => {
          response += `${index + 1}. ${slot}\n`;
        });
      }
    } else if (missingInfo === 'vehicle') {
      response += `**Which vehicle would you like to check?**\n`;
      if (options.length > 0) {
        response += `\nAvailable vehicles:\n`;
        options.forEach((vehicle, index) => {
          response += `${index + 1}. ${vehicle}\n`;
        });
      }
    }

    response += `\n${this.emojis.guide} **You can say something like:**\n`;
    response += `• "Show me the 2 PM slot"\n`;
    response += `• "Tell me about vehicle Bus 101"\n`;
    response += `• Or "Switch to [different route]"`;
    
    return response;
  }
}

module.exports = new ResponseGenerator();