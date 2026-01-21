// backend/src/routes/adminDriverRoutes.js
const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const Driver = require('../models/Driver');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Only admin can access
router.use(authMiddleware('admin'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads/drivers';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only images and PDFs are allowed'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
});

// 🔹 GET: Get all drivers with filters
router.get('/', async (req, res) => {
  try {
    const { 
      search, 
      status, 
      page = 1, 
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter
    const filter = {};

    // Status filter
    if (status && status !== 'all') {
      filter.status = status;
    }

    // Search filter
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { contactEmail: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } },
        { cnic: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get drivers with pagination
    const drivers = await Driver.find(filter)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Driver.countDocuments(filter);

    // Get statistics
    const stats = {
      totalDrivers: await Driver.countDocuments(),
      activeDrivers: await Driver.countDocuments({ status: 'active' }),
      inactiveDrivers: await Driver.countDocuments({ status: 'inactive' }),
      onLeaveDrivers: await Driver.countDocuments({ status: 'on_leave' })
    };

    res.status(200).json({
      success: true,
      data: {
        drivers,
        stats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching drivers:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 GET: Get driver by ID
router.get('/:id', async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .lean();

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    res.status(200).json({
      success: true,
      data: driver
    });
  } catch (error) {
    console.error('Error fetching driver:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 POST: Create new driver
router.post('/', 
  upload.fields([
    { name: 'profileImage', maxCount: 1 },
    { name: 'cnicFrontImage', maxCount: 1 },
    { name: 'cnicBackImage', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const adminId = req.user.id;
      const driverData = req.body;

      // Check if driver with same email, phone, or CNIC already exists
      const existingDriver = await Driver.findOne({
        $or: [
          { contactEmail: driverData.contactEmail },
          { phoneNumber: driverData.phoneNumber },
          { cnic: driverData.cnic }
        ]
      });

      if (existingDriver) {
        // Delete uploaded files if driver already exists
        if (req.files) {
          Object.values(req.files).forEach(files => {
            files.forEach(file => {
              if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
              }
            });
          });
        }

        let conflictField = '';
        if (existingDriver.contactEmail === driverData.contactEmail) conflictField = 'email';
        else if (existingDriver.phoneNumber === driverData.phoneNumber) conflictField = 'phone number';
        else if (existingDriver.cnic === driverData.cnic) conflictField = 'CNIC';

        return res.status(400).json({
          success: false,
          message: `Driver with this ${conflictField} already exists`
        });
      }

      // Handle file uploads
      if (req.files) {
        if (req.files.profileImage) {
          driverData.profileImage = req.files.profileImage[0].path;
        }
        if (req.files.cnicFrontImage) {
          driverData.cnicFrontImage = req.files.cnicFrontImage[0].path;
        }
        if (req.files.cnicBackImage) {
          driverData.cnicBackImage = req.files.cnicBackImage[0].path;
        }
      }

      // Validate required files
      if (!driverData.cnicFrontImage || !driverData.cnicBackImage) {
        return res.status(400).json({
          success: false,
          message: 'CNIC front and back images are required'
        });
      }

      // Parse date fields
      if (driverData.licenseExpiry) {
        driverData.licenseExpiry = new Date(driverData.licenseExpiry);
      }

      // Set createdBy
      driverData.createdBy = adminId;

      const driver = new Driver(driverData);
      await driver.save();

      // Populate response
      const populatedDriver = await Driver.findById(driver._id)
        .populate('createdBy', 'name email')
        .lean();

      res.status(201).json({
        success: true,
        message: 'Driver created successfully',
        data: populatedDriver
      });
    } catch (error) {
      // Clean up uploaded files if error occurs
      if (req.files) {
        Object.values(req.files).forEach(files => {
          files.forEach(file => {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          });
        });
      }

      console.error('Error creating driver:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

// 🔹 PUT: Update driver
router.put('/:id', 
  upload.fields([
    { name: 'profileImage', maxCount: 1 },
    { name: 'cnicFrontImage', maxCount: 1 },
    { name: 'cnicBackImage', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const adminId = req.user.id;
      const driverId = req.params.id;
      const updateData = req.body;

      const driver = await Driver.findById(driverId);
      if (!driver) {
        // Delete uploaded files if driver not found
        if (req.files) {
          Object.values(req.files).forEach(files => {
            files.forEach(file => {
              if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
              }
            });
          });
        }

        return res.status(404).json({
          success: false,
          message: 'Driver not found'
        });
      }

      // Check for duplicate email, phone, or CNIC (excluding current driver)
      const existingDriver = await Driver.findOne({
        _id: { $ne: driverId },
        $or: [
          { contactEmail: updateData.contactEmail },
          { phoneNumber: updateData.phoneNumber },
          { cnic: updateData.cnic }
        ]
      });

      if (existingDriver) {
        // Delete uploaded files if duplicate found
        if (req.files) {
          Object.values(req.files).forEach(files => {
            files.forEach(file => {
              if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
              }
            });
          });
        }

        let conflictField = '';
        if (existingDriver.contactEmail === updateData.contactEmail) conflictField = 'email';
        else if (existingDriver.phoneNumber === updateData.phoneNumber) conflictField = 'phone number';
        else if (existingDriver.cnic === updateData.cnic) conflictField = 'CNIC';

        return res.status(400).json({
          success: false,
          message: `Another driver with this ${conflictField} already exists`
        });
      }

      // Handle file uploads
      if (req.files) {
        // Delete old files if new ones are uploaded
        if (req.files.profileImage) {
          if (driver.profileImage && fs.existsSync(driver.profileImage)) {
            fs.unlinkSync(driver.profileImage);
          }
          updateData.profileImage = req.files.profileImage[0].path;
        }
        if (req.files.cnicFrontImage) {
          if (driver.cnicFrontImage && fs.existsSync(driver.cnicFrontImage)) {
            fs.unlinkSync(driver.cnicFrontImage);
          }
          updateData.cnicFrontImage = req.files.cnicFrontImage[0].path;
        }
        if (req.files.cnicBackImage) {
          if (driver.cnicBackImage && fs.existsSync(driver.cnicBackImage)) {
            fs.unlinkSync(driver.cnicBackImage);
          }
          updateData.cnicBackImage = req.files.cnicBackImage[0].path;
        }
      }

      // Parse date fields
      if (updateData.licenseExpiry) {
        updateData.licenseExpiry = new Date(updateData.licenseExpiry);
      }

      // Set updatedBy
      updateData.updatedBy = adminId;

      // Update driver
      const updatedDriver = await Driver.findByIdAndUpdate(
        driverId,
        updateData,
        { new: true, runValidators: true }
      )
        .populate('updatedBy', 'name email')
        .lean();

      res.status(200).json({
        success: true,
        message: 'Driver updated successfully',
        data: updatedDriver
      });
    } catch (error) {
      // Clean up uploaded files if error occurs
      if (req.files) {
        Object.values(req.files).forEach(files => {
          files.forEach(file => {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          });
        });
      }

      console.error('Error updating driver:', error);
      res.status(500).json({
        success: false,
        message: error.message
    });
  }
});

// 🔹 DELETE: Delete driver
router.delete('/:id', async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    // Delete files
    const filesToDelete = [
      driver.profileImage,
      driver.cnicFrontImage,
      driver.cnicBackImage
    ];

    filesToDelete.forEach(filePath => {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    // Delete driver
    await Driver.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Driver deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting driver:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🔹 PATCH: Update driver status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const adminId = req.user.id;

    if (!['active', 'inactive', 'on_leave'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      { 
        status,
        updatedBy: adminId
      },
      { new: true }
    )
      .populate('updatedBy', 'name email')
      .lean();

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver not found'
      });
    }

    res.status(200).json({
      success: true,
      message: `Driver status updated to ${status}`,
      data: driver
    });
  } catch (error) {
    console.error('Error updating driver status:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;