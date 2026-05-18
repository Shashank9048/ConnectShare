// ============================================================
// workspace.test.js — Workspace API Integration Tests
// ============================================================
const request = require('supertest');
const { app } = require('../server');
const prisma = require('../src/config/db.prisma');
const { connectMongoDB } = require('../src/config/db.mongo');
const mongoose = require('mongoose');

let adminToken;
let memberToken;
let workspaceId;

const ADMIN_EMAIL = `admin_ws_${Date.now()}@connectshare.test`;
const MEMBER_EMAIL = `member_ws_${Date.now()}@connectshare.test`;

beforeAll(async () => {
  await connectMongoDB();

  // Register admin
  const adminReg = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Admin User', email: ADMIN_EMAIL, password: 'TestPass123' });
  adminToken = adminReg.body.data.accessToken;

  // Register member
  const memberReg = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Member WS', email: MEMBER_EMAIL, password: 'TestPass123' });
  memberToken = memberReg.body.data.accessToken;
});

afterAll(async () => {
  try {
    if (workspaceId) {
      await prisma.workspaceMember.deleteMany({ where: { workspaceId } });
      await prisma.workspace.delete({ where: { id: workspaceId } });
    }
    await prisma.user.deleteMany({ where: { email: { contains: '@connectshare.test' } } });
  } catch (_) {}
  await mongoose.disconnect();
  await prisma.$disconnect();
});

describe('POST /api/v1/workspaces', () => {
  it('should create a workspace and return 201', async () => {
    const res = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Workspace', description: 'Integration test workspace' });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Test Workspace');
    workspaceId = res.body.data.id;
  });
});

describe('GET /api/v1/workspaces', () => {
  it('should return 200 with array of workspaces', async () => {
    const res = await request(app)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});

describe('POST /api/v1/workspaces/:id/invite', () => {
  it('should return 403 when MEMBER (not ADMIN) tries to invite', async () => {
    if (!workspaceId) return;

    const res = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/invite`)
      .set('Authorization', `Bearer ${memberToken}`) // MEMBER token
      .send({ email: 'anyone@example.com' });

    expect(res.statusCode).toBe(403);
  });

  it('should allow ADMIN to invite a user', async () => {
    if (!workspaceId) return;

    const res = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/invite`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: MEMBER_EMAIL });

    expect([200, 409]).toContain(res.statusCode); // 409 if already member
  });
});

describe('DELETE /api/v1/workspaces/:id', () => {
  it('should delete workspace as ADMIN', async () => {
    if (!workspaceId) return;

    const res = await request(app)
      .delete(`/api/v1/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect([200, 204]).toContain(res.statusCode);
    workspaceId = null; // Prevent afterAll from failing if it tries to delete again
  });
});
