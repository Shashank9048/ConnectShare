// ============================================================
// auth.controller.js — Auth Route Handlers (no business logic)
// ============================================================
const { validationResult } = require('express-validator');
const { registerUser, loginUser, refreshTokens } = require('../services/auth.service');

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

// POST /api/v1/auth/register
const register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, error: errors.array()[0].msg, code: 422 });
    }

    const { name, email, password } = req.body;
    const { user, accessToken, refreshToken } = await registerUser({ name, email, password });

    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
    res.status(201).json({
      success: true,
      message: 'Registered successfully',
      data: { user, accessToken },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/auth/login
const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, error: errors.array()[0].msg, code: 422 });
    }

    const { email, password } = req.body;
    const { user, accessToken, refreshToken } = await loginUser({ email, password });

    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: { user, accessToken },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/auth/refresh
const refresh = async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;
    if (!token) {
      return res.status(401).json({ success: false, error: 'No refresh token', code: 401 });
    }

    const { accessToken, refreshToken } = await refreshTokens(token);

    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
    res.status(200).json({
      success: true,
      message: 'Tokens refreshed',
      data: { accessToken },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/auth/logout
const logout = (req, res) => {
  res.clearCookie('refreshToken', COOKIE_OPTIONS);
  res.status(200).json({ success: true, message: 'Logged out successfully' });
};

// GET /api/v1/auth/me
const me = (req, res) => {
  res.status(200).json({
    success: true,
    data: { user: req.user },
  });
};

module.exports = { register, login, refresh, logout, me };
