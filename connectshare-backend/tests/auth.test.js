// ============================================================
// auth.test.js — Auth API Integration Tests
// ============================================================
const request = require('supertest');
const { app } = require('../server');
const prisma = require('../src/config/db.prisma');
const { connectMongoDB } = require('../src/config/db.mongo');
const mongoose = require('mongoose');

const TEST_USER = {
  name: 'Test User',
  email: `testauth_${Date.now()}@connectshare.test`,
  password: 'TestPass123',
};

beforeAll(async () => {
  await connectMongoDB();
});

afterAll(async () => {
  // Cleanup test user
  try {
    await prisma.user.deleteMany({ where: { email: { contains: '@connectshare.test' } } });
  } catch (_) {}
  await mongoose.disconnect();
  await prisma.$disconnect();
});

describe('POST /api/v1/auth/register', () => {
  it('should register a new user and return 201 with accessToken', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(TEST_USER);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.email).toBe(TEST_USER.email);
    expect(res.body.data.user.password).toBeUndefined(); // never expose password
  });

  it('should return 409 for duplicate email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(TEST_USER);

    expect(res.statusCode).toBe(409);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('should login with correct credentials and return JWT', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.headers['set-cookie']).toBeDefined(); // refresh token cookie
  });

  it('should return 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_USER.email, password: 'wrongpassword' });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('should return 401 without token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.statusCode).toBe(401);
  });

  it('should return 200 with valid token and user object', async () => {
    // Login to get token
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });
    
    const token = loginRes.body.data.accessToken;

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.password).toBeUndefined();
  });
});
