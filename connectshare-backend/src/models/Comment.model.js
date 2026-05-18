// ============================================================
// Comment.model.js — MongoDB Schema for Resource Comments
// ============================================================
const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema(
  {
    content:     { type: String, required: true, trim: true },
    author:      { type: String, required: true },       // userId from PostgreSQL
    authorName:  { type: String, required: true },
    resourceId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true },
  },
  { timestamps: true }
);

CommentSchema.index({ resourceId: 1, createdAt: -1 });

module.exports = mongoose.model('Comment', CommentSchema);
