const express = require("express");
const Announcement = require("../models/Announcement");
const upload = require("../middleware/multer");
const { uploadToCloudinary } = require("../utils/cloudinary"); // FIX: Add this import
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

/* ----------------------- Create Announcement ------------------------- */
router.post(
  "/",
  authMiddleware("admin"),
  upload.single("media"),
  async (req, res) => {
    try {
      const { title, description, duration } = req.body;

      let mediaUrl = null;
      let mediaType = null;

      if (req.file) {
        // FIX: Use the correct uploadToCloudinary function
        const result = await uploadToCloudinary(req.file.path);
        mediaUrl = result.secure_url;
        mediaType = result.resource_type === 'video' ? 'video' : 'image';
        
        // Optional: Delete the local file after upload to Cloudinary
        const fs = require('fs');
        fs.unlinkSync(req.file.path);
      }

      // Duration handling - FIX: Add missing durations
      let expiresAt = new Date();
      switch (duration) {
        case "24h":
          expiresAt.setHours(expiresAt.getHours() + 24);
          break;
        case "48h":
          expiresAt.setHours(expiresAt.getHours() + 48);
          break;
        case "7d":
          expiresAt.setDate(expiresAt.getDate() + 7);
          break;
        case "14d":
          expiresAt.setDate(expiresAt.getDate() + 14);
          break;
        case "1m":
          expiresAt.setMonth(expiresAt.getMonth() + 1);
          break;
        default:
          expiresAt.setHours(expiresAt.getHours() + 24); // default to 24h
      }

      const announcement = await Announcement.create({
        title,
        description,
        duration,
        expiresAt,
        mediaUrl,
        mediaType,
        createdBy: req.user ? req.user.id : null,
      });

      // Emit via socket.io
      if (req.io) req.io.emit("announcement_created", announcement);

      res.status(201).json({ success: true, announcement });
    } catch (error) {
      console.error("Create error:", error);
      res.status(500).json({ message: "Error creating announcement: " + error.message });
    }
  }
);

/* ---------------------- Get Active Announcements (Student) ------------------- */
router.get("/active", async (req, res) => {
  try {
    const now = new Date();
    const active = await Announcement.find({
      expiresAt: { $gt: now },
      isActive: true,
    }).sort({ createdAt: -1 });

    res.json(active);
  } catch (error) {
    res.status(500).json({ message: "Error fetching active announcements" });
  }
});

/* ---------------------- Get All Announcements (Admin) ---------------------- */
router.get("/all", authMiddleware("admin"), async (req, res) => {
  try {
    const list = await Announcement.find().sort({ createdAt: -1 });
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: "Error fetching announcements" });
  }
});

/* -------------------------- Update Announcement --------------------------- */
/* -------------------------- Update Announcement --------------------------- */
router.put(
  "/:id",
  authMiddleware("admin"),
  upload.single("media"),
  async (req, res) => {
    try {
      const announcement = await Announcement.findById(req.params.id);
      if (!announcement)
        return res.status(404).json({ message: "Not found" });

      const updates = req.body;

      if (req.file) {
        // New media uploaded
        const result = await uploadToCloudinary(req.file.path);
        updates.mediaUrl = result.secure_url;
        updates.mediaType = result.resource_type === "video" ? "video" : "image";
        
        // Delete local file after upload
        const fs = require('fs');
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } else if (updates.mediaUrl === '' || updates.mediaUrl === 'remove') {
        // Media removed - set to null
        updates.mediaUrl = null;
        updates.mediaType = null;
      }

      // Maintain update history
      if (!announcement.updateHistory) announcement.updateHistory = [];
      announcement.updateHistory.push({
        updatedBy: req.user ? req.user.id : null,
        changes: updates,
      });

      // Apply updates
      Object.keys(updates).forEach(key => {
        announcement[key] = updates[key];
      });

      await announcement.save();

      if (req.io) req.io.emit("announcement_updated", announcement);

      res.json({ success: true, announcement });
    } catch (error) {
      console.error("Update error:", error);
      res.status(500).json({ message: "Error updating announcement: " + error.message });
    }
  }
);

/* ---------------------------- Delete Announcement -------------------------- */
router.delete("/:id", authMiddleware("admin"), async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement)
      return res.status(404).json({ message: "Not found" });

    await announcement.deleteOne();

    if (req.io) req.io.emit("announcement_deleted", { id: req.params.id });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: "Error deleting announcement" });
  }
});/* ---------------------- Get Single Announcement ------------------- */
router.get("/:id", authMiddleware("admin"), async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }
    res.json(announcement);
  } catch (error) {
    res.status(500).json({ message: "Error fetching announcement" });
  }
});

module.exports = router;
