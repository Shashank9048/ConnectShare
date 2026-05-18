// ============================================================
// Message.model.js — MongoDB Schema for Chat Messages
// ============================================================
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema(
  {
    content:          { type: String, default: '' },
    sender:           { type: String, required: true },     // userId from PostgreSQL
    senderName:       { type: String, required: true },
    workspaceId:      { type: String, required: true },
    type:             { type: String, enum: ['text', 'resource', 'ai', 'system'], default: 'text' },
    resourceId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Resource' },
    taggedResourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource' },
    isDeleted:        { type: Boolean, default: false },
    pinnedBy:         { type: String, default: null },
    pinnedAt:         { type: Date, default: null },
  },
  { timestamps: true }
);

MessageSchema.index({ workspaceId: 1, createdAt: -1 });
MessageSchema.index({ workspaceId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', MessageSchema);
