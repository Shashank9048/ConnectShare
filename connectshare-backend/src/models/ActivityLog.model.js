// ============================================================
// ActivityLog.model.js — MongoDB Schema for Activity Logs
// ============================================================
const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema(
  {
    action:      { type: String, required: true }, // e.g. 'resource:uploaded'
    userId:      { type: String, required: true },
    workspaceId: { type: String },
    resourceId:  { type: mongoose.Schema.Types.ObjectId },
    metadata:    { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

ActivityLogSchema.index({ workspaceId: 1, createdAt: -1 });
ActivityLogSchema.index({ userId: 1 });

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
