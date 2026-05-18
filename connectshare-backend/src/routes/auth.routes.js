// ============================================================
// auth.routes.js — Authentication Routes
// ============================================================
const express = require('express');
const { body } = require('express-validator');
const { register, login, refresh, logout, me } = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

// Validation rules
const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

// ── Validation error collector ────────────────────────────────────────────────
const handleValidationErrors = (req, res, next) => {
  const { validationResult } = require('express-validator');
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      error: errors.array()[0].msg,
      errors: errors.array(),
      code: 422,
    });
  }
  next();
};

router.post('/register', registerValidation, handleValidationErrors, register);
router.post('/login',    loginValidation,    handleValidationErrors, login);
router.post('/refresh', refresh);
router.post('/logout', authMiddleware, logout);
router.get('/me', authMiddleware, me);

module.exports = router;
