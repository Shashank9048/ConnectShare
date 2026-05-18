// ============================================================
// Resource.model.js — MongoDB Schema for File Resources
// ============================================================
const mongoose = require('mongoose');

const ResourceSchema = new mongoose.Schema(
  {
    title:          { type: String, required: true, trim: true },
    fileUrl:        { type: String, required: true },
    fileType:       { type: String },
    tags:           [{ type: String, lowercase: true, trim: true }],
    owner:          { type: String, required: true }, // userId from PostgreSQL
    workspaceId:    { type: String, required: true },
    embedding:      [{ type: Number }],               // Gemini embedding vector
    compressed:     { type: Boolean, default: false },
    fileSize:       { type: Number },
    originalSize:   { type: Number },
    isAIGenerated:  { type: Boolean, default: false },
    aiContent:      { type: String },                 // store AI-generated text directly in DB
    sourceUrl:      { type: String },                 // for web-fetched resources
  },
  { timestamps: true }
);

// Index for fast workspace queries and tag filtering
ResourceSchema.index({ workspaceId: 1 });
ResourceSchema.index({ tags: 1 });
ResourceSchema.index({ owner: 1 });
ResourceSchema.index({ isAIGenerated: 1 });

module.exports = mongoose.model('Resource', ResourceSchema);
