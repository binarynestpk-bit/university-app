const express = require('express');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const Route = require('../models/Route');  
const router = express.Router();

// Student dashboard
router.get('/student/dashboard', authMiddleware('student'), (req, res) => {
  res.json({ message: `👋 Welcome Student (User ID: ${req.user.id})` });
});

// Admin dashboard
router.get('/admin/dashboard', authMiddleware('admin'), (req, res) => {
  res.json({ message: `👋 Welcome Admin (User ID: ${req.user.id})` });
});
// 🔸 Fetch all students
router.get('/admin/students', authMiddleware('admin'), async (req, res) => {
  try {
    const students = await User.find({ role: 'student' })
      .select('-password'); // omit password
    res.status(200).json(students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 🔸 Fetch single student profile
router.get('/admin/students/:id', authMiddleware('admin'), async (req, res) => {
  try {
    const student = await User.findById(req.params.id).select('-password');
    if (!student) return res.status(404).json({ message: 'User not found!' });

    res.status(200).json(student);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
/** 🟢 NEW: Public get all routes with vehicles */
router.get('/routes', authMiddleware(), async (req, res) => {
  try {
    const routes = await Route.find({});
    return res.status(200).json(routes);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

router.get('/student/booking-status', authMiddleware('student'), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.status(200).json({
      bookingLocked: !user.registrationApproved
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


module.exports = router;
