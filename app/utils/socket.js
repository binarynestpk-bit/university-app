import { io } from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.eventCallbacks = new Map();
  }

  connect() {
    // Don't create multiple connections
    if (this.socket && this.isConnected) {
      return this.socket;
    }

    // Clear any existing socket
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    try {
      // Use your Railway backend URL
      const backendUrl = 'https://university-app-production-4eef.up.railway.app';
      
      console.log('🔌 Attempting socket connection to:', backendUrl);
      
      this.socket = io(backendUrl, {
        transports: ['websocket', 'polling'], // Try websocket first, then polling
        timeout: 10000,
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        randomizationFactor: 0.5
      });

      // Connection events
      this.socket.on('connect', () => {
        console.log('🟢 Socket connected successfully:', this.socket.id);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        // Re-register all event listeners after reconnection
        this.eventCallbacks.forEach((callbacks, event) => {
          callbacks.forEach(callback => {
            this.socket.on(event, callback);
          });
        });
      });

      this.socket.on('disconnect', (reason) => {
        console.log('🔴 Socket disconnected. Reason:', reason);
        this.isConnected = false;
        
        if (reason === 'io server disconnect') {
          // Server disconnected, try to reconnect
          this.socket.connect();
        }
      });

      this.socket.on('connect_error', (error) => {
        console.error('❌ Socket connection error:', error.message);
        this.isConnected = false;
        this.reconnectAttempts++;
        
        if (this.reconnectAttempts <= this.maxReconnectAttempts) {
          console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        } else {
          console.log('⏹️ Max reconnection attempts reached. Stopping.');
        }
      });

      this.socket.on('reconnect_attempt', (attempt) => {
        console.log(`🔄 Socket reconnection attempt: ${attempt}`);
      });

      this.socket.on('reconnect', (attempt) => {
        console.log(`✅ Socket reconnected after ${attempt} attempts`);
        this.isConnected = true;
        this.reconnectAttempts = 0;
      });

      this.socket.on('reconnect_error', (error) => {
        console.error('❌ Socket reconnection error:', error.message);
      });

      this.socket.on('reconnect_failed', () => {
        console.error('💥 Socket reconnection failed');
      });

      // Application-specific events
      this.socket.on('announcement_created', (announcement) => {
        console.log('📢 New announcement via socket:', announcement.title);
      });

      this.socket.on('announcement_updated', (announcement) => {
        console.log('📢 Announcement updated via socket:', announcement.title);
      });

      this.socket.on('announcement_deleted', (data) => {
        console.log('📢 Announcement deleted via socket:', data.id);
      });

      return this.socket;

    } catch (error) {
      console.error('💥 Failed to initialize socket:', error);
      return null;
    }
  }

  disconnect() {
    if (this.socket) {
      console.log('🔌 Disconnecting socket...');
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.eventCallbacks.clear();
  }

  on(event, callback) {
    // Store callback for reconnection
    if (!this.eventCallbacks.has(event)) {
      this.eventCallbacks.set(event, []);
    }
    this.eventCallbacks.get(event).push(callback);

    // Register immediately if connected
    if (this.socket && this.isConnected) {
      this.socket.on(event, callback);
    }
  }

  off(event, callback) {
    // Remove from stored callbacks
    if (this.eventCallbacks.has(event)) {
      const callbacks = this.eventCallbacks.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }

    // Remove listener if connected
    if (this.socket && this.isConnected) {
      this.socket.off(event, callback);
    }
  }

  emit(event, data) {
    if (this.socket && this.isConnected) {
      this.socket.emit(event, data);
      return true;
    } else {
      console.warn('⚠️ Socket not connected, cannot emit:', event);
      return false;
    }
  }

  // Specific event helpers
  onAnnouncementCreated(callback) {
    this.on('announcement_created', callback);
  }

  onAnnouncementUpdated(callback) {
    this.on('announcement_updated', callback);
  }

  onAnnouncementDeleted(callback) {
    this.on('announcement_deleted', callback);
  }

  // Connection status
  getConnectionStatus() {
    return this.isConnected;
  }

  getSocketId() {
    return this.socket ? this.socket.id : null;
  }

  // Manual reconnect
  manualReconnect() {
    if (this.socket) {
      this.socket.connect();
    } else {
      this.connect();
    }
  }
}

export default new SocketService();