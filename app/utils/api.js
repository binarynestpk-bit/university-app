import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

// Base URL for your backend
const baseURL = 'https://university-app-production-4eef.up.railway.app/api';

const api = axios.create({
  baseURL,
  timeout: 10000,
});

// Attach token automatically if present
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired, redirect to login
      await AsyncStorage.multiRemove(['token', 'role', 'name', 'email']);
      // You might want to use router here to redirect to login
    }
    return Promise.reject(error);
  }
);

// Chatbot API calls - UPDATED WITH ALL ENDPOINTS
// In frontend/app/utils/api.js, UPDATE the chatAPI object:

// Chatbot API calls - SIMPLIFIED AND FIXED
export const chatAPI = {
  // Send message to chatbot (main endpoint)
  sendMessage: (message, context = {}) => 
    api.post('/chat/message', { 
      message, 
      context: {
        currentRouteName: context.currentRouteName,
        conversationState: context.conversationState,
        lastQuery: context.lastQuery
      } 
    }),
  
  // Get chat context
  getChatContext: () => api.get('/chat/context'),
  
  // Clear chat context
  clearChatContext: () => api.delete('/chat/context'),
  
  // Get route suggestions
  getRouteSuggestions: () => api.get('/chat/suggestions'),
  
  // Quick check seat availability
  quickCheck: (routeName, date = new Date().toISOString().split('T')[0], comprehensive = false) => 
    api.post('/chat/quick-check', { routeName, date, comprehensive }),
  
  // Get all routes for switching
  getAllRoutes: () => api.get('/chat/routes/all'),
  
  // Get complete route information
  getCompleteRouteInfo: (routeName) => 
    api.post('/chat/complete-route-info', { routeName }),
  
  // Switch to a new route
  switchRoute: (routeName) => 
    api.post('/chat/switch-route', { routeName }),
  
  // Continue conversation flow
  continueConversation: (message, context, conversationState) =>
    api.post('/chat/continue', { 
      message, 
      context: context ? {
        currentRoute: context.currentRoute,
        currentRouteName: context.currentRouteName,
        conversationState: context.conversationState,
        lastQuery: context.lastQuery
      } : {},
      conversationState 
    }),
  
  // Get conversation history
  getConversationHistory: (limit = 20) =>
    api.get(`/chat/history?limit=${limit}`),
  
  // Clear conversation history
  clearConversationHistory: () => api.delete('/chat/history'),
  
  // Get chatbot capabilities
  getCapabilities: () => api.get('/chat/capabilities'),
  
  // Get conversation state
  getConversationState: () => api.get('/chat/conversation-state'),
  
  // Update conversation state
  updateConversationState: (state) => api.post('/chat/conversation-state', { state }),
  
  // Reset conversation state
  resetConversationState: () => api.delete('/chat/conversation-state'),
};

