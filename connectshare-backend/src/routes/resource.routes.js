// ============================================================
// resource.routes.js — Resource Upload & CRUD Routes
// ============================================================
const express = require('express');
const { body } = require('express-validator');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { upload, list, getById, remove, download } = require('../controllers/resource.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { roleMiddleware } = require('../middleware/role.middleware');

const router = express.Router();

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer — memory storage (buffer passed to service for zlib compression)
const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

const uploadValidation = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('workspaceId').notEmpty().withMessage('workspaceId is required'),
];

// All resource routes require auth
router.use(authMiddleware);

router.post('/upload', roleMiddleware('MEMBER'), memUpload.single('file'), uploadValidation, upload);
router.get('/', roleMiddleware('VIEWER'), list);
router.get('/:id', roleMiddleware('VIEWER'), getById);
const Resource = require('../models/Resource.model');

router.get('/:id/download', roleMiddleware('VIEWER'), async (req, res, next) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ success: false, error: 'Not found' });
    if (!fs.existsSync(resource.fileUrl)) {
      return res.status(404).json({ success: false, error: 'File not found on disk' });
    }

    // Clean filename for download
    const ext = resource.compressed ? path.extname(resource.fileUrl.replace('.gz', '')) : path.extname(resource.fileUrl);
    const cleanName = resource.title.replace(/[^a-zA-Z0-9.-]/g, '_') + (ext || '.txt');
    
    res.setHeader('Content-Disposition', `attachment; filename="${cleanName}"`);
    res.setHeader('Content-Type', resource.fileType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');

    if (resource.compressed) {
      // Decompress gzip → send raw file (NOT .gz to user)
      const zlib = require('zlib');
      const gunzip = zlib.createGunzip();
      const stream = fs.createReadStream(resource.fileUrl);
      stream.on('error', (err) => {
        console.error('Stream error:', err);
        res.status(500).json({ success: false, error: 'Download failed' });
      });
      stream.pipe(gunzip).pipe(res);
    } else {
      res.download(resource.fileUrl, cleanName);
    }
  } catch (err) { next(err); }
});

// Preview endpoint — serves file for inline display
router.get('/:id/preview', roleMiddleware('VIEWER'), async (req, res, next) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ success: false, error: 'Not found' });

    // Return aiContent directly if available (fastest for AI resources)
    if (resource.aiContent) {
      return res.json({ success: true, data: { content: resource.aiContent, type: 'markdown' } });
    }

    if (!fs.existsSync(resource.fileUrl)) {
      return res.json({ success: true, data: { content: null, type: 'unavailable' } });
    }

    if (resource.compressed) {
      const zlib = require('zlib');
      const buffer = fs.readFileSync(resource.fileUrl);
      const content = zlib.gunzipSync(buffer).toString('utf8');
      return res.json({ success: true, data: { content, type: resource.fileType || 'text' } });
    } else {
      if (resource.fileType?.startsWith('image/')) {
        // Send image as base64
        const buffer = fs.readFileSync(resource.fileUrl);
        const base64 = buffer.toString('base64');
        return res.json({ success: true, data: { content: base64, type: resource.fileType } });
      }
      const content = fs.readFileSync(resource.fileUrl, 'utf8');
      return res.json({ success: true, data: { content, type: resource.fileType || 'text' } });
    }
  } catch (err) { next(err); }
});

router.delete('/:id', remove); // ownership/ADMIN check is inside service

module.exports = router;
