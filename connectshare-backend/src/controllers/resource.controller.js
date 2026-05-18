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
    const resource = await getResourceById(req.params.id);
    if (!resource || !resource.fileUrl) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const fs = require('fs');
    if (!fs.existsSync(resource.fileUrl)) {
      return res.status(404).json({ success: false, error: 'File no longer exists on server' });
    }

    const originalFilename = path.basename(resource.fileUrl).replace('.gz', '');
    
    // Determine content type safely
    let contentType = resource.fileType || 'application/octet-stream';
    if (contentType === 'application/gzip' && !originalFilename.endsWith('.gz')) {
      // Best guess for common extensions
      if (originalFilename.endsWith('.md')) contentType = 'text/markdown';
      else if (originalFilename.endsWith('.pdf')) contentType = 'application/pdf';
      else if (originalFilename.endsWith('.txt')) contentType = 'text/plain';
    }

    res.setHeader('Content-Type', contentType);
    // Use inline for previewing PDFs/text, attachment for downloads
    const disposition = req.query.preview === 'true' ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename="${originalFilename}"`);

    const readStream = fs.createReadStream(resource.fileUrl);

    if (resource.compressed || resource.fileUrl.endsWith('.gz')) {
      const zlib = require('zlib');
      const gunzip = zlib.createGunzip();
      
      // Handle errors on stream to avoid crashing
      readStream.on('error', err => next(err));
      gunzip.on('error', err => next(err));
      
      readStream.pipe(gunzip).pipe(res);
    } else {
      readStream.on('error', err => next(err));
      readStream.pipe(res);
    }
  } catch (err) {
    next(err);
  }
};

module.exports = { upload, list, getById, remove, download };