// Announcements API calls
export const announcementsAPI = {
  // Get active announcements for students (no auth required)
  getActive: () => api.get('/announcements/active'),
  
  // Get all announcements for admin
  getAll: () => api.get('/announcements/all'),
  
  // Create announcement (admin only)
  create: (formData) => api.post('/announcements', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  
  // Update announcement (admin only)
  update: (id, formData) => api.put(`/announcements/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  
  // Delete announcement (admin only)
  delete: (id) => api.delete(`/announcements/${id}`),
};

// Notifications API calls
export const notificationsAPI = {
  getAll: () => api.get('/notifications'),
  markAsRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: () => api.patch('/notifications/read-all'),
  getUnreadCount: () => api.get('/notifications/unread-count'),
};

// Auth API calls
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  getMe: () => api.get('/auth/me'),
  updateProfile: (profileData) => api.patch('/auth/updateProfile', profileData),
  updatePassword: (passwordData) => api.patch('/auth/updatePassword', passwordData),
  updateProfilePic: (formData) => api.patch('/auth/updateProfilePic', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (resetData) => api.post('/auth/reset-password', resetData),
};

// User API calls
export const userAPI = {
  getStudentDashboard: () => api.get('/users/student/dashboard'),
  getAdminDashboard: () => api.get('/users/admin/dashboard'),
  getAdminStudents: () => api.get('/users/admin/students'),
  getStudentProfile: (id) => api.get(`/users/admin/students/${id}`),
  getRoutes: () => api.get('/users/routes'),
  getBookingStatus: () => api.get('/users/student/booking-status'),
  
  // NEW: Get user preferences for chatbot
  getChatPreferences: () => api.get('/users/chat-preferences'),
  
  // NEW: Update user preferences for chatbot
  updateChatPreferences: (preferences) => 
    api.patch('/users/chat-preferences', preferences),
  
  // NEW: Get user's frequently asked routes
  getFrequentlyAskedRoutes: () => api.get('/users/frequently-asked-routes'),
  
  // NEW: Get user conversation history
  getConversationStats: () => api.get('/users/conversation-stats'),
};

// Student API calls
export const studentAPI = {
  // Get available routes for booking
  getAvailableRoutes: () => api.get('/student/routes'),
  
  // Get detailed information for a specific route
  getRouteDetails: (routeId) => api.get(`/student/routes/${routeId}`),
  
  // Book a seat
  bookSeat: (data) => api.post('/student/bookings', data),
  
  // NEW: Get route by name for chatbot
  getRouteByName: (routeName) => 
    api.get(`/student/routes/by-name/${encodeURIComponent(routeName)}`),
  
  // NEW: Get seat availability stats
  getSeatAvailabilityStats: (routeId, date = null) => 
    api.get(`/student/routes/${routeId}/seat-stats`, { params: { date } }),
  
  // NEW: Get comprehensive route info for chatbot
  getComprehensiveRouteInfo: (routeName) =>
    api.get(`/student/routes/comprehensive/${encodeURIComponent(routeName)}`),
};

// Student Booking API (New Endpoints)
export const studentBookingAPI = {
  // Get available routes
  getRoutes: () => api.get('/student/booking/routes'),
  
  // Get user profile data
  getProfileData: () => api.get('/student/booking/profile-data'),
  
  // Register booking
  registerBooking: (data) => api.post('/student/booking/register-booking', data),
  
  // Get invoices by status
  getInvoices: (status) => api.get(`/student/booking/invoices/${status}`),
  
  // Get active invoices
  getActiveInvoices: () => api.get('/student/booking/invoices/active'),
  
  // Submit payment proof
  submitPayment: (invoiceId, data) => 
    api.post(`/student/booking/invoices/${invoiceId}/pay`, data),
    
  // Get booking status
  getBookingStatus: () => api.get('/student/booking/booking-status'),
     
  uploadPaymentScreenshot: (formData) => 
    api.post('/student/booking/upload-payment-screenshot', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
  
  // NEW: Get route information for chatbot
  getRouteForChatbot: (routeName) =>
    api.get(`/student/booking/route-chat/${encodeURIComponent(routeName)}`),
  
  // NEW: Get fare information for chatbot
  getFareForChatbot: (routeName = null) =>
    api.post('/student/booking/fare-chat', { routeName }),
};

// Student Seat Booking API
export const studentSeatBookingAPI = {
  // Get routes with try counter
  getRoutes: () => api.get('/student/seat-booking/routes'),
  
  // Get time slots for a route
  getTimeSlots: (routeId, bookingDate) => 
    api.get(`/student/seat-booking/routes/${routeId}/timeslots`, { 
      params: { bookingDate } 
    }),
  
  // Get seat map for a vehicle
  getSeatMap: (vehicleId, params) => 
    api.get(`/student/seat-booking/vehicles/${vehicleId}/seats`, { params }),
  
  // Book a seat
  bookSeat: (data) => api.post('/student/seat-booking/book', data),
  
  // Cancel booking
  cancelBooking: (bookingId) => api.post('/student/seat-booking/cancel', { bookingId }),
  
  // Get booking history
  getBookingHistory: (params) => 
    api.get('/student/seat-booking/history', { params }),
  
  // NEW: Get seat availability for chatbot
  getSeatAvailabilityForChat: (routeId, timeSlotId, vehicleId, date) =>
    api.get(`/student/seat-booking/chat-availability`, {
      params: { routeId, timeSlotId, vehicleId, date }
    }),
  
  // NEW: Get comprehensive seat report for chatbot
  getComprehensiveSeatReport: (routeId, date) =>
    api.get(`/student/seat-booking/comprehensive-report/${routeId}`, {
      params: { date }
    }),
};

// Admin Seat Booking API
export const adminSeatBookingAPI = {
  // Get all seat bookings
  getSeatBookings: (params) => api.get('/admin/seat-bookings', { params }),
  
  // Get seat booking by ID
  getSeatBooking: (id) => api.get(`/admin/seat-bookings/${id}`),
  
  // Get seat availability for vehicle
  getSeatAvailability: (vehicleId, date) => 
    api.get(`/admin/seat-bookings/vehicles/${vehicleId}/availability`, { 
      params: { date } 
    }),
  
  // Cancel booking (admin)
  cancelSeatBooking: (id) => api.delete(`/admin/seat-bookings/${id}`),
  
  // Get analytics
  getAnalytics: (params) => 
    api.get('/admin/seat-bookings/analytics/overview', { params }),
  
  // NEW: Get route information for chatbot admin
  getRouteInfoForChatbot: (routeName) =>
    api.get(`/admin/seat-bookings/route-info/${encodeURIComponent(routeName)}`),
  
  // NEW: Get all routes for admin chatbot
  getAllRoutesForChatbot: () => api.get('/admin/seat-bookings/chatbot-routes'),
};

// Admin API calls
export const adminAPI = {
  // Drivers Management
  getDrivers: (params) => api.get('/admin/drivers', { params }),
  getDriver: (id) => api.get(`/admin/drivers/${id}`),
  createDriver: (formData) => api.post('/admin/drivers', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  updateDriver: (id, formData) => api.put(`/admin/drivers/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  deleteDriver: (id) => api.delete(`/admin/drivers/${id}`),
  updateDriverStatus: (id, status) => api.patch(`/admin/drivers/${id}/status`, { status }),
  getAvailableVehicles: () => api.get('/admin/drivers/available-vehicles'),
  
  // 🚌 BOOKING SYSTEM ENDPOINTS
  // Main Routes
  createBookingRoute: (routeData) => api.post('/admin/booking/routes', routeData),
  getBookingRoutes: () => api.get('/admin/booking/routes'),
  getBookingRoute: (id) => api.get(`/admin/booking/routes/${id}`),
  updateBookingRoute: (id, routeData) => api.put(`/admin/booking/routes/${id}`, routeData),
  deleteBookingRoute: (id) => api.delete(`/admin/booking/routes/${id}`),

  // Sub-Routes
  addSubRoute: (routeId, subRouteData) => api.post(`/admin/booking/routes/${routeId}/subroutes`, subRouteData),
  updateSubRoute: (routeId, subRouteId, subRouteData) => api.put(`/admin/booking/routes/${routeId}/subroutes/${subRouteId}`, subRouteData),
  deleteSubRoute: (routeId, subRouteId) => api.delete(`/admin/booking/routes/${routeId}/subroutes/${subRouteId}`),

  // Time Slots
  addTimeSlot: (routeId, timeSlotData) => api.post(`/admin/booking/routes/${routeId}/timeslots`, timeSlotData),
  updateTimeSlot: (routeId, timeSlotId, timeSlotData) => api.put(`/admin/booking/routes/${routeId}/timeslots/${timeSlotId}`, timeSlotData),
  deleteTimeSlot: (routeId, timeSlotId) => api.delete(`/admin/booking/routes/${routeId}/timeslots/${timeSlotId}`),

  // Vehicles
  addVehicle: (routeId, timeSlotId, vehicleData) => api.post(`/admin/booking/routes/${routeId}/timeslots/${timeSlotId}/vehicles`, vehicleData),
  updateVehicle: (routeId, timeSlotId, vehicleId, vehicleData) => api.put(`/admin/booking/routes/${routeId}/timeslots/${timeSlotId}/vehicles/${vehicleId}`, vehicleData),
  deleteVehicle: (routeId, timeSlotId, vehicleId) => api.delete(`/admin/booking/routes/${routeId}/timeslots/${timeSlotId}/vehicles/${vehicleId}`),

  // Bookings Management
  getAllBookings: () => api.get('/admin/bookings'),
  getBookingDetails: (id) => api.get(`/admin/bookings/${id}`),
  updateBookingStatus: (id, statusData) => api.patch(`/admin/bookings/${id}/status`, statusData),
  deleteBooking: (id) => api.delete(`/admin/bookings/${id}`),
  
  // Invoice Endpoints
  getInvoices: (params) => api.get('/admin/invoices', { params }),
  getInvoice: (id) => api.get(`/admin/invoices/${id}`),
  approveInvoice: (id, data) => api.put(`/admin/invoices/${id}/approve`, data),
  rejectInvoice: (id, data) => api.put(`/admin/invoices/${id}/reject`, data),
  getInvoiceStats: () => api.get('/admin/invoices/stats'),
  
  // NEW: Chatbot management endpoints
  getChatbotAnalytics: () => api.get('/admin/chatbot/analytics'),
  getChatbotConversations: (params) => api.get('/admin/chatbot/conversations', { params }),
  getChatbotIntentsStats: () => api.get('/admin/chatbot/intents-stats'),
  getChatbotRoutePopularity: () => api.get('/admin/chatbot/route-popularity'),
  resetChatbotData: () => api.delete('/admin/chatbot/reset-data'),
  exportChatbotData: () => api.get('/admin/chatbot/export-data'),
  
  // NEW: Route management for chatbot
  getRoutesForChatbot: () => api.get('/admin/chatbot/routes'),
  updateRouteForChatbot: (routeId, data) => api.put(`/admin/chatbot/routes/${routeId}`, data),
  syncRoutesWithChatbot: () => api.post('/admin/chatbot/sync-routes'),
};

// Requests API calls
export const requestsAPI = {
  getAll: () => api.get('/requests'),
  create: (requestData) => api.post('/requests', requestData),
  update: (id, requestData) => api.put(`/requests/${id}`, requestData),
  delete: (id) => api.delete(`/requests/${id}`),
  
  // NEW: Chatbot-related requests
  createChatbotFeedback: (feedback) => api.post('/requests/chatbot-feedback', feedback),
  getChatbotFeedback: () => api.get('/requests/chatbot-feedback'),
  updateChatbotFeedback: (id, status) => api.patch(`/requests/chatbot-feedback/${id}`, { status }),
};

// Socket configuration
export const SOCKET_CONFIG = {
  url: 'http://192.168.1.8:5000',
  options: {
    transports: ['websocket'],
    timeout: 10000,
  }
};

// Route Management API for chatbot
export const routeAPI = {
  // Get all routes with complete information
  getAllRoutes: () => api.get('/routes/all'),
  
  // Get route by name
  getRouteByName: (routeName) => 
    api.get(`/routes/by-name/${encodeURIComponent(routeName)}`),
  
  // Search routes
  searchRoutes: (query) => api.get(`/routes/search?q=${encodeURIComponent(query)}`),
  
  // Get route fares
  getRouteFares: (routeName = null) => 
    api.post('/routes/fares', { routeName }),
  
  // Get route with seat availability
  getRouteWithSeats: (routeName, date = null) =>
    api.post('/routes/with-seats', { routeName, date }),
  
  // Compare multiple routes
  compareRoutes: (routeNames) => api.post('/routes/compare', { routeNames }),
  
  // Get similar routes
  getSimilarRoutes: (routeName) => 
    api.get(`/routes/similar/${encodeURIComponent(routeName)}`),
  
  // Get route statistics
  getRouteStats: (routeName) => 
    api.get(`/routes/stats/${encodeURIComponent(routeName)}`),
};

// Utility functions - ENHANCED VERSION
export const apiUtils = {
  // Check if user is authenticated
  isAuthenticated: async () => {
    const token = await AsyncStorage.getItem('token');
    return !!token;
  },
  
  // Get user role
  getUserRole: async () => {
    return await AsyncStorage.getItem('role');
  },
  
  // Logout user
  logout: async () => {
    await AsyncStorage.multiRemove(['token', 'role', 'name', 'email', 'lastSeenAnnouncementId']);
  },
  
  // Store user data after login
  storeUserData: async (userData) => {
    await AsyncStorage.multiSet([
      ['token', userData.token],
      ['role', userData.role],
      ['name', userData.name],
      ['email', userData.email],
    ]);
  },
  
  // Get common seat availability phrases
  getSeatAvailabilityPhrases: () => {
    return [
      "How many seats are available?",
      "Check seat availability on my route",
      "Are there seats left for today?",
      "Which time slot has the most seats?",
      "Seat availability for tomorrow"
    ];
  },
  
  // Extract route name from user input - ENHANCED
  extractRouteFromInput: (input) => {
    const lowerInput = input.toLowerCase();
    const routePatterns = [
      { pattern: /route\s+(\d+)/i, name: (match) => `Route ${match[1]}` },
      { pattern: /saddar|sadar|saddr|sadr/i, name: () => 'Saddar' },
      { pattern: /gulberg|gulburg|gulbarg/i, name: () => 'Gulberg' },
      { pattern: /johar|johar town/i, name: () => 'Johar' },
      { pattern: /model|model town/i, name: () => 'Model' },
      { pattern: /defence|defense/i, name: () => 'Defence' },
      { pattern: /clifton/i, name: () => 'Clifton' },
      { pattern: /karachi university|ku/i, name: () => 'Karachi University' },
      { pattern: /north nazimabad|nazimabad/i, name: () => 'North Nazimabad' },
      { pattern: /(\w+)\s+route/i, name: (match) => `${match[1].charAt(0).toUpperCase() + match[1].slice(1)}` }
    ];
    
    for (const routePattern of routePatterns) {
      const match = lowerInput.match(routePattern.pattern);
      if (match) {
        return typeof routePattern.name === 'function' ? routePattern.name(match) : routePattern.name;
      }
    }
    
    return null;
  },
  
  // Format seat availability response for display
  formatSeatResponse: (data) => {
    if (!data.success || !data.data) {
      return "Unable to fetch seat availability at the moment.";
    }
    
    const { seatStats } = data.data;
    if (!seatStats || seatStats.availableSeats === undefined) {
      return "Seat information not available.";
    }
    
    const { routeName, availableSeats, totalSeats, utilization, date } = seatStats;
    
    let response = "";
    if (routeName) {
      response += `**${routeName}**\n`;
    }
    
    if (availableSeats > 0) {
      response += `🎉 **${availableSeats} seats available** (out of ${totalSeats})\n`;
      response += `📊 Utilization: ${utilization}%\n`;
      if (date) {
        response += `📅 ${date}\n`;
      }
      response += `\n🚀 **Great news!** There are ${availableSeats} seats available. You can book now!`;
    } else {
      response += `😔 **No seats available** (${totalSeats} total seats)\n`;
      response += `📊 Utilization: ${utilization}%\n`;
      if (date) {
        response += `📅 ${date}\n`;
      }
      response += `\n⏰ **Try checking** another time slot or route, or come back later.`;
    }
    
    return response;
  },

  // Extract intent from message for analytics - ENHANCED
  extractIntentFromMessage: (message) => {
    const lowerMessage = message.toLowerCase();
    
    // Enhanced intent detection
    if (lowerMessage.includes('all routes') && (lowerMessage.includes('seat') || lowerMessage.includes('available'))) {
      return 'list_routes_with_seats';
    } else if (lowerMessage.includes('seat') && (lowerMessage.includes('detail') || lowerMessage.includes('comprehensive') || lowerMessage.includes('full') || lowerMessage.includes('complete'))) {
      return 'route_comprehensive_seats';
    } else if (lowerMessage.includes('seat') || lowerMessage.includes('available')) {
      return 'seat_availability';
    } else if (lowerMessage.includes('route') && !lowerMessage.includes('seat')) {
      if (lowerMessage.includes('switch') || lowerMessage.includes('change') || lowerMessage.includes('different')) {
        return 'route_switch';
      } else if (lowerMessage.includes('all') || lowerMessage.includes('every') || lowerMessage.includes('list')) {
        return 'list_routes';
      } else if (lowerMessage.includes('exist') || lowerMessage.includes('have') || lowerMessage.includes('available')) {
        return 'route_exists';
      } else if (lowerMessage.includes('complete') || lowerMessage.includes('everything') || lowerMessage.includes('full')) {
        return 'complete_route_info';
      }
      return 'route_info';
    } else if (lowerMessage.includes('book')) {
      return 'booking_help';
    } else if (lowerMessage.includes('fare') || lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('how much')) {
      if (lowerMessage.includes('all') || lowerMessage.includes('every')) {
        return 'fare_all';
      }
      return 'fare_specific';
    } else if (lowerMessage.includes('time') || lowerMessage.includes('schedule') || lowerMessage.includes('when')) {
      return 'time_slots';
    } else if (lowerMessage.includes('vehicle') || lowerMessage.includes('bus') || lowerMessage.includes('car') || lowerMessage.includes('van')) {
      return 'vehicles';
    } else if (lowerMessage.includes('subroute') || lowerMessage.includes('stop') || lowerMessage.includes('station')) {
      return 'subroutes';
    } else if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey') || lowerMessage.includes('good morning') || lowerMessage.includes('good afternoon')) {
      return 'greeting';
    } else if (lowerMessage.includes('help') || lowerMessage.includes('what can you do') || lowerMessage.includes('how can you help')) {
      return 'help';
    }
    
    return 'general_help';
  },
  
  // NEW: Check if message indicates route switching
  isRouteSwitchMessage: (message, currentRoute) => {
    const lowerMessage = message.toLowerCase();
    if (!currentRoute) return false;
    
    const switchPatterns = [
      /(switch to|change to|tell me about|what about|how about)\s+(\w+)/i,
      /now\s+(tell me about|show me)\s+(\w+)/i,
      /let'?s\s+(talk about|discuss)\s+(\w+)/i,
      /what'?s\s+(\w+)\s+route/i,
    ];
    
    for (const pattern of switchPatterns) {
      const match = lowerMessage.match(pattern);
      if (match) {
        const mentionedRoute = match[2] || match[1];
        if (mentionedRoute && mentionedRoute.toLowerCase() !== currentRoute.toLowerCase()) {
          return true;
        }
      }
    }
    
    // Check for direct route mention that's different from current
    const extractedRoute = apiUtils.extractRouteFromInput(message);
    return extractedRoute && extractedRoute.toLowerCase() !== currentRoute.toLowerCase();
  },
  
  // NEW: Format chatbot message for display
  formatChatbotMessage: (text, intent = null) => {
    let formatted = text;
    
    // Add emojis based on intent
    if (intent) {
      const intentEmojis = {
        'greeting': '👋',
        'fare_all': '💰',
        'fare_specific': '💰',
        'seat_availability': '💺',
        'route_comprehensive_seats': '📊',
        'route_info': '🚌',
        'route_switch': '🔄',
        'complete_route_info': '📋',
        'time_slots': '⏰',
        'vehicles': '🚗',
        'subroutes': '📍',
        'booking_help': '📖',
        'help': '❓',
      };
      
      if (intentEmojis[intent] && !text.startsWith(intentEmojis[intent])) {
        formatted = `${intentEmojis[intent]} ${text}`;
      }
    }
    
    return formatted;
  },
  
  // NEW: Get suggested queries based on context
  getSuggestedQueries: (context) => {
    const suggestions = [];
    
    if (context.currentRouteName) {
      const route = context.currentRouteName;
      suggestions.push(
        `Seat availability for ${route}`,
        `Fare for ${route}`,
        `Time slots for ${route}`,
        `Tell me everything about ${route}`,
        `Switch to different route`
      );
    } else {
      suggestions.push(
        "Show me all routes",
        "What routes are available?",
        "How do I book a seat?",
        "Show me fare information",
        "Check seat availability"
      );
    }
    
    if (context.conversationState === 'awaiting_time_slot') {
      suggestions.push(
        "Show me time slots",
        "Morning slots",
        "Afternoon slots",
        "Evening slots"
      );
    } else if (context.conversationState === 'awaiting_vehicle') {
      suggestions.push(
        "Show me vehicles",
        "Available buses",
        "Vehicle list"
      );
    }
    
    return suggestions;
  },
  
  // NEW: Parse chatbot response for UI
  parseChatbotResponse: (responseData) => {
    const { response, context, intent, seatStats } = responseData;
    
    return {
      text: apiUtils.formatChatbotMessage(response, intent),
      intent,
      context,
      seatStats,
      timestamp: new Date(),
      showRouteSwitch: intent === 'route_switch' || (context?.currentRouteName && !response.includes('Switched to')),
      suggestedActions: apiUtils.getSuggestedQueries(context || {})
    };
  }
};

// NEW: Chatbot specific utilities
export const chatbotUtils = {
  // Initialize chatbot session
  initializeSession: async () => {
    try {
      const context = await chatAPI.getChatContext();
      const routes = await chatAPI.getAllRoutes();
      const suggestions = await chatAPI.getRouteSuggestions();
      
      return {
        context: context.data?.context || {},
        routes: routes.data?.data?.routes || [],
        suggestions: suggestions.data?.data?.suggestedRoutes || []
      };
    } catch (error) {
      console.error('Failed to initialize chatbot session:', error);
      return { context: {}, routes: [], suggestions: [] };
    }
  },
  
  // Handle route switching
  handleRouteSwitch: async (newRouteName) => {
    try {
      const response = await chatAPI.switchRoute(newRouteName);
      return response.data;
    } catch (error) {
      console.error('Failed to switch route:', error);
      throw error;
    }
  },
  
  // Get complete route information
  getCompleteRouteInfo: async (routeName) => {
    try {
      const response = await chatAPI.getCompleteRouteInfo(routeName);
      return response.data;
    } catch (error) {
      console.error('Failed to get complete route info:', error);
      throw error;
    }
  },
  
  // Continue conversation flow
  continueFlow: async (message, context, conversationState) => {
    try {
      const response = await chatAPI.continueConversation(message, context, conversationState);
      return response.data;
    } catch (error) {
      console.error('Failed to continue conversation:', error);
      throw error;
    }
  },
  
  // Clear chatbot data
  clearChatbotData: async () => {
    try {
      await chatAPI.clearChatContext();
      await chatAPI.clearConversationHistory();
      await chatAPI.resetConversationState();
      return true;
    } catch (error) {
      console.error('Failed to clear chatbot data:', error);
      return false;
    }
  },
  
  // Get chatbot analytics
  getAnalytics: async () => {
    try {
      const response = await chatAPI.getConversationHistory();
      const stats = await userAPI.getConversationStats();
      return {
        conversationHistory: response.data?.data || [],
        stats: stats.data?.data || {}
      };
    } catch (error) {
      console.error('Failed to get chatbot analytics:', error);
      return { conversationHistory: [], stats: {} };
    }
  }
};

export default api;