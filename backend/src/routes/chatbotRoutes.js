const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const chatbotController = require('../controllers/chatbotController');
const ResponseGenerator = require('../utils/responseGenerator');
const Route = require('../models/Route');
const ChatContext = require('../models/ChatContext'); // ADD THIS IMPORT

const router = express.Router();

// All routes require authentication
router.use(authMiddleware(['student', 'admin']));

// 🔹 Bind controller methods properly
router.post(
  '/message',
  chatbotController.processMessage.bind(chatbotController)
);

router.get(
  '/context',
  chatbotController.getContext.bind(chatbotController)
);

router.delete(
  '/context',
  chatbotController.clearContext.bind(chatbotController)
);

router.get(
  '/suggestions',
  chatbotController.getRouteSuggestions.bind(chatbotController)
);

// POST: Quick check for seat availability
router.post('/quick-check', async (req, res) => {
  try {
    const { routeName, date = new Date(), comprehensive = false } = req.body;
    const userId = req.user.id;

    const route = await Route.findOne({
      name: { $regex: new RegExp(routeName, 'i') }
    });

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    let response;
    if (comprehensive) {
      response = await ResponseGenerator.formatComprehensiveSeats(
        route._id,
        new Date(date)
      );
    } else {
      response = await ResponseGenerator.formatSeatAvailability(route._id);
    }

    const seatStats = await chatbotController.getSeatStats(
      { route: routeName },
      { currentRouteName: routeName }
    );

    res.json({
      success: true,
      data: {
        response,
        intent: comprehensive
          ? 'route_comprehensive_seats'
          : 'seat_availability',
        seatStats,
        timestamp: new Date()
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get all routes for switching
router.get('/routes/all', async (req, res) => {
  try {
    const routes = await Route.find({}, 'name startingPoint mainDestination timeSlots subRoutes monthlyFare');
    
    res.json({
      success: true,
      data: { routes }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Complete route information
router.post('/complete-route-info', async (req, res) => {
  try {
    const { routeName } = req.body;
    const route = await Route.findOne({ 
      name: { $regex: new RegExp(routeName, 'i') } 
    }).populate('timeSlots.vehicles');

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    // Use ResponseGenerator to format complete info
    // First, let's check if formatCompleteRouteInfo exists in ResponseGenerator
    let response;
    if (ResponseGenerator.formatCompleteRouteInfo) {
      response = await ResponseGenerator.formatCompleteRouteInfo(route);
    } else {
      // Fallback to existing method
      response = await ResponseGenerator.formatRouteInfo(route, true);
    }
    
    res.json({
      success: true,
      data: {
        response,
        route: {
          name: route.name,
          startingPoint: route.startingPoint,
          mainDestination: route.mainDestination,
          monthlyFare: route.monthlyFare
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Switch route
router.post('/switch-route', async (req, res) => {
  try {
    const { routeName } = req.body;
    const userId = req.user.id;
    
    let context = await ChatContext.findOne({ userId });
    if (!context) {
      context = new ChatContext({ userId });
    }
    
    const route = await Route.findOne({ 
      name: { $regex: new RegExp(routeName, 'i') } 
    });

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    // Update context
    context.currentRoute = route._id;
    context.currentRouteName = route.name;
    context.conversationState = 'idle';
    await context.save();

    // Get comprehensive information about the new route
    let routeInfo;
    if (ResponseGenerator.formatRouteInfo) {
      routeInfo = await ResponseGenerator.formatRouteInfo(route, true);
    }

    res.json({
      success: true,
      data: {
        response: `✅ **Switched to ${route.name} route!**\n\n${routeInfo || `What would you like to know about this route?`}`,
        context,
        intent: 'route_switch',
        route: {
          name: route.name,
          startingPoint: route.startingPoint,
          mainDestination: route.mainDestination
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Continue conversation flow - SIMPLIFIED VERSION
router.post('/continue', async (req, res) => {
  try {
    const { message, conversationState } = req.body;
    const userId = req.user.id;
    
    // Get user's current context
    let context = await ChatContext.findOne({ userId });
    if (!context) {
      return res.status(404).json({
        success: false,
        message: 'No active conversation found'
      });
    }

    // Update conversation state if provided
    if (conversationState) {
      context.conversationState = conversationState;
      await context.save();
    }

    // Process the message through the main controller
    // We'll create a fake request object to reuse the processMessage logic
    const fakeReq = {
      user: { id: userId },
      body: { message, context: context.toObject() }
    };
    
    const fakeRes = {
      json: (data) => {
        res.json(data);
      },
      status: (code) => {
        return {
          json: (data) => {
            res.status(code).json(data);
          }
        };
      }
    };

    // Use the existing processMessage method
    await chatbotController.processMessage(fakeReq, fakeRes);

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get chatbot capabilities
router.get('/capabilities', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        capabilities: [
          'Route information and switching',
          'Seat availability checking',
          'Fare information',
          'Time slot details',
          'Vehicle information',
          'Subroute/stop information',
          'Comprehensive seat reports',
          'Booking process guidance',
          'Multi-step conversations',
          'Context-aware responses'
        ],
        exampleQueries: [
          'Tell me about Saddar route',
          'Switch to Gulberg route',
          'Seat availability for Johar',
          'Fare for Model route',
          'Time slots for Route 1',
          'Vehicles available at 9 AM',
          'Subroutes for Saddar',
          'Comprehensive seat report',
          'How do I book a seat?',
          'What routes are available?'
        ]
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get conversation history
router.get('/history', async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20 } = req.query;
    
    const IntentLog = require('../models/IntentLog');
    
    const history = await IntentLog.find({ userId })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .populate('contextId', 'currentRouteName conversationState');
    
    res.json({
      success: true,
      data: { history }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Clear conversation history
router.delete('/history', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const IntentLog = require('../models/IntentLog');
    await IntentLog.deleteMany({ userId });
    
    res.json({
      success: true,
      message: 'Conversation history cleared successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get conversation state
router.get('/conversation-state', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const context = await ChatContext.findOne({ userId });
    
    res.json({
      success: true,
      data: {
        conversationState: context?.conversationState || 'idle',
        currentRoute: context?.currentRouteName || null
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update conversation state
router.post('/conversation-state', async (req, res) => {
  try {
    const { state } = req.body;
    const userId = req.user.id;
    
    let context = await ChatContext.findOne({ userId });
    if (!context) {
      context = new ChatContext({ userId });
    }
    
    context.conversationState = state;
    await context.save();
    
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
});

// Reset conversation state
router.delete('/conversation-state', async (req, res) => {
  try {
    const userId = req.user.id;
    
    let context = await ChatContext.findOne({ userId });
    if (context) {
      context.conversationState = 'idle';
      await context.save();
    }
    
    res.json({
      success: true,
      message: 'Conversation state reset to idle'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;