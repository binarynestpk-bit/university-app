// backend/src/controllers/chatbotController.js - UPDATED VERSION

const IntentRecognizer = require('../utils/intentRecognizer');
const ResponseGenerator = require('../utils/responseGenerator');
const ChatContext = require('../models/ChatContext');
const IntentLog = require('../models/IntentLog');
const Route = require('../models/Route');
const User = require('../models/User');
const SeatBooking = require('../models/SeatBooking');

class ChatbotController {
  // Process user message
  async processMessage(req, res) {
    try {
      const { message, context: clientContext } = req.body;
      const userId = req.user.id;

      if (!message || message.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Message cannot be empty'
        });
      }

      // Get or create chat context
      let context = await ChatContext.findOne({ userId });
      if (!context) {
        context = new ChatContext({ userId });
      }

      // Merge with client context if provided
      if (clientContext) {
        if (clientContext.currentRouteName) {
          context.currentRouteName = clientContext.currentRouteName;
        }
        if (clientContext.conversationState) {
          context.conversationState = clientContext.conversationState;
        }
      }

      // NEW: Check for specific query types
      const lowerMessage = message.toLowerCase();
      
      // 1. Check for "all routes" query
      if (IntentRecognizer.isAllRoutesQuery(message)) {
        const routes = await Route.find({}).populate('timeSlots.vehicles');
        const response = await ResponseGenerator.formatAllRoutes(routes);
        
        return res.json({
          success: true,
          data: {
            response,
            context,
            intent: 'list_routes'
          }
        });
      }
      
      // 2. Check for specific time slot query (e.g., "2pm slot")
      if (IntentRecognizer.isTimeSlotQuery(message)) {
        return await this.handleTimeSlotAvailability(message, context, res);
      }
      
      // 3. Check for registration/booking process query
      if (IntentRecognizer.isRegistrationQuery(message)) {
        const response = await ResponseGenerator.formatBookingHelp();
        
        return res.json({
          success: true,
          data: {
            response,
            context,
            intent: 'booking_help'
          }
        });
      }

      // Detect intent with context awareness
      const intentResult = await IntentRecognizer.detectIntent(message, {
        currentRoute: context.currentRouteName,
        conversationState: context.conversationState
      });
      
      const { intent, confidence, entities } = intentResult;

      // Log the intent
      await IntentLog.create({
        userId,
        userMessage: message,
        detectedIntent: intent,
        extractedEntities: entities,
        confidence,
        contextId: context._id
      });

      // Extract route from message if present
      let detectedRoute = null;
      if (entities.route) {
        detectedRoute = await Route.findOne({
          name: { $regex: new RegExp(entities.route, 'i') }
        }).populate('timeSlots.vehicles');
      }

      // ENHANCED: Handle route switching
      const isSwitchIntent = intent === 'route_switch';
      const hasSwitchKeywords = lowerMessage.match(/(switch to|change to|how about|what about|tell me about)\s+(\w+)/i);
      
      if ((isSwitchIntent || hasSwitchKeywords) && detectedRoute) {
        // User is switching to a different route
        const currentRouteLower = context.currentRouteName ? context.currentRouteName.toLowerCase() : '';
        const newRouteLower = detectedRoute.name.toLowerCase();
        
        // Only update context if it's actually a different route
        if (!context.currentRouteName || currentRouteLower !== newRouteLower) {
          context.currentRoute = detectedRoute._id;
          context.currentRouteName = detectedRoute.name;
          context.conversationState = 'idle'; // Reset conversation state
          context.lastQuery = {
            intent: 'route_switch',
            routeName: detectedRoute.name,
            timestamp: new Date()
          };
          await context.save();
        }
        
        // Get comprehensive route information
        const routeInfo = await ResponseGenerator.formatCompleteRouteInfo(detectedRoute);
        
        return res.json({
          success: true,
          data: {
            response: routeInfo,
            context: context,
            intent: 'route_switch',
            routeInfo: {
              name: detectedRoute.name,
              from: detectedRoute.startingPoint,
              to: detectedRoute.mainDestination,
              monthlyFare: detectedRoute.monthlyFare
            }
          }
        });
      }

      // Update context with detected route if found
      if (detectedRoute && !entities.route) {
        context.currentRoute = detectedRoute._id;
        context.currentRouteName = detectedRoute.name;
      }

      // Process based on intent and conversation state
      let response;
      let shouldUpdateFrequentlyAsked = false;

      // Handle based on conversation state if in middle of flow
      if (context.conversationState !== 'idle' && !entities.route && !entities.timeSlot && !entities.vehicle) {
        response = await this.handleConversationFlow(message, context, intent);
      } else {
        // Handle regular intents
        switch (intent) {
          case 'greeting':
            response = await this.handleGreeting(context);
            break;
          
          case 'list_routes':
            response = await this.handleListRoutes();
            break;
          
          case 'list_routes_with_seats':
            response = await this.handleListRoutesWithSeats();
            break;
          
          case 'route_info':
            response = await this.handleRouteInfo(entities, context, message);
            shouldUpdateFrequentlyAsked = true;
            break;
          
          case 'route_exists':
            response = await this.handleRouteExists(entities);
            shouldUpdateFrequentlyAsked = true;
            break;
          
          case 'fare_all':
            response = await this.handleFareAll();
            break;
          
          case 'fare_specific':
            response = await this.handleFareSpecific(entities, context);
            shouldUpdateFrequentlyAsked = true;
            break;
          
          case 'seat_availability':
          case 'seat_availability_specific':
            response = await this.handleSeatAvailability(entities, context, message);
            shouldUpdateFrequentlyAsked = true;
            break;
          
          case 'route_comprehensive_seats':
            response = await this.handleComprehensiveSeats(entities, context);
            shouldUpdateFrequentlyAsked = true;
            break;
          
          case 'time_slots':
            response = await this.handleTimeSlots(entities, context);
            shouldUpdateFrequentlyAsked = true;
            break;
          
          case 'vehicles':
            response = await this.handleVehicles(entities, context);
            shouldUpdateFrequentlyAsked = true;
            break;
          
          case 'subroutes':
            response = await this.handleSubroutes(entities, context);
            shouldUpdateFrequentlyAsked = true;
            break;
          
          case 'booking_help':
            response = ResponseGenerator.formatBookingHelp();
            break;
          
          case 'help':
            response = await this.handleHelp(context);
            break;
          
          case 'route_switch':
            // If route switch intent but no route detected, show all routes
            if (!entities.route && !context.currentRouteName) {
              response = await this.handleRouteSwitch(entities, context);
            } else {
              response = await this.handleRouteInfo(entities, context, message);
            }
            shouldUpdateFrequentlyAsked = true;
            break;
          
          case 'complete_route_info':
            response = await this.handleCompleteRouteInfo(entities, context);
            shouldUpdateFrequentlyAsked = true;
            break;
          
          default:
            response = await this.handleUnknown(message, context);
        }
      }

