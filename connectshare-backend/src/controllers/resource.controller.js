// ============================================================
// resource.controller.js — Resource Route Handlers
// ============================================================
const { validationResult } = require('express-validator');
const {
  uploadResource,
  getResources,
  getResourceById,
  deleteResource,
  getTagsForWorkspace,
} = require('../services/resource.service');
const path = require('path');
const fs = require('fs');
const { resolveResourcePath } = require('../utils/storagePaths');

// POST /api/v1/resources/upload
const upload = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, error: errors.array()[0].msg, code: 422 });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided', code: 400 });
    }

    const { title, tags, workspaceId } = req.body;
    const resource = await uploadResource({
      file: req.file,
      title,
      tags,
      workspaceId,
      userId: req.user.id,
    });

    res.status(201).json({
      success: true,
      message: 'Resource uploaded successfully',
      data: {
        ...resource.resource,
        resource: resource.resource,
        compression: resource.compression,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/resources
const list = async (req, res, next) => {
  try {
    const { workspaceId, tags, page = 1, limit = 10 } = req.query;
    const result = await getResources({ workspaceId, userId: req.user.id, tags, page, limit });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/resources/:id
const getById = async (req, res, next) => {
  try {
    const resource = await getResourceById(req.params.id);
    res.status(200).json({ success: true, data: resource });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/v1/resources/:id
const remove = async (req, res, next) => {
  try {
    const result = await deleteResource(req.params.id, req.user.id, req.user.role);
    res.status(200).json({ success: true, message: 'Resource deleted', data: result });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/resources/:id/download
const download = async (req, res, next) => {
  try {
    const resource = req.resource || await getResourceById(req.params.id);
    if (!resource || !resource.fileUrl) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    // ── Resolve the physical file path ───────────────────────────────────────
    const { candidatePathsForResource, uploadDir } = require('../utils/storagePaths');
    const candidates = candidatePathsForResource(resource.fileUrl);
    console.log(`[DOWNLOAD] Resource ${resource._id} — stored fileUrl: ${resource.fileUrl}`);
    console.log(`[DOWNLOAD] Candidate paths: ${JSON.stringify(candidates)}`);

    let resourcePath = candidates.find((c) => fs.existsSync(c));

    // Last-resort: scan uploads dir for a file whose name starts with the same
    // timestamp-stem (handles cases where fileUrl stored an old absolute path).
    if (!resourcePath) {
      const storedBasename = path.basename(resource.fileUrl);
      const uploadsFiles = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : [];
      const match = uploadsFiles.find((f) => f === storedBasename || f === storedBasename + '.gz' || f.replace(/\.gz$/i, '') === storedBasename.replace(/\.gz$/i, ''));
      if (match) {
        resourcePath = path.join(uploadDir, match);
        console.log(`[DOWNLOAD] Found via uploads scan: ${resourcePath}`);
      }
    }

    if (!resourcePath || !fs.existsSync(resourcePath)) {
      console.error(`[DOWNLOAD] File not found for resource ${resource._id}. Tried: ${JSON.stringify(candidates)}`);
      return res.status(404).json({
        success: false,
        error: 'File no longer exists on server',
        debug: process.env.NODE_ENV !== 'production' ? { fileUrl: resource.fileUrl, tried: candidates } : undefined,
      });
    }

    console.log(`[DOWNLOAD] Serving file: ${resourcePath}`);

    // ── Build download filename ───────────────────────────────────────────────
    const storedFilename = path.basename(resourcePath).replace(/\.gz$/i, '');
    const ext = path.extname(storedFilename);
    const safeTitle = resource.title.replace(/[^a-zA-Z0-9.-]/g, '_');
    const originalFilename = `${safeTitle}${ext || '.txt'}`;

    // ── Determine content type safely ─────────────────────────────────────────
    let contentType = resource.fileType || 'application/octet-stream';
    if (contentType === 'application/gzip' && !originalFilename.endsWith('.gz')) {
      if (originalFilename.endsWith('.md')) contentType = 'text/markdown';
      else if (originalFilename.endsWith('.pdf')) contentType = 'application/pdf';
      else if (originalFilename.endsWith('.txt')) contentType = 'text/plain';
      else if (originalFilename.endsWith('.docx')) contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      else if (originalFilename.endsWith('.pptx')) contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      else contentType = 'application/octet-stream';
    }

    const disposition = req.query.preview === 'true' ? 'inline' : 'attachment';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${originalFilename}"`);

    // ── Stream the file, decompressing if needed ──────────────────────────────
    const isCompressed = resource.compressed || resourcePath.endsWith('.gz');
    const readStream = fs.createReadStream(resourcePath);
    readStream.on('error', (err) => next(err));

    if (isCompressed) {
      const zlib = require('zlib');
      const gunzip = zlib.createGunzip();
      gunzip.on('error', (err) => next(err));
      readStream.pipe(gunzip).pipe(res);
    } else {
      readStream.pipe(res);
    }
  } catch (err) {
    next(err);
  }
};

module.exports = { upload, list, getById, remove, download };
