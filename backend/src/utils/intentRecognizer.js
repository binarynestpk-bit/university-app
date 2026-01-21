// backend/src/utils/intentrecognizer.js - UPDATED VERSION

class IntentRecognizer {
  // Detect intent from user message
  static async detectIntent(message, context = {}) {
    const lowerMessage = message.toLowerCase();
    
    // Extract entities first
    const entities = await this.extractEntities(message);
    
    // Check for multi-step conversation states
    if (context.conversationState && context.conversationState !== 'idle') {
      return { intent: 'continue_conversation', confidence: 0.9, entities };
    }
    
    // Enhanced Intent patterns with priorities - FIXED ROUTE SWITCHING
    const intentPatterns = [
      {
        intent: 'greeting',
        patterns: [/hello|hi|hey|good morning|good afternoon|good evening/i],
        priority: 1
      },
      {
        intent: 'fare_all',
        patterns: [/all fares?|every fare|list fares?|show fares?|fares? for all routes/i],
        priority: 2
      },
      {
        intent: 'fare_specific',
        patterns: [/fare|price|cost|how much|what.*cost|what.*price/i],
        priority: 2
      },
      {
        intent: 'list_routes_with_seats',
        patterns: [/all routes.*seat|seat.*all routes|routes.*available|available.*routes|list.*routes.*with.*seats/i],
        priority: 3
      },
      {
        intent: 'seat_availability',
        patterns: [/seat|available|availability|book.*seat|seats/i],
        priority: 3
      },
      {
        intent: 'seat_availability_specific',
        patterns: [/seat.*available|seats.*available|available.*seats/i],
        priority: 3
      },
      {
        intent: 'route_comprehensive_seats',
        patterns: [/comprehensive|detailed|full.*details?|complete.*details?|breakdown|report/i],
        priority: 4
      },
      // ENHANCED ROUTE SWITCH PATTERNS
      {
        intent: 'route_switch',
        patterns: [
          /switch.*to|change.*to|how about|what about|instead|different.*route|other.*route/i,
          /tell me about (?!.*instead\b)(\w+)/i,
          /show me (?!.*instead\b)(\w+)/i
        ],
        priority: 4
      },
      {
        intent: 'route_info',
        patterns: [/route|path|way|direction/i],
        priority: 5
      },
      {
        intent: 'route_exists',
        patterns: [/is there.*route|do you have.*route|exist.*route|available.*route/i],
        priority: 5
      },
      {
        intent: 'complete_route_info',
        patterns: [/everything.*about|complete.*info|full.*info|tell.*me.*everything|all.*details.*about/i],
        priority: 6
      },
      {
        intent: 'time_slots',
        patterns: [/time|schedule|when|timing|hours?|slot|pm|am/i],
        priority: 7
      },
      {
        intent: 'vehicles',
        patterns: [/vehicle|bus|car|van|transport/i],
        priority: 8
      },
      {
        intent: 'subroutes',
        patterns: [/subroute|stop|station|pickup|drop/i],
        priority: 9
      },
      {
        intent: 'booking_help',
        patterns: [/book|booking|how.*to.*book|process|procedure|register|registration|guide|how.*to/i],
        priority: 10
      },
      {
        intent: 'help',
        patterns: [/help|what.*can.*you.*do|how.*can.*you.*help|capabilities/i],
        priority: 11
      },
      {
        intent: 'list_routes',
        patterns: [/all routes?|every route|list routes?|show routes?|what.*routes?|available.*routes?/i],
        priority: 12
      }
    ];
    
    // Sort by priority (lower number = higher priority)
    intentPatterns.sort((a, b) => a.priority - b.priority);
    
    let detectedIntent = 'unknown';
    let confidence = 0.5; // Default confidence
    
    // Special handling for explicit route switching
    if (this.isExplicitRouteSwitch(message, context.currentRouteName)) {
      return { intent: 'route_switch', confidence: 0.95, entities };
    }
    
    // Check each pattern
    for (const pattern of intentPatterns) {
      for (const regex of pattern.patterns) {
        if (regex.test(lowerMessage)) {
          detectedIntent = pattern.intent;
          
          // Boost confidence if route is mentioned
          if (entities.route) {
            confidence = 0.9;
          } else {
            confidence = 0.8;
          }
          
          // Check for context awareness
          if (context.currentRouteName && 
              (lowerMessage.includes('this route') || 
               lowerMessage.includes('current route') ||
               lowerMessage.includes('same route'))) {
            confidence = 0.95;
          }
          
          return { intent: detectedIntent, confidence, entities };
        }
      }
    }
    
    // If no pattern matched but we have a route entity, assume route_info
    if (entities.route) {
      // Check if it's likely a switch request
      const hasSwitchKeywords = lowerMessage.match(/(how about|what about|show me|tell me about)/i);
      if (hasSwitchKeywords && context.currentRouteName && 
          entities.route.toLowerCase() !== context.currentRouteName.toLowerCase()) {
        return { intent: 'route_switch', confidence: 0.85, entities };
      }
      return { intent: 'route_info', confidence: 0.7, entities };
    }
    
    return { intent: 'unknown', confidence: 0.3, entities };
  }
  
