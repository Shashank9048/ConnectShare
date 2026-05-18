// ============================================================
// auth.middleware.js — JWT Access Token Verification
// ============================================================
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token provided',
        code: 401,
      });
    }
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    req.user = decoded; // { id, email, name, role }
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired',
        code: 401,
      });
    }
    return res.status(401).json({
      success: false,
      error: 'Invalid token',
      code: 401,
    });
  }
};

module.exports = authMiddleware;
