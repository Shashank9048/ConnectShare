const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '../..');
const configuredUploadDir = process.env.UPLOAD_DIR || 'uploads';
const uploadDir = path.isAbsolute(configuredUploadDir)
  ? configuredUploadDir
  : path.join(backendRoot, configuredUploadDir);

const ensureUploadDir = () => {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  return uploadDir;
};

const candidatePathsForResource = (fileUrl) => {
  if (!fileUrl) return [];

  // Normalise separators to the OS-native style so path.join/existsSync work
  // correctly on Windows when a forward-slash path is stored in the DB.
  const normalised = fileUrl.replace(/\//g, path.sep).replace(/\\/g, path.sep);

  const candidates = [];
  const addCandidate = (candidate) => {
    if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
    // Also try the .gz variant if the candidate doesn't already end with .gz
    if (candidate && !candidate.endsWith('.gz')) {
      const withGz = candidate + '.gz';
      if (!candidates.includes(withGz)) candidates.push(withGz);
    }
    // Also try stripping .gz if it has one (for files stored without compression)
    if (candidate && candidate.endsWith('.gz')) {
      const withoutGz = candidate.slice(0, -3);
      if (!candidates.includes(withoutGz)) candidates.push(withoutGz);
    }
  };

  if (path.isAbsolute(normalised)) {
    addCandidate(normalised);
    // If the stored absolute path uses a different drive/user root, also try
    // resolving just the basename inside the current uploadDir.
    addCandidate(path.join(uploadDir, path.basename(normalised)));
  } else {
    const cleanRelativePath = normalised.replace(/^[/\\]+/, '');
    addCandidate(path.join(backendRoot, cleanRelativePath));

    const withoutUploadsPrefix = cleanRelativePath.replace(/^uploads[/\\]/i, '');
    addCandidate(path.join(uploadDir, withoutUploadsPrefix));
  }

  // Always try the bare basename inside uploadDir as a last resort
  addCandidate(path.join(uploadDir, path.basename(normalised)));
  return [...new Set(candidates)]; // deduplicate while preserving order
};

const resolveResourcePath = (fileUrl) => {
  const candidates = candidatePathsForResource(fileUrl);
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0] || fileUrl;
};

module.exports = {
  backendRoot,
  uploadDir,
  ensureUploadDir,
  candidatePathsForResource,
  resolveResourcePath,
};