  // Extract entities from message - ENHANCED
  static async extractEntities(message) {
    const entities = {
      route: null,
      timeSlot: null,
      vehicle: null,
      date: null
    };
    
    const lowerMessage = message.toLowerCase();
    
    // Extract route names (improved with common misspellings and better matching)
    const routePatterns = [
      { pattern: /saddar|sadar|saddr|sadr|sdadar/i, name: 'Saddar' },
      { pattern: /gulberg|gulburg|gulbarg|gulbrg/i, name: 'Gulberg' },
      { pattern: /johar|johr|johar town/i, name: 'Johar' },
      { pattern: /model|model town|mdl/i, name: 'Model' },
      { pattern: /defence|defense|defnce/i, name: 'Defence' },
      { pattern: /clifton|cliffton|clifon/i, name: 'Clifton' },
      { pattern: /karachi.*university|ku|university.*karachi/i, name: 'Karachi University' },
      { pattern: /north.*nazimabad|nazimabad|nazim.*abad/i, name: 'North Nazimabad' },
      { pattern: /route\s*(\d+)/i, name: (match) => `Route ${match[1]}` },
      { pattern: /(\w+)\s*route/i, name: (match) => `${match[1].charAt(0).toUpperCase() + match[1].slice(1)}` },
      // Added: Capture route names after "switch to" or "change to"
      { pattern: /(?:switch to|change to|how about|what about|tell me about|show me)\s+(\w+)/i, 
        name: (match) => `${match[1].charAt(0).toUpperCase() + match[1].slice(1)}` }
    ];
    
    for (const routePattern of routePatterns) {
      const match = lowerMessage.match(routePattern.pattern);
      if (match) {
        entities.route = typeof routePattern.name === 'function' ? routePattern.name(match) : routePattern.name;
        break;
      }
    }
    
    // Extract time slot - IMPROVED
    const timePatterns = [
      /\b(\d{1,2}[:.]?\d{0,2}\s*(?:am|pm|AM|PM)?)\b/,
      /\b(morning|afternoon|evening|noon|midday)\b/i,
      /\b(9.*am|10.*am|11.*am|12.*pm|1.*pm|2.*pm|3.*pm|4.*pm|5.*pm)\b/i,
      /\b(\d+)\s*(?:o'?clock)?\s*(am|pm)\b/i
    ];
    
    for (const pattern of timePatterns) {
      const match = lowerMessage.match(pattern);
      if (match) {
        entities.timeSlot = this.normalizeTimeSlot(match[0]);
        break;
      }
    }
    
    // Extract vehicle number (e.g., "bus 123", "vehicle ABC-123")
    const vehiclePattern = /\b(?:bus|vehicle|van|car)\s*([A-Z0-9\-]+)\b|\b([A-Z]{2,3}-\d{3,4}|\d{4,5})\b/i;
    const vehicleMatch = message.match(vehiclePattern);
    if (vehicleMatch) {
      entities.vehicle = vehicleMatch[1] || vehicleMatch[2];
    }
    
    // Extract date
    const datePatterns = [
      /\b(today|tomorrow|yesterday)\b/i,
      /\b(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})\b/,
      /\b(\w+ \d{1,2},? \d{4})\b/
    ];
    
    for (const pattern of datePatterns) {
      const match = lowerMessage.match(pattern);
      if (match) {
        entities.date = match[0];
        break;
      }
    }
    
    return entities;
  }
  
  // Normalize time slot format
  static normalizeTimeSlot(timeStr) {
    if (!timeStr) return timeStr;
    
    const lowerTime = timeStr.toLowerCase().trim();
    
    // Handle common time phrases
    if (lowerTime.includes('morning')) return 'Morning';
    if (lowerTime.includes('afternoon')) return 'Afternoon';
    if (lowerTime.includes('evening')) return 'Evening';
    if (lowerTime.includes('noon') || lowerTime.includes('midday')) return '12:00 PM';
    
    // Handle times like "2pm", "2 pm", "2:00pm"
    const timeMatch = lowerTime.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (timeMatch) {
      let [_, hour, minute, period] = timeMatch;
      hour = parseInt(hour);
      minute = minute ? parseInt(minute) : 0;
      
      // Convert to 12-hour format with AM/PM
      if (!period) {
        period = hour >= 12 ? 'pm' : 'am';
        if (hour > 12) hour -= 12;
      }
      
      return `${hour}:${minute.toString().padStart(2, '0')} ${period.toUpperCase()}`;
    }
    
    return timeStr;
  }
  