      // Update frequently asked routes if route was mentioned
      if (shouldUpdateFrequentlyAsked && (entities.route || context.currentRouteName)) {
        const routeName = entities.route || context.currentRouteName;
        await this.updateFrequentlyAskedRoutes(context, routeName);
      }

      // Save updated context
      context.lastQuery = {
        intent,
        routeName: entities.route || context.currentRouteName,
        timeSlot: entities.timeSlot,
        vehicleNumber: entities.vehicle,
        timestamp: new Date()
      };
      
      if (entities.route && (!context.currentRouteName || 
          entities.route.toLowerCase() !== context.currentRouteName.toLowerCase())) {
        context.currentRouteName = entities.route;
      }
      
      context.updatedAt = new Date();
      await context.save();

      // Prepare seat stats if available
      let seatStats = null;
      if (intent.includes('seat') && (entities.route || context.currentRouteName)) {
        seatStats = await this.getSeatStats(entities, context);
      }

      res.json({
        success: true,
        data: {
          response,
          context: context,
          intent,
          seatStats,
          currentRoute: context.currentRouteName
        }
      });

    } catch (error) {
      console.error('Chatbot error:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred while processing your message',
        error: error.message
      });
    }
  }

  // NEW: Handle specific time slot availability across all routes
  async handleTimeSlotAvailability(message, context, res) {
    try {
      const lowerMessage = message.toLowerCase();
      
      // Extract time from message
      let targetTime = null;
      const timeMatch = lowerMessage.match(/\b(\d{1,2}[:.]?\d{0,2}\s*(?:am|pm|AM|PM)?)\b/);
      if (timeMatch) {
        targetTime = IntentRecognizer.normalizeTimeSlot(timeMatch[0]);
      }
      
      if (!targetTime) {
        // Check for time phrases
        if (lowerMessage.includes('morning')) targetTime = 'Morning';
        else if (lowerMessage.includes('afternoon')) targetTime = 'Afternoon';
        else if (lowerMessage.includes('evening')) targetTime = 'Evening';
        else if (lowerMessage.includes('2pm') || lowerMessage.includes('2 pm')) targetTime = '2:00 PM';
        else if (lowerMessage.includes('9am') || lowerMessage.includes('9 am')) targetTime = '9:00 AM';
      }
      
      if (!targetTime) {
        return res.json({
          success: true,
          data: {
            response: "⏰ **Please specify which time slot you're looking for.**\n\nExamples:\n• \"Is there a slot of 2pm?\"\n• \"Morning slots availability\"\n• \"Routes with 9:00 AM departure\"",
            context,
            intent: 'time_slots'
          }
        });
      }
      
      // Find all routes that have this time slot
      const routes = await Route.find({}).populate('timeSlots.vehicles');
      const matchingRoutes = [];
      const today = new Date();
      
      for (const route of routes) {
        for (const timeSlot of route.timeSlots) {
          if (timeSlot.time.toLowerCase().includes(targetTime.toLowerCase()) || 
              targetTime.toLowerCase().includes(timeSlot.time.toLowerCase())) {
            
            // Calculate seat availability
            let totalSeats = 0;
            let availableSeats = 0;
            
            for (const vehicle of timeSlot.vehicles) {
              totalSeats += vehicle.totalSeats;
              
              const bookedSeats = await SeatBooking.countDocuments({
                vehicle: vehicle._id,
                bookingDate: {
                  $gte: new Date(today.setHours(0, 0, 0, 0)),
                  $lt: new Date(today.setHours(23, 59, 59, 999))
                },
                status: 'booked'
              });
              
              availableSeats += (vehicle.totalSeats - bookedSeats);
            }
            
            matchingRoutes.push({
              route,
              timeSlot: timeSlot.time,
              totalSeats,
              availableSeats,
              vehicleCount: timeSlot.vehicles.length
            });
            break; // Only add once per route
          }
        }
      }
      
      if (matchingRoutes.length === 0) {
        return res.json({
          success: true,
          data: {
            response: `❌ **No routes found with time slot "${targetTime}".**\n\n**Available time slots across all routes:**\n\n${
              routes.map(r => 
                `**${r.name}:** ${r.timeSlots.map(ts => ts.time).join(', ')}`
              ).join('\n')
            }\n\n**Try asking:**\n• "Show me all time slots for Saddar route"\n• "What routes have morning slots?"`,
            context,
            intent: 'time_slots'
          }
        });
      }
      
      // Build response
      let response = `⏰ **ROUTES WITH ${targetTime.toUpperCase()} TIME SLOT**\n\n`;
      
      matchingRoutes.forEach((item, index) => {
        response += `${index + 1}. **${item.route.name}**\n`;
        response += `   📍 ${item.route.startingPoint} → ${item.route.mainDestination}\n`;
        response += `   ⏰ **Time:** ${item.timeSlot}\n`;
        response += `   🚗 **Vehicles:** ${item.vehicleCount}\n`;
        response += `   💺 **Seats:** ${item.availableSeats}/${item.totalSeats} available\n`;
        response += `   📊 **Status:** ${item.availableSeats > 0 ? '✅ Seats Available' : '❌ Fully Booked'}\n`;
        response += `   💰 **Monthly Fare:** Rs. ${item.route.monthlyFare}\n\n`;
      });
      
      response += `**💡 What would you like to do next?**\n`;
      response += `• Ask about a specific route: "Tell me about ${matchingRoutes[0].route.name}"\n`;
      response += `• Check seat availability: "Seats for ${matchingRoutes[0].route.name}"\n`;
      response += `• See complete information: "Tell me everything about ${matchingRoutes[0].route.name}"\n`;
      response += `• Switch to a different route\n`;
      response += `• Or ask about another time slot`;
      
      return res.json({
        success: true,
        data: {
          response,
          context,
          intent: 'time_slots',
          seatStats: {
            totalRoutes: matchingRoutes.length,
            totalAvailableSeats: matchingRoutes.reduce((sum, r) => sum + r.availableSeats, 0),
            totalSeats: matchingRoutes.reduce((sum, r) => sum + r.totalSeats, 0),
            timeSlot: targetTime
          }
        }
      });
      
    } catch (error) {
      console.error('Time slot availability error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to check time slot availability'
      });
    }
  }

  // NEW: Handle list routes with seat availability
  async handleListRoutesWithSeats() {
    const routes = await Route.find({}).populate('timeSlots.vehicles');
    const today = new Date();
    
    let response = `🚌 **ALL ROUTES WITH SEAT AVAILABILITY**\n\n`;
    
    for (const route of routes) {
      // Calculate total seat availability for the route
      let routeTotalSeats = 0;
      let routeAvailableSeats = 0;
      
      for (const timeSlot of route.timeSlots) {
        for (const vehicle of timeSlot.vehicles) {
          routeTotalSeats += vehicle.totalSeats;
          
          const bookedSeats = await SeatBooking.countDocuments({
            vehicle: vehicle._id,
            bookingDate: {
              $gte: new Date(today.setHours(0, 0, 0, 0)),
              $lt: new Date(today.setHours(23, 59, 59, 999))
            },
            status: 'booked'
          });
          
          routeAvailableSeats += (vehicle.totalSeats - bookedSeats);
        }
      }
      
      const utilization = routeTotalSeats > 0 ? 
        ((routeTotalSeats - routeAvailableSeats) / routeTotalSeats * 100).toFixed(1) : 0;
      
      response += `**${route.name}**\n`;
      response += `📍 ${route.startingPoint} → ${route.mainDestination}\n`;
      response += `💺 **Seats:** ${routeAvailableSeats}/${routeTotalSeats} available (${utilization}% booked)\n`;
      response += `⏰ **Time Slots:** ${route.timeSlots.length}\n`;
      response += `🚗 **Vehicles:** ${route.timeSlots.reduce((sum, ts) => sum + ts.vehicles.length, 0)}\n`;
      response += `💰 **Monthly Fare:** Rs. ${route.monthlyFare}\n\n`;
    }
    
    response += `**📊 Quick Stats:**\n`;
    response += `• Total Routes: ${routes.length}\n`;
    response += `• Morning Slots: ${routes.reduce((sum, r) => sum + r.timeSlots.filter(ts => ts.time.includes('AM')).length, 0)}\n`;
    response += `• Afternoon Slots: ${routes.reduce((sum, r) => sum + r.timeSlots.filter(ts => ts.time.includes('PM')).length, 0)}\n`;
    response += `• Total Vehicles: ${routes.reduce((sum, r) => sum + r.timeSlots.reduce((tSum, ts) => tSum + ts.vehicles.length, 0), 0)}\n\n`;
    
    response += `**💡 How to use:**\n`;
    response += `• Say "Tell me about [route name]" for detailed information\n`;
    response += `• "Switch to [route name]" to focus on that route\n`;
    response += `• "Seat availability for [route]" for specific seat check\n`;
    response += `• Or ask about any route above`;
    
    return response;
  }

  // Improved entity extraction with context awareness
  async extractEntitiesWithContext(message, context) {
    const entities = await IntentRecognizer.extractEntities(message);
    
    // Enhance with context if missing
    if (!entities.route && context.currentRouteName) {
      // Check if message might be referring to current route
      const lowerMessage = message.toLowerCase();
      const routeKeywords = ['this route', 'current route', 'same route', 'it'];
      
      if (routeKeywords.some(keyword => lowerMessage.includes(keyword))) {
        entities.route = context.currentRouteName;
        
        // Try to find route ID
        const route = await Route.findOne({ 
          name: { $regex: new RegExp(context.currentRouteName, 'i') } 
        });
        if (route) {
          entities.routeId = route._id;
        }
      }
    }
    
    // If we have a time slot in context, use it for incomplete queries
    if (!entities.timeSlot && context.lastQuery?.timeSlot) {
      const lowerMessage = message.toLowerCase();
      if (lowerMessage.includes('same time') || lowerMessage.includes('that time') || 
          lowerMessage.includes('previous time')) {
        entities.timeSlot = context.lastQuery.timeSlot;
      }
    }
    
    return entities;
  }

  // Improved: Handle conversation flow for multi-step interactions
  async handleConversationFlow(message, context, currentIntent) {
    const lowerMessage = message.toLowerCase();
    
    switch (context.conversationState) {
      case 'awaiting_time_slot':
        // User needs to select a time slot for seat availability
        const route = await Route.findById(context.currentRoute);
        
        if (!route) {
          context.conversationState = 'idle';
          await context.save();
          return "❌ I lost track of which route we were discussing. Please mention the route name again.";
        }
        
        // Check if message contains a valid time slot
        let timeSlot = null;
        for (const slot of route.timeSlots) {
          if (lowerMessage.includes(slot.time.toLowerCase()) || 
              lowerMessage.match(new RegExp(`\\b${slot.time.split(':')[0]}\\b`, 'i'))) {
            timeSlot = slot.time;
            break;
          }
        }
        
        // Also check for generic time references
        if (!timeSlot) {
          if (lowerMessage.includes('morning')) {
            // Find first morning slot
            const morningSlot = route.timeSlots.find(s => 
              s.time.includes('AM') || parseInt(s.time.split(':')[0]) < 12
            );
            timeSlot = morningSlot?.time || route.timeSlots[0]?.time;
          } else if (lowerMessage.includes('afternoon') || lowerMessage.includes('evening')) {
            // Find afternoon/evening slot
            const afternoonSlot = route.timeSlots.find(s => 
              s.time.includes('PM') || parseInt(s.time.split(':')[0]) >= 12
            );
            timeSlot = afternoonSlot?.time || route.timeSlots[route.timeSlots.length - 1]?.time;
          }
        }
        
        if (timeSlot) {
          // Update context with selected time slot
          context.conversationState = 'awaiting_vehicle';
          context.lastQuery.timeSlot = timeSlot;
          await context.save();
          
          // Get vehicles for this time slot
          const slotData = route.timeSlots.find(ts => ts.time === timeSlot);
          if (slotData && slotData.vehicles.length > 0) {
            let response = `⏰ **Time slot "${timeSlot}" selected!**\n\n`;
            response += `**Available vehicles for ${route.name} at ${timeSlot}:**\n\n`;
            
            slotData.vehicles.forEach((vehicle, index) => {
              response += `${index + 1}. **${vehicle.vehicleNumber}** (${vehicle.vehicleType})\n`;
              response += `   • Total Seats: ${vehicle.totalSeats}\n`;
              response += `   • Type: ${vehicle.vehicleType}\n\n`;
            });
            
            response += `**What would you like to do?**\n`;
            response += `• Select a vehicle by saying: "Vehicle [number or name]"\n`;
            response += `• Check seat availability: "Show me seats for [vehicle]"\n`;
            response += `• Go back: "Choose different time slot"\n`;
            
            return response;
          } else {
            return `⚠️ No vehicles found for time slot "${timeSlot}".\n\n**Available time slots for ${route.name}:**\n${route.timeSlots.map(ts => `• ${ts.time}`).join('\n')}`;
          }
        } else {
          // Show available time slots
          return `⏰ **Please select a time slot for ${route.name}:**\n\n${route.timeSlots.map((ts, i) => `${i+1}. ${ts.time}`).join('\n')}\n\n**You can say:**\n• "9:00 AM"\n• "Morning slot"\n• "Afternoon"\n• Or just type the time`;
        }
        
      case 'awaiting_vehicle':
        // User needs to select a vehicle
        const currentRoute = await Route.findById(context.currentRoute);
        if (!currentRoute) {
          context.conversationState = 'idle';
          await context.save();
          return "❌ I lost track of which route we were discussing. Please start over.";
        }
        
        // Find the time slot from context
        const timeSlotFromContext = context.lastQuery?.timeSlot;
        if (!timeSlotFromContext) {
          context.conversationState = 'idle';
          await context.save();
          return "❌ I lost track of the time slot. Please start over.";
        }
        
        // Get vehicles for this time slot
        const timeSlotObj = currentRoute.timeSlots.find(ts => ts.time === timeSlotFromContext);
        if (!timeSlotObj) {
          context.conversationState = 'idle';
          await context.save();
          return `❌ Time slot "${timeSlotFromContext}" not found. Please try again.`;
        }
        
        // Check if message contains a vehicle number
        let selectedVehicle = null;
        for (const vehicle of timeSlotObj.vehicles) {
          if (lowerMessage.includes(vehicle.vehicleNumber.toLowerCase()) ||
              (message.match(/\b\d+\b/) && parseInt(message.match(/\b\d+\b/)[0]) === parseInt(vehicle.vehicleNumber.replace(/\D/g, '')))) {
            selectedVehicle = vehicle;
            break;
          }
        }
        
        if (selectedVehicle) {
          // Update context with selected vehicle
          context.conversationState = 'awaiting_seat_confirmation';
          context.lastQuery.vehicleNumber = selectedVehicle.vehicleNumber;
          await context.save();
          
          // Get seat availability for this vehicle
          const today = new Date();
          const bookedSeats = await SeatBooking.countDocuments({
            vehicle: selectedVehicle._id,
            bookingDate: {
              $gte: new Date(today.setHours(0, 0, 0, 0)),
              $lt: new Date(today.setHours(23, 59, 59, 999))
            },
            status: 'booked'
          });
          
          const availableSeats = selectedVehicle.totalSeats - bookedSeats;
          
          let response = `🚗 **Vehicle ${selectedVehicle.vehicleNumber} selected!**\n\n`;
          response += `**Vehicle Details:**\n`;
          response += `• Type: ${selectedVehicle.vehicleType}\n`;
          response += `• Total Seats: ${selectedVehicle.totalSeats}\n`;
          response += `• Available Seats: ${availableSeats}\n`;
          response += `• Booked Seats: ${bookedSeats}\n`;
          response += `• Time Slot: ${timeSlotFromContext}\n`;
          response += `• Route: ${currentRoute.name}\n\n`;
          
          response += `**Would you like to:**\n`;
          response += `1. Book a seat (${availableSeats > 0 ? '✅ Available' : '❌ Full'})\n`;
          response += `2. Check detailed seat map\n`;
          response += `3. Go back to vehicle list\n`;
          response += `4. Start over with different route\n\n`;
          response += `**Just type the number (1, 2, 3, or 4) or ask your question.**`;
          
          return response;
        } else {
          // Show available vehicles again
          let response = `**Available vehicles for ${timeSlotFromContext}:**\n\n`;
          timeSlotObj.vehicles.forEach((vehicle, index) => {
            response += `${index + 1}. **${vehicle.vehicleNumber}** (${vehicle.vehicleType}) - ${vehicle.totalSeats} seats\n`;
          });
          
          response += `\n**Please select a vehicle by:**\n`;
          response += `• Saying the vehicle number: "${timeSlotObj.vehicles[0]?.vehicleNumber}"\n`;
          response += `• Or the list number: "1"\n`;
          response += `• Or ask: "Show me seats for [vehicle]"`;
          
          return response;
        }
        
      case 'awaiting_seat_confirmation':
      case 'awaiting_route_confirmation':
        // Handle confirmation responses
        if (lowerMessage.includes('yes') || lowerMessage.includes('confirm') || lowerMessage.includes('book') || lowerMessage.match(/^[123]$/)) {
          const selectedOption = lowerMessage.match(/^[123]$/) ? parseInt(lowerMessage.match(/^[123]$/)[0]) : 1;
          
          if (selectedOption === 1) {
            // User wants to book a seat
            context.conversationState = 'idle';
            await context.save();
            
            // Check if we have all required info
            if (context.lastQuery?.routeName && context.lastQuery?.timeSlot && context.lastQuery?.vehicleNumber) {
              return `✅ **Ready to book a seat!**\n\n**Booking Details:**\n• Route: ${context.lastQuery.routeName}\n• Time: ${context.lastQuery.timeSlot}\n• Vehicle: ${context.lastQuery.vehicleNumber}\n\n**Please proceed to the booking section in the app or say:**\n• "Help me book"\n• "Booking process"\n• Or ask about something else`;
            } else {
              return `✅ **Ready to help you book!**\n\nPlease visit the booking section in the app or ask me about the booking process.`;
            }
          } else if (selectedOption === 2) {
            // User wants detailed seat map
            return `📋 **Detailed seat map is available in the booking section of the app.**\n\nYou can:\n• View all available seats\n• Select your preferred seat\n• See booked seats\n\n**Say "booking help" for more information.**`;
          } else if (selectedOption === 3) {
            // Go back
            context.conversationState = 'awaiting_vehicle';
            await context.save();
            return `🔄 Going back to vehicle selection. Please choose a vehicle.`;
          } else {
            context.conversationState = 'idle';
            await context.save();
            return `✅ Great! Let me process that for you. What would you like to do next?`;
          }
        } else if (lowerMessage.includes('no') || lowerMessage.includes('cancel') || lowerMessage.includes('back')) {
          context.conversationState = 'idle';
          await context.save();
          return `🔄 Operation cancelled. What would you like to do next?\n\n• Ask about another route\n• Check seat availability\n• Get fare information`;
        } else {
          return `**Please confirm your choice:**\n• Type "yes" to proceed\n• Type "no" to cancel\n• Or type 1, 2, 3, or 4 for the options above`;
        }
        
      default:
        // If we get here, something went wrong - reset to idle
        context.conversationState = 'idle';
        await context.save();
        return "I'm ready to help! What would you like to know about?";
    }
  }

  // NEW: Handle complete route information
  async handleCompleteRouteInfo(entities, context) {
    if (!entities.route && !context.currentRouteName) {
      const routes = await Route.find({}, 'name');
      const routeNames = routes.map(r => r.name);
      
      return `📋 **Please specify which route you'd like complete information for:**\n\n${routeNames.map((r, i) => `${i+1}. ${r}`).join('\n')}\n\nOr ask: "Tell me everything about [route name]"`;
    }

    const routeName = entities.route || context.currentRouteName;
    const route = await Route.findOne({ 
      name: { $regex: new RegExp(routeName, 'i') } 
    }).populate('timeSlots.vehicles');

    if (!route) {
      return ResponseGenerator.formatError(
        `I couldn't find a route named "${routeName}".`,
        ["Show me all routes", "What routes are available?"]
      );
    }

    // Update context
    context.currentRoute = route._id;
    context.currentRouteName = route.name;
    context.conversationState = 'idle';
    await context.save();

    // Use the ResponseGenerator for complete info
    return await ResponseGenerator.formatCompleteRouteInfo(route);
  }

  // Improved: Handle route switching
  async handleRouteSwitch(entities, context) {
    // If no route specified, ask which route to switch to
    if (!entities.route && !context.currentRouteName) {
      const routes = await Route.find({}, 'name startingPoint mainDestination monthlyFare');
      
      let response = `🔄 **Which route would you like to switch to?**\n\n`;
      response += routes.map((r, i) => 
        `${i+1}. **${r.name}** (${r.startingPoint} → ${r.mainDestination}) - Rs. ${r.monthlyFare}`
      ).join('\n');
      response += `\n\n**You can say:**\n• "Switch to [route name]"\n• "Tell me about [route name]"\n• Or click a route from above`;
      
      return response;
    }

    const routeName = entities.route || context.currentRouteName;
    const route = await Route.findOne({ 
      name: { $regex: new RegExp(routeName, 'i') } 
    });

    if (!route) {
      return ResponseGenerator.formatError(
        `Route "${routeName}" not found.`,
        ["Show me all available routes", "What routes do you have?"]
      );
    }

    // Update context with new route
    context.currentRoute = route._id;
    context.currentRouteName = route.name;
    context.conversationState = 'idle';
    context.lastQuery = {
      intent: 'route_switch',
      routeName: route.name,
      timestamp: new Date()
    };
    await context.save();

    // Generate a brief route info for context
    const briefInfo = await ResponseGenerator.formatRouteInfo(route, false);
    
    return `✅ **Switched to ${route.name} route!**\n\n${briefInfo}\n\n**What would you like to know about this route?**\n\n• Seat availability\n• Time slots\n• Vehicles\n• Fares\n• Complete information\n• Or ask: "Tell me everything about ${route.name}"`;
  }

  // UPDATED: Intent handlers with better context management
  async handleGreeting(context) {
    const user = await User.findById(context.userId);
    const userName = user?.name ? `, ${user.name.split(' ')[0]}` : '';
    
    // If user has a recent route in context, mention it
    let routeMention = '';
    if (context.currentRouteName) {
      routeMention = ` I see you were asking about the **${context.currentRouteName}** route.`;
    }
    
    const greetings = [
      `👋 Hello${userName}! I'm your transport assistant!${routeMention} How can I help you today?`,
      `Hi there${userName}! 😊 Ready to help with routes, seats, and fares!${routeMention} What would you like to know?`,
      `Hey${userName}! I'm here to help you with all your transport needs!${routeMention} You can ask me about:\n• Routes and subroutes\n• Seat availability\n• Fares\n• Time schedules\n• Booking process`
    ];
    
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  async handleListRoutes() {
    const routes = await Route.find({});
    return ResponseGenerator.formatAllRoutes(routes);
  }

  // Improved: Handle route information
  async handleRouteInfo(entities, context, message) {
    // If no route specified, ask which route
    if (!entities.route && !context.currentRouteName) {
      const routes = await Route.find({}, 'name startingPoint mainDestination monthlyFare');
      
      let response = `📍 **Which route would you like information about?**\n\n`;
      response += routes.map((r, i) => 
        `${i+1}. **${r.name}**\n   📍 ${r.startingPoint} → ${r.mainDestination}\n   💰 Rs. ${r.monthlyFare}\n`
      ).join('\n');
      response += `\n**You can say:**\n• "Tell me about [route name]"\n• "Show me information for [route name]"\n• Or just click on a route from the list above`;
      
      return response;
    }

    const routeName = entities.route || context.currentRouteName;
    const route = await Route.findOne({ 
      name: { $regex: new RegExp(routeName, 'i') } 
    });

    if (!route) {
      return ResponseGenerator.formatError(
        `I couldn't find a route named "${routeName}".`,
        [
          "Show me all routes",
          "Is there a route for Saddar?",
          "Tell me about available routes"
        ]
      );
    }

    // Check if this is a switch request
    const lowerMessage = message.toLowerCase();
    const isSwitchRequest = lowerMessage.includes('switch') || 
                           lowerMessage.includes('change') || 
                           lowerMessage.includes('how about') || 
                           lowerMessage.includes('what about');
    
    // Update context with this route
    context.currentRoute = route._id;
    context.currentRouteName = route.name;
    context.conversationState = 'idle';
    context.lastQuery = {
      intent: isSwitchRequest ? 'route_switch' : 'route_info',
      routeName: route.name,
      timestamp: new Date()
    };
    await context.save();

    // Generate detailed route info
    const routeInfo = await ResponseGenerator.formatRouteInfo(route, true);
    
    if (isSwitchRequest) {
      return `✅ **Switched to ${route.name} route!**\n\n${routeInfo}`;
    }
    
    return routeInfo;
  }

  // UPDATED: Handle route exists check
  async handleRouteExists(entities) {
    if (!entities.route) {
      return `❓ **Which route are you looking for?**\n\nPlease specify a route name, for example:\n• "Is there a Saddar route?"\n• "Do you have Gulberg route?"`;
    }

    const route = await Route.findOne({ 
      name: { $regex: new RegExp(entities.route, 'i') } 
    });

    if (route) {
      return `✅ **Yes, we have the ${route.name} route!**\n\n📍 ${route.startingPoint} → ${route.mainDestination}\n💰 Monthly Fare: Rs. ${route.monthlyFare}\n\nWould you like to know more about this route?`;
    } else {
      // Try to find similar routes
      const allRoutes = await Route.find({}, 'name startingPoint mainDestination');
      const similarRoutes = allRoutes.filter(r => 
        r.name.toLowerCase().includes(entities.route.toLowerCase()) ||
        entities.route.toLowerCase().includes(r.name.toLowerCase())
      );

      if (similarRoutes.length > 0) {
        return `❌ **We don't have a route named "${entities.route}".**\n\n**Similar routes we do have:**\n\n${similarRoutes.map(r => 
          `• **${r.name}** (${r.startingPoint} → ${r.mainDestination})`
        ).join('\n')}\n\nWould you like information about any of these routes?`;
      } else {
        return `❌ **We don't have a route named "${entities.route}".**\n\n**Available routes:**\n${allRoutes.map(r => `• ${r.name}`).join('\n')}\n\nWould you like information about any of these routes?`;
      }
    }
  }

  async handleFareAll() {
    const routes = await Route.find({});
    return ResponseGenerator.formatFareInfo(routes);
  }

  async handleFareSpecific(entities, context) {
    if (!entities.route && !context.currentRouteName) {
      const routes = await Route.find({}, 'name');
      const routeNames = routes.map(r => r.name);
      
      return `💰 **Which route's fare would you like to see?**\n\n${routeNames.map((r, i) => `${i+1}. ${r}`).join('\n')}\n\nOr ask: "What's the fare for [route name]?"`;
    }

    const routeName = entities.route || context.currentRouteName;
    const route = await Route.findOne({ 
      name: { $regex: new RegExp(routeName, 'i') } 
    });

    if (!route) {
      return ResponseGenerator.formatError(
        `I couldn't find a route named "${routeName}".`,
        ["Show me fares for all routes", "What routes are available?"]
      );
    }

    // Update context
    context.currentRoute = route._id;
    context.currentRouteName = route.name;
    await context.save();

    // Get all routes for comparison
    const allRoutes = await Route.find({});
    return ResponseGenerator.formatFareInfo(allRoutes, route.name);
  }

  // Improved: Handle seat availability
  async handleSeatAvailability(entities, context, message) {
    // Check if we have enough information
    if (!entities.route && !context.currentRouteName) {
      const routes = await Route.find({}, 'name startingPoint mainDestination monthlyFare');
      
      let response = `💺 **Which route's seat availability would you like to check?**\n\n`;
      response += routes.map((r, i) => 
        `${i+1}. **${r.name}** (${r.startingPoint} → ${r.mainDestination})`
      ).join('\n');
      response += `\n\n**You can say:**\n• "Seats available for [route name]"\n• "Check seats for [route]"\n• Or just click on a route from above`;
      
      return response;
    }

    const routeName = entities.route || context.currentRouteName;
    const route = await Route.findOne({ 
      name: { $regex: new RegExp(routeName, 'i') } 
    });

    if (!route) {
      return ResponseGenerator.formatError(
        `I couldn't find a route named "${routeName}".`,
        [
          `Show me seat availability for a different route`,
          `What routes are available?`,
          `Tell me about ${routeName} route`
        ]
      );
    }

    // Update context with this route
    context.currentRoute = route._id;
    context.currentRouteName = route.name;
    
    // Check if specific time slot or vehicle was mentioned
    const lowerMessage = message.toLowerCase();
    const hasTimeSlot = entities.timeSlot || lowerMessage.match(/\b(\d{1,2}[:.]?\d{0,2}\s*(?:am|pm|AM|PM)?)\b|\b(morning|afternoon|evening|noon)\b/i);
    const hasVehicle = entities.vehicle || lowerMessage.match(/\b([A-Z0-9\-]+)\b/i);
    
    if (hasTimeSlot && hasVehicle) {
      // User provided both time slot and vehicle - show specific seat availability
      context.conversationState = 'idle';
      await context.save();
      
      return await ResponseGenerator.formatSeatAvailability(
        route._id, 
        entities.timeSlot, 
        entities.vehicle
      );
    } else if (hasTimeSlot && !hasVehicle) {
      // User provided time slot but not vehicle
      context.conversationState = 'awaiting_vehicle';
      context.lastQuery.timeSlot = entities.timeSlot || (hasTimeSlot[0] ? hasTimeSlot[0] : hasTimeSlot[1]);
      await context.save();
      
      // Show vehicles for this time slot
      const slot = route.timeSlots.find(ts => 
        ts.time.toLowerCase().includes(entities.timeSlot?.toLowerCase() || '') ||
        (entities.timeSlot?.toLowerCase() || '').includes(ts.time.toLowerCase())
      );
      
      if (slot && slot.vehicles.length > 0) {
        let response = `⏰ **Time slot "${entities.timeSlot}" selected for ${route.name}.**\n\n`;
        response += `**Available vehicles:**\n\n`;
        slot.vehicles.forEach((v, i) => {
          response += `${i+1}. **${v.vehicleNumber}** (${v.vehicleType}) - ${v.totalSeats} seats\n`;
        });
        response += `\n**Please select a vehicle or ask:**\n• "Show me seats for [vehicle number]"\n• "Which vehicle has the most seats?"\n• Or go back: "Choose different time"`;
        
        return response;
      } else {
        return `⚠️ No vehicles found for time slot "${entities.timeSlot}".\n\n**Available time slots for ${route.name}:**\n${route.timeSlots.map(ts => `• ${ts.time}`).join('\n')}`;
      }
    } else {
      // Show comprehensive seat availability for the route
      context.conversationState = 'idle';
      await context.save();
      
      return await ResponseGenerator.formatComprehensiveSeats(route._id);
    }
  }

  async handleTimeSlots(entities, context) {
    if (!entities.route && !context.currentRouteName) {
      const routes = await Route.find({}, 'name');
      const routeNames = routes.map(r => r.name);
      
      return `⏰ **Which route's time slots would you like to see?**\n\n${routeNames.map((r, i) => `${i+1}. ${r}`).join('\n')}\n\nOr ask: "Time slots for [route name]"`;
    }

    const routeName = entities.route || context.currentRouteName;
    const route = await Route.findOne({ 
      name: { $regex: new RegExp(routeName, 'i') } 
    });

    if (!route) {
      return ResponseGenerator.formatError(
        `I couldn't find a route named "${routeName}".`,
        [`Show me time slots for a different route`]
      );
    }

    // Update context
    context.currentRoute = route._id;
    context.currentRouteName = route.name;
    await context.save();

    return ResponseGenerator.formatTimeSlots(route._id);
  }

  async handleVehicles(entities, context) {
    if (!entities.route && !context.currentRouteName) {
      const routes = await Route.find({}, 'name');
      const routeNames = routes.map(r => r.name);
      
      return `🚗 **Which route's vehicles would you like to see?**\n\n${routeNames.map((r, i) => `${i+1}. ${r}`).join('\n')}\n\nOr ask: "Vehicles for [route name]"`;
    }

    const routeName = entities.route || context.currentRouteName;
    const route = await Route.findOne({ 
      name: { $regex: new RegExp(routeName, 'i') } 
    });

    if (!route) {
      return ResponseGenerator.formatError(
        `I couldn't find a route named "${routeName}".`,
        [`Show me vehicles for a different route`]
      );
    }

    // Update context
    context.currentRoute = route._id;
    context.currentRouteName = route.name;
    await context.save();

    return ResponseGenerator.formatVehicles(route._id, entities.timeSlot);
  }

  async handleSubroutes(entities, context) {
    if (!entities.route && !context.currentRouteName) {
      const routes = await Route.find({}, 'name');
      const routeNames = routes.map(r => r.name);
      
      return `📍 **Which route's subroutes would you like to see?**\n\n${routeNames.map((r, i) => `${i+1}. ${r}`).join('\n')}\n\nOr ask: "Subroutes for [route name]"`;
    }

    const routeName = entities.route || context.currentRouteName;
    const route = await Route.findOne({ 
      name: { $regex: new RegExp(routeName, 'i') } 
    });

    if (!route) {
      return ResponseGenerator.formatError(
        `I couldn't find a route named "${routeName}".`,
        [`Show me subroutes for a different route`]
      );
    }

    // Update context
    context.currentRoute = route._id;
    context.currentRouteName = route.name;
    await context.save();

    return ResponseGenerator.formatSubroutes(route._id);
  }

  async handleComprehensiveSeats(entities, context) {
    if (!entities.route && !context.currentRouteName) {
      const routes = await Route.find({}, 'name');
      const routeNames = routes.map(r => r.name);
      
      return `📊 **Which route's comprehensive seat details would you like?**\n\n${routeNames.map((r, i) => `${i+1}. ${r}`).join('\n')}\n\nOr ask: "Comprehensive seats for [route name]"`;
    }

    const routeName = entities.route || context.currentRouteName;
    const route = await Route.findOne({ 
      name: { $regex: new RegExp(routeName, 'i') } 
    });

    if (!route) {
      return ResponseGenerator.formatError(
        `I couldn't find a route named "${routeName}".`,
        [`Show me comprehensive seats for a different route`]
      );
    }

    // Update context
    context.currentRoute = route._id;
    context.currentRouteName = route.name;
    await context.save();

    return ResponseGenerator.formatComprehensiveSeats(route._id);
  }

  async handleHelp(context) {
    let routeSpecificHelp = '';
    if (context.currentRouteName) {
      routeSpecificHelp = `\n\n📌 **Regarding ${context.currentRouteName} route:**\n`;
      routeSpecificHelp += `• "Show seat availability for ${context.currentRouteName}"\n`;
      routeSpecificHelp += `• "Time slots for ${context.currentRouteName}"\n`;
      routeSpecificHelp += `• "Fare for ${context.currentRouteName}"\n`;
      routeSpecificHelp += `• "Tell me everything about ${context.currentRouteName}"\n`;
      routeSpecificHelp += `• "Switch to a different route"\n`;
    }

    return `ℹ️ **How can I help you today?**\n\n**You can ask me about:**\n\n🚌 **Routes:**\n• "Show me all routes"\n• "Tell me about [route name]"\n• "Is there a route for [location]?"\n• "Switch to [different route]"\n\n💺 **Seats:**\n• "Seat availability for [route]"\n• "Comprehensive seat details"\n• "Seats for tomorrow"\n• "All routes with seat availability"\n\n💰 **Fares:**\n• "Fare for [route]"\n• "Show me all fares"\n• "What's the price?"\n\n⏰ **Schedules:**\n• "Time slots for [route]"\n• "When is the next bus?"\n• "Morning schedule"\n• "Is there a slot of 2pm?"\n\n🚗 **Vehicles:**\n• "Vehicles for [route]"\n• "Which bus goes at [time]?"\n\n📍 **Other:**\n• "Booking process"\n• "How to book a seat?"\n• "Subroutes for [route]"\n• "Registration guide"\n${routeSpecificHelp}\n\n💡 **Tip:** I remember the last route you asked about. Just say "switch to [new route]" to change routes!`;
  }

  async handleUnknown(message, context) {
    // Try to extract any known entity
    const entities = await IntentRecognizer.extractEntities(message);
    
    if (entities.route) {
      // If route is mentioned but intent unclear, ask for clarification
      const route = await Route.findOne({ 
        name: { $regex: new RegExp(entities.route, 'i') } 
      });
      
      if (route) {
        return `🤔 **I understand you're asking about "${route.name}" route.**\n\nWhat specifically would you like to know?\n\n• Seat availability\n• Time slots\n• Fares\n• Vehicles\n• Complete information\n• Or say: "Tell me everything about ${route.name}"`;
      } else {
        return `🤔 **I heard you mention "${entities.route}"**\n\nI couldn't find that route. Would you like to:\n1. See all available routes\n2. Check if "${entities.route}" exists\n3. Ask about a different route\n\nJust type 1, 2, or 3.`;
      }
    }

    // Check if it might be a multi-step response
    if (context.conversationState !== 'idle') {
      return await this.handleConversationFlow(message, context, 'unknown');
    }

    // Generic unknown response
    const responses = [
      `I'm not sure I understand. Could you rephrase that? 💬`,
      `I want to help! Could you try asking in a different way? 🤔`,
      `Hmm, I didn't quite get that. Try asking about routes, seats, or fares. 📚`,
      `I'm still learning! Try asking me something like:\n• "Show me routes"\n• "Seats available for Saddar"\n• "What's the fare for Gulberg?"\n• "How do I book a seat?"\n• "Switch to Johar route" 🚀`
    ];

    return responses[Math.floor(Math.random() * responses.length)];
  }

  // Helper methods
  async getVehiclesForTimeSlot(route, timeSlot) {
    const slot = route.timeSlots.find(ts => 
      ts.time.toLowerCase().includes(timeSlot.toLowerCase())
    );
    return slot ? slot.vehicles : [];
  }

  // Improved: Update frequently asked routes
  async updateFrequentlyAskedRoutes(context, routeName) {
    if (!routeName) return;

    const route = await Route.findOne({ 
      name: { $regex: new RegExp(routeName, 'i') } 
    });

    if (!route) return;

    // Initialize frequentlyAskedRoutes if not present
    if (!context.frequentlyAskedRoutes) {
      context.frequentlyAskedRoutes = [];
    }

    const existingIndex = context.frequentlyAskedRoutes.findIndex(
      item => item.routeId && item.routeId.toString() === route._id.toString()
    );

    if (existingIndex >= 0) {
      // Update existing entry
      context.frequentlyAskedRoutes[existingIndex].queryCount += 1;
      context.frequentlyAskedRoutes[existingIndex].lastAsked = new Date();
    } else {
      // Add new entry
      context.frequentlyAskedRoutes.push({
        routeId: route._id,
        routeName: route.name,
        queryCount: 1,
        lastAsked: new Date()
      });
    }

    // Sort by query count (descending) and keep only top 10
    context.frequentlyAskedRoutes.sort((a, b) => b.queryCount - a.queryCount);
    if (context.frequentlyAskedRoutes.length > 10) {
      context.frequentlyAskedRoutes = context.frequentlyAskedRoutes.slice(0, 10);
    }
  }

  async getSeatStats(entities, context) {
    try {
      const routeName = entities.route || context.currentRouteName;
      if (!routeName) return null;

      const route = await Route.findOne({ 
        name: { $regex: new RegExp(routeName, 'i') } 
      });

      if (!route) return null;

      // Calculate overall seat stats for the route
      let totalSeats = 0;
      let totalBooked = 0;
      const today = new Date();

      for (const timeSlot of route.timeSlots) {
        for (const vehicle of timeSlot.vehicles) {
          totalSeats += vehicle.totalSeats;
          
          const bookedSeats = await SeatBooking.countDocuments({
            vehicle: vehicle._id,
            bookingDate: {
              $gte: new Date(today.setHours(0, 0, 0, 0)),
              $lt: new Date(today.setHours(23, 59, 59, 999))
            },
            status: 'booked'
          });
          
          totalBooked += bookedSeats;
        }
      }

      const availableSeats = totalSeats - totalBooked;
      const utilization = totalSeats > 0 ? (totalBooked / totalSeats * 100).toFixed(1) : 0;

      return {
        routeName: route.name,
        totalSeats,
        availableSeats,
        bookedSeats: totalBooked,
        utilization: parseFloat(utilization),
        date: today.toLocaleDateString(),
        timeSlotsCount: route.timeSlots.length,
        vehiclesCount: route.timeSlots.reduce((sum, ts) => sum + ts.vehicles.length, 0)
      };
    } catch (error) {
      console.error('Error getting seat stats:', error);
      return null;
    }
  }

  // Get chat context
  async getContext(req, res) {
    try {
      const userId = req.user.id;
      const context = await ChatContext.findOne({ userId })
        .populate('currentRoute', 'name')
        .populate('frequentlyAskedRoutes.routeId', 'name');

      if (!context) {
        return res.json({
          success: true,
          data: { context: null }
        });
      }

      res.json({
        success: true,
        data: { context }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Clear chat context
  async clearContext(req, res) {
    try {
      const userId = req.user.id;
      await ChatContext.findOneAndDelete({ userId });

      res.json({
        success: true,
        message: 'Chat context cleared successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get route suggestions based on user history
  async getRouteSuggestions(req, res) {
    try {
      const userId = req.user.id;
      const context = await ChatContext.findOne({ userId });

      let suggestedRoutes = [];

      if (context && context.frequentlyAskedRoutes.length > 0) {
        // Get frequently asked routes
        suggestedRoutes = context.frequentlyAskedRoutes
          .sort((a, b) => b.queryCount - a.queryCount)
          .slice(0, 5)
          .map(item => item.routeName);
      } else {
        // Fallback to all routes
        const routes = await Route.find({}, 'name');
        suggestedRoutes = routes.slice(0, 5).map(r => r.name);
      }

      res.json({
        success: true,
        data: { suggestedRoutes }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new ChatbotController();