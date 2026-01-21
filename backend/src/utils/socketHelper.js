let io;

const initializeSocket = (socketIO) => {
  io = socketIO;
};

// Send notification to specific user
const sendSocketNotification = (userId, notification) => {
  if (io) {
    io.to(`user_${userId}`).emit('notification', notification);
  }
};

// Send admin notification
const sendAdminNotification = (notification) => {
  if (io) {
    io.to('admin_room').emit('admin_notification', notification);
  }
};

// Join user to their room
const joinUserRoom = (socket, userId) => {
  socket.join(`user_${userId}`);
};

// Join admin room
const joinAdminRoom = (socket) => {
  socket.join('admin_room');
};

module.exports = {
  initializeSocket,
  sendSocketNotification,
  sendAdminNotification,
  joinUserRoom,
  joinAdminRoom
};