  // Check if message indicates explicit route switching
  static isExplicitRouteSwitch(message, currentRoute) {
    if (!currentRoute) return false;
    
    const lowerMessage = message.toLowerCase();
    const currentRouteLower = currentRoute ? currentRoute.toLowerCase() : '';
    
    const switchPatterns = [
      new RegExp(`(switch to|change to|how about|what about)\\s+(?!${currentRouteLower}\\b)`, 'i'),
      /(instead|rather|different|other).*route/i,
      new RegExp(`now\\s+(show me|tell me about)\\s+(?!${currentRouteLower}\\b)`, 'i')
    ];
    
    return switchPatterns.some(pattern => pattern.test(lowerMessage));
  }
  
  // Extract route name for switching - IMPROVED
  static extractSwitchRoute(message) {
    const patterns = [
      /(?:switch to|change to|how about|what about|tell me about|show me)\s+(\w+(?:\s+\w+)?)/i,
      /now\s+(?:show me|tell me about)\s+(\w+(?:\s+\w+)?)/i,
      /let'?s\s+(?:talk about|discuss)\s+(\w+(?:\s+\w+)?)/i
    ];
    
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        // Capitalize first letter of each word
        const routeName = match[1]
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
        return routeName;
      }
    }
    
    return null;
  }
  
  // Get similar route names for suggestions
  static getSimilarRoutes(routeName) {
    const routeVariations = {
      'saddar': ['sadar', 'saddr', 'sadr', 'sdadar'],
      'gulberg': ['gulburg', 'gulbarg', 'gulbrg'],
      'johar': ['johr', 'johar town', 'johar-town'],
      'model': ['model town', 'mdl', 'model-town'],
      'defence': ['defense', 'defnce', 'defence phase'],
      'clifton': ['cliffton', 'clifon', 'clifton block'],
      'karachi university': ['ku', 'university of karachi', 'karachi uni'],
      'north nazimabad': ['nazimabad', 'n. nazimabad', 'north-nazimabad']
    };
    
    const lowerRoute = routeName.toLowerCase();
    
    // Check for exact match in variations
    for (const [correctRoute, variations] of Object.entries(routeVariations)) {
      if (lowerRoute === correctRoute.toLowerCase() || 
          variations.some(v => v.toLowerCase() === lowerRoute)) {
        return correctRoute;
      }
    }
    
    // Check for partial matches
    for (const [correctRoute, variations] of Object.entries(routeVariations)) {
      if (lowerRoute.includes(correctRoute.toLowerCase()) || 
          correctRoute.toLowerCase().includes(lowerRoute) ||
          variations.some(v => lowerRoute.includes(v.toLowerCase()) || v.toLowerCase().includes(lowerRoute))) {
        return correctRoute;
      }
    }
    
    return null;
  }
  
  // NEW: Check if query is asking for all routes
  static isAllRoutesQuery(message) {
    const lowerMessage = message.toLowerCase();
    const allRoutesPatterns = [
      /all routes?/i,
      /every route/i,
      /list routes?/i,
      /show routes?/i,
      /what routes?/i,
      /available routes?/i
    ];
    
    return allRoutesPatterns.some(pattern => pattern.test(lowerMessage));
  }
  
  // NEW: Check if query is asking for specific time slot availability
  static isTimeSlotQuery(message) {
    const lowerMessage = message.toLowerCase();
    const timeSlotPatterns = [
      /(\d+)\s*(?:am|pm)/i,
      /time slot/i,
      /slot.*\d+/i,
      /\d+\s*(?:o'?clock)/i
    ];
    
    return timeSlotPatterns.some(pattern => pattern.test(lowerMessage));
  }
  
  // NEW: Check if query is about registration/booking process
  static isRegistrationQuery(message) {
    const lowerMessage = message.toLowerCase();
    const registrationPatterns = [
      /register/i,
      /registration/i,
      /how to book/i,
      /booking process/i,
      /booking guide/i,
      /process.*book/i
    ];
    
    return registrationPatterns.some(pattern => pattern.test(lowerMessage));
  }
}

module.exports = IntentRecognizer;