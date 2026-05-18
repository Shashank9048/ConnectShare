// ============================================================
// auth.service.js — Authentication Business Logic
// All logic called from auth.controller.js
// ============================================================
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db.prisma');

const SALT_ROUNDS = 10;

/**
 * Generate access + refresh tokens for a user payload
 */
const generateTokens = (payload) => {
  const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  });
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
  return { accessToken, refreshToken };
};

/**
 * Register new user — saves to PostgreSQL via Prisma
 * @returns {{ user, accessToken, refreshToken }}
 */
const registerUser = async ({ name, email, password }) => {
  // Check if email already exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const err = new Error('Email already registered');
    err.status = 409;
    throw err;
  }

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: { name, email, password: hashed },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  const { accessToken, refreshToken } = generateTokens({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  return { user, accessToken, refreshToken };
};

/**
 * Login user — validates credentials, returns tokens
 * @returns {{ user, accessToken, refreshToken }}
 */
const loginUser = async ({ email, password }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const payload = { id: user.id, email: user.email, name: user.name, role: user.role };
  const { accessToken, refreshToken } = generateTokens(payload);

  // Never return password
  const { password: _pw, ...safeUser } = user;
  return { user: safeUser, accessToken, refreshToken };
};

/**
 * Refresh tokens — verifies refresh token, rotates both
 * @returns {{ accessToken, refreshToken }}
 */
const refreshTokens = async (token) => {
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    const err = new Error('Invalid or expired refresh token');
    err.status = 401;
    throw err;
  }

  // Verify user still exists
  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (!user) {
    const err = new Error('User not found');
    err.status = 401;
    throw err;
  }

  const payload = { id: user.id, email: user.email, name: user.name, role: user.role };
  return generateTokens(payload);
};

module.exports = { registerUser, loginUser, refreshTokens, generateTokens };
