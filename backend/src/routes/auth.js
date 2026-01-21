// routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const passport = require('passport'); // Make sure passport is initialized
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const Route = require('../models/Route');  

// ✅ Import Cloudinary Storage
const { storage } = require('../utils/cloudinary');
const multer = require('multer');

// ✅ Multer using Cloudinary Storage
const upload = multer({ storage });

const router = express.Router();

/**
 * 🔸 Register
 */
router.post('/register', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      confirmPassword,
      role,
      dateOfBirth,
      mobileNumber,
      cnic // 🟢 Extract cnic from req.body
    } = req.body;

    // Validate required fields
    if (!dateOfBirth || !mobileNumber || !cnic) {
      return res.status(400).json({ message: 'dateOfBirth, mobileNumber and cnic are required!' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match!' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'Email already in use!' });

    const hashed = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email,
      password: hashed,
      role: role || 'student',
      dateOfBirth,
      mobileNumber,
      cnic // 🟢 Save cnic to user document
    });

    await newUser.save();

    res.status(201).json({ message: 'User created successfully!' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * 🔸 Login
 */
router.post('/login', async (req, res, next) => {
  passport.authenticate('local', { session: false }, (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(400).json({ message: info.message });

    const payload = { id: user.id, role: user.role };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, role: user.role, name: user.name, email: user.email, profilePicUrl: user.profilePicUrl });
  })(req, res, next);
});

/**
 * 🔸 Get current user profile
 */
router.get('/me', authMiddleware(), async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * 🔸 Update profile fields
 */
// 🔸 Update profile (now also accepts dateOfBirth)
// auth.js (your routes file)
router.patch('/updateProfile', authMiddleware(), async (req, res) => {
  try {
    const { name, mobileNumber, dateOfBirth, address, department, registrationNumber,semester ,cnic} = req.body;

    // Validate date
    if (dateOfBirth && isNaN(new Date(dateOfBirth))) {
      return res.status(400).json({ message: 'Invalid dateOfBirth format (use YYYY-MM-DD).' });
    }

    // Prepare update object
    const updateData = { name, mobileNumber, dateOfBirth, address, department, registrationNumber,semester,cnic };
    Object.keys(updateData).forEach((k) => updateData[k] === undefined && delete updateData[k]);

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true, select: '-password' }
    );

    res.status(200).json({ message: 'Profile updated successfully', user: updatedUser });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});



/**
 * 🔸 Update password
 */
router.patch('/updatePassword', authMiddleware(), async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found!' });

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Old password is incorrect' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save({ validateBeforeSave: false }); // 🟢 skip validation

    return res.status(200).json({ message: 'Password updated successfully!' });
  } catch (error) {
    console.error('Error updating password:', error.message);
    return res.status(500).json({ message: error.message });
  }
});



/**
 * 🔸 Update profile picture
 */
router.patch('/updateProfilePic', authMiddleware(), upload.single('image'), async (req, res) => {
  try {
    // ✅ multer-storage-cloudinary sets req.file.path to the Cloudinary URL
    const profilePicUrl = req.file.path;
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { profilePicUrl },
      { new: true, select: '-password' }
    );

    res.status(200).json({ message: 'Profile picture updated successfully', user: updatedUser });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
/**
 * 🔹 Forgot Password (Send OTP)
 */
const sendEmail = require('../utils/sendEmail'); // ✅ add this at the top near other imports

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User not found!' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save OTP and expiry (15 minutes)
    user.resetPasswordOTP = otp;
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
    await user.save();

    // Send OTP to email
    await sendEmail(user.email, 'Password Reset OTP', `Your password reset code is: ${otp}`);

    res.status(200).json({ message: 'OTP sent to your email!' });
  } catch (error) {
    console.error('Error in forgot-password:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});
/**
 * 🔹 Verify OTP and Reset Password
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User not found!' });
    }

    if (
      !user.resetPasswordOTP ||
      user.resetPasswordOTP !== otp ||
      Date.now() > user.resetPasswordExpires
    ) {
      return res.status(400).json({ message: 'Invalid or expired OTP!' });
    }

    // Hash and save new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;

    // Clear OTP fields
    user.resetPasswordOTP = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    res.status(200).json({ message: 'Password reset successfully!' });
  } catch (error) {
    console.error('Error in reset-password:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
