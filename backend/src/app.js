require("dotenv").config();
require('./cron/expireBookings');
const express = require("express");
const cors = require("cors");
const passport = require("./config/passport");
const connectDB = require("./config/db");

// Existing routes
const userRoutes = require("./routes/users");
const authRoutes = require("./routes/auth");
const notificationRoutes = require("./routes/notificationRoutes");
const adminRoutes = require("./routes/adminRoutes");
const announcementRoutes = require("./routes/announcementRoutes");
const studentBookingRoutes = require("./routes/studentBookingRoutes");
const adminInvoiceRoutes = require("./routes/adminInvoiceRoutes");
const adminBookingRoutes = require('./routes/adminBookingRoutes');
const chatbotRoutes = require('./routes/chatbotRoutes');
const studentSeatBookingRoutes = require("./routes/studentSeatBookingRoutes");
const adminSeatBookingRoutes = require("./routes/adminSeatBookingRoutes");
const adminDriverRoutes = require("./routes/adminDriverRoutes");
// Socket.io Dependencies
const http = require("http");
const { Server } = require("socket.io");

// Connect DB
connectDB();

const app = express();

// CORS Configuration - Allow all origins for production
app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());
app.use(passport.initialize());

// Create HTTP server for Socket.io
const server = http.createServer(app);

// Initialize Socket.io - Allow all origins for production
const io = new Server(server, {
  cors: {
    origin: true, // Allow all origins
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    transports: ['websocket', 'polling'] // Add polling as fallback
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Socket Helper Functions
const { initializeSocket, joinUserRoom, joinAdminRoom } = require('./utils/socketHelper');
initializeSocket(io);

// Attach io to req so routes can emit events
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Routes
// backend/src/app.js (Updated section)

// ... existing code ...

// Routes - UPDATED ORDER
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/student", require("./routes/studentRoutes"));
app.use("/api/student/booking", studentBookingRoutes);

// Add seat booking routes BEFORE invoice routes to avoid conflict
app.use("/api/admin/seat-bookings", adminSeatBookingRoutes);
app.use("/api/admin/invoices", adminInvoiceRoutes);  // This was changed from just "/api/admin"

app.use('/api/admin', adminBookingRoutes);
app.use("/api/student/seat-booking", studentSeatBookingRoutes);
app.use("/api/admin/drivers", adminDriverRoutes);
app.use('/api/chat', chatbotRoutes);
// ... rest of the code ...
// Health check endpoint for Railway
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Root endpoint
app.get("/", (req, res) => {
  res.send("🚀 Server is running...");
});

// Socket.io connection handling - UPDATED
io.on("connection", (socket) => {
  console.log("🟢 Socket connected:", socket.id);

  // User joins their personal room
  socket.on('join_user', (userId) => {
    joinUserRoom(socket, userId);
    console.log(`👤 User ${userId} joined their room`);
  });

  // Admin joins admin room
  socket.on('join_admin', () => {
    joinAdminRoom(socket);
    console.log(`👑 Admin joined admin room`);
  });

  socket.on("disconnect", (reason) => {
    console.log("🔴 Socket disconnected:", socket.id, "Reason:", reason);
  });

  socket.on("error", (error) => {
    console.error("Socket error:", error);
  });
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => { // Listen on all interfaces
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🌐 Access via: http://192.168.1.8:${PORT}`);
});