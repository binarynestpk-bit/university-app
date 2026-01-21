const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage for profile pictures (images only)
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'wise-route-profile-pics',
    allowed_formats: ['jpg', 'jpeg', 'png'],
  },
});

// Storage for announcements (images + videos)
const announcementStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'wise-route-announcements',
    allowed_formats: ['jpg', 'jpeg', 'png', 'mp4', 'mov', 'avi'],
    resource_type: 'auto',
  },
});

// Storage for payment screenshots
const paymentScreenshotStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'wise-route-payment-screenshots',
    allowed_formats: ['jpg', 'jpeg', 'png'],
    resource_type: 'image',
  },
});

// Direct upload function for any file
const uploadToCloudinary = (filePath, options = {}) => {
  return cloudinary.uploader.upload(filePath, {
    folder: options.folder || 'wise-route-uploads',
    resource_type: options.resource_type || 'auto',
    ...options
  });
};

// Delete from Cloudinary
const deleteFromCloudinary = (publicId, resourceType = 'image') => {
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};

module.exports = { 
  cloudinary, 
  storage, 
  announcementStorage,
  paymentScreenshotStorage,
  uploadToCloudinary,
  deleteFromCloudinary
};