// ============================================================
// File Utilities — Multer Config + Stream-based Compression
// Uses Node.js fs, path, zlib streams (no external lib for compression)
// ============================================================
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads');

// Ensure upload dir exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ─── Multer: store to temp location first ───────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(UPLOAD_DIR, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}_${file.originalname}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  // Allow common file types
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'application/zip',
    'application/x-zip-compressed',
    'application/javascript',
    'text/javascript',
    'text/html',
    'text/css',
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024, // 50MB
  },
});

// ─── Compress file using Node.js Streams + Zlib ─────────────
/**
 * Compresses a file with gzip and returns compression stats
 * @param {string} inputPath - Path to the original file
 * @param {string} outputPath - Path to write the compressed .gz file
 * @returns {Promise<{originalSize: number, compressedSize: number, ratio: string}>}
 */
function compressFile(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const originalSize = fs.statSync(inputPath).size;

    // ── STREAMS: Read → Gzip → Write ───────────────────────
    const readStream = fs.createReadStream(inputPath);
    const writeStream = fs.createWriteStream(outputPath);
    const gzip = zlib.createGzip({ level: zlib.constants.Z_BEST_COMPRESSION });

    readStream
      .pipe(gzip)
      .pipe(writeStream)
      .on('finish', () => {
        const compressedSize = fs.statSync(outputPath).size;
        const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

        // ── VIVA-READY: Visible compression logging ──────────
        console.log(`\n🗜️  File Compression Complete:`);
        console.log(`   Original  : ${(originalSize / 1024).toFixed(2)} KB`);
        console.log(`   Compressed: ${(compressedSize / 1024).toFixed(2)} KB`);
        console.log(`   Saved     : ${ratio}% reduction\n`);

        resolve({ originalSize, compressedSize, ratio });
      })
      .on('error', reject);

    readStream.on('error', reject);
  });
}

/**
 * Delete a file safely
 */
function deleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('Failed to delete file:', err.message);
  }
}

/**
 * Get the compressed file path for a given original filename
 */
function getCompressedPath(filename) {
  return path.join(UPLOAD_DIR, `${filename}.gz`);
}

module.exports = {
  upload,
  compressFile,
  deleteFile,
  getCompressedPath,
  UPLOAD_DIR,
};
