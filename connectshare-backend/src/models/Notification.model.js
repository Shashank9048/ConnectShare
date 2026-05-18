// ============================================================
// Notification.model.js — MongoDB Schema for Notifications
// ============================================================
const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    userId:       { type: String, required: true },   // recipient
    type:         {
      type: String,
      enum: ['resource:uploaded', 'workspace:invite', 'resource:comment', 'ai:complete'],
      required: true,
    },
    message:      { type: String, required: true },
    resourceId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Resource' },
    workspaceId:  { type: String },
    read:         { type: Boolean, default: false },
    link:         { type: String },                   // navigation link on click
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
