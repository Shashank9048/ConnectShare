// ============================================================
// resource.service.js - Resource Upload/CRUD Business Logic
// ============================================================
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { getEmbeddingModel, genAI } = require('../config/gemini');
const prisma = require('../config/db.prisma');
const Resource = require('../models/Resource.model');
const eventBus = require('../events/eventBus');

const EMBEDDING_MODEL = 'text-embedding-004';

const buildEmbeddingText = ({ title, tags }) => {
  const tagStr = Array.isArray(tags) ? tags.join(' ') : (tags || '');
  return `${title} ${tagStr}`.trim();
};

const generateEmbedding = async (text) => {
  if (!genAI || !text) return [];

  try {
    const model = getEmbeddingModel();
    const result = await model.embedContent(text);
    return result.embedding?.values || [];
  } catch (err) {
    console.warn('[EMBED] Gemini embedding failed, storing empty vector:', err.message);
    return [];
  }
};

const parseTags = (tags) => (
  Array.isArray(tags)
    ? tags
    : (typeof tags === 'string' ? tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [])
);

/**
 * Upload resource - compress with zlib, embed with Gemini, save to MongoDB
 */
const uploadResource = async ({ file, title, tags, workspaceId, userId }) => {
  const uploadDir = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const safeFilename = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const outputPath = path.join(uploadDir, `${Date.now()}-${safeFilename}.gz`);
  const originalSize = file.buffer.length;

  await new Promise((resolve, reject) => {
    const gzip = zlib.createGzip();
    const output = fs.createWriteStream(outputPath);
    const readable = Readable.from(file.buffer);
    readable.pipe(gzip).pipe(output);
    output.on('finish', () => {
      const compressedSizeOnFinish = fs.statSync(outputPath).size;
      console.log(`[COMPRESS] ${file.originalname}: ${originalSize}B -> ${compressedSizeOnFinish}B (${Math.round((1 - compressedSizeOnFinish / originalSize) * 100)}% saved)`);
      resolve();
    });
    output.on('error', reject);
    gzip.on('error', reject);
  });

  const compressedSize = fs.statSync(outputPath).size;
  const parsedTags = parseTags(tags);
  const embedding = await generateEmbedding(buildEmbeddingText({ title, tags: parsedTags }));

  const resource = await Resource.create({
    title,
    fileUrl: outputPath,
    fileType: file.mimetype,
    tags: parsedTags,
    owner: userId,
    workspaceId,
    embedding,
    compressed: true,
    fileSize: compressedSize,
    originalSize,
  });

  eventBus.emit('resource:uploaded', {
    userId,
    resourceId: resource._id,
    workspaceId,
  });

  return {
    resource,
    compression: {
      compressed: true,
      originalSize,
      compressedSize,
    },
  };
};

/**
 * Get paginated resources for a workspace or all workspaces for a user
 */
const getResources = async ({ workspaceId, userId, tags, page = 1, limit = 10 }) => {
  const filter = {};

  if (workspaceId) {
    filter.workspaceId = workspaceId;
  } else if (userId) {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      select: { workspaceId: true },
    });
    filter.workspaceId = { $in: memberships.map((membership) => membership.workspaceId) };
  }

  if (tags) {
    const tagArr = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
    if (tagArr.length) filter.tags = { $in: tagArr };
  }

  const currentPage = Number(page);
  const perPage = Number(limit);
  const skip = (currentPage - 1) * perPage;

  const [resources, total] = await Promise.all([
    Resource.find(filter).sort({ createdAt: -1 }).skip(skip).limit(perPage),
    Resource.countDocuments(filter),
  ]);

  // Resolve owner names from PostgreSQL
  const ownerIds = [...new Set(resources.map(r => r.owner))];
  const owners = await prisma.user.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, name: true, email: true },
  });
  const ownerMap = Object.fromEntries(owners.map(u => [u.id, u]));

  const enrichedResources = resources.map(r => {
    const resourceObj = r.toObject ? r.toObject() : r;
    return {
      ...resourceObj,
      ownerName: ownerMap[r.owner]?.name || ownerMap[r.owner]?.email || 'Unknown',
      ownerEmail: ownerMap[r.owner]?.email || '',
    };
  });

  const totalPages = Math.ceil(total / perPage) || 1;

  return {
    resources: enrichedResources,
    total,
    page: currentPage,
    totalPages,
    pagination: {
      page: currentPage,
      limit: perPage,
      total,
      totalPages,
    },
  };
};

const getResourceById = async (id) => {
  const resource = await Resource.findById(id);
  if (!resource) {
    const err = new Error('Resource not found');
    err.status = 404;
    throw err;
  }
  return resource;
};

const deleteResource = async (id, userId, userRole) => {
  const resource = await Resource.findById(id);
  if (!resource) {
    const err = new Error('Resource not found');
    err.status = 404;
    throw err;
  }

  if (resource.owner !== userId && userRole !== 'ADMIN') {
    const err = new Error('Forbidden: Not owner or admin');
    err.status = 403;
    throw err;
  }

  if (resource.fileUrl && fs.existsSync(resource.fileUrl)) {
    fs.unlinkSync(resource.fileUrl);
    console.log(`[DELETE] Removed file: ${resource.fileUrl}`);
  }

  await Resource.findByIdAndDelete(id);

  eventBus.emit('resource:deleted', {
    userId,
    resourceId: resource._id,
    workspaceId: resource.workspaceId,
  });

  return { deleted: true };
};

const getTagsForWorkspace = async (workspaceId) => {
  const result = await Resource.distinct('tags', { workspaceId });
  return result;
};

module.exports = { uploadResource, getResources, getResourceById, deleteResource, getTagsForWorkspace };
