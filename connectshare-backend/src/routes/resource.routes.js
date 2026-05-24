// ============================================================
// resource.routes.js - Resource Upload & CRUD Routes
// ============================================================
const express = require('express');
const { body } = require('express-validator');
const multer = require('multer');
const fs = require('fs');
const { upload, list, getById, remove, download } = require('../controllers/resource.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { roleMiddleware } = require('../middleware/role.middleware');
const prisma = require('../config/db.prisma');
const Resource = require('../models/Resource.model');
const { ensureUploadDir, resolveResourcePath } = require('../utils/storagePaths');

const router = express.Router();
const ROLE_HIERARCHY = { VIEWER: 1, MEMBER: 2, ADMIN: 3 };

ensureUploadDir();

// Multer memory storage: buffer is passed to the service for zlib compression.
const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const uploadValidation = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('workspaceId').notEmpty().withMessage('workspaceId is required'),
];

const resourceRoleMiddleware = (requiredRole) => async (req, res, next) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) {
      return res.status(404).json({ success: false, error: 'Resource not found', code: 404 });
    }

    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId: resource.workspaceId, userId: req.user.id },
      select: { role: true },
    });

    const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 999;
    const memberLevel = ROLE_HIERARCHY[membership?.role] ?? 0;

    if (memberLevel < requiredLevel) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions', code: 403 });
    }

    req.workspaceRole = membership.role;
    req.resource = resource;
    next();
  } catch (err) {
    next(err);
  }
};

router.use(authMiddleware);

router.post('/upload', roleMiddleware('MEMBER'), memUpload.single('file'), uploadValidation, upload);
router.get('/', roleMiddleware('VIEWER'), list);
router.get('/:id/download', resourceRoleMiddleware('VIEWER'), download);
router.get('/:id', resourceRoleMiddleware('VIEWER'), getById);

router.get('/:id/preview', resourceRoleMiddleware('VIEWER'), async (req, res, next) => {
  try {
    const resource = req.resource;

    if (resource.aiContent) {
      return res.json({ success: true, data: { content: resource.aiContent, type: 'markdown' } });
    }

    // Use robust path resolution with fallback directory scan
    const { candidatePathsForResource, uploadDir } = require('../utils/storagePaths');
    const candidates = candidatePathsForResource(resource.fileUrl);
    let resourcePath = candidates.find((c) => fs.existsSync(c));

    if (!resourcePath && resource.fileUrl) {
      const storedBasename = require('path').basename(resource.fileUrl);
      const uploadsFiles = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : [];
      const match = uploadsFiles.find((f) => f === storedBasename || f === storedBasename + '.gz' || f.replace(/\.gz$/i, '') === storedBasename.replace(/\.gz$/i, ''));
      if (match) resourcePath = require('path').join(uploadDir, match);
    }

    if (!resourcePath || !fs.existsSync(resourcePath)) {
      return res.json({ success: true, data: { content: null, type: 'unavailable' } });
    }

    if (resource.compressed || resourcePath.endsWith('.gz')) {
      const zlib = require('zlib');
      const buffer = fs.readFileSync(resourcePath);
      const content = zlib.gunzipSync(buffer).toString('utf8');
      return res.json({ success: true, data: { content, type: resource.fileType || 'text' } });
    }

    if (resource.fileType?.startsWith('image/')) {
      const buffer = fs.readFileSync(resourcePath);
      const base64 = buffer.toString('base64');
      return res.json({ success: true, data: { content: base64, type: resource.fileType } });
    }

    const content = fs.readFileSync(resourcePath, 'utf8');
    return res.json({ success: true, data: { content, type: resource.fileType || 'text' } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', remove);

module.exports = router;
