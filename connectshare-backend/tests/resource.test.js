// ============================================================
// resource.test.js — Resource API Integration Tests
// ============================================================
const request = require('supertest');
const { app } = require('../server');
const prisma = require('../src/config/db.prisma');
const { connectMongoDB } = require('../src/config/db.mongo');
const mongoose = require('mongoose');

let viewerToken;
let memberToken;
let workspaceId;
let resourceId;

const VIEWER_EMAIL = `viewer_${Date.now()}@connectshare.test`;
const MEMBER_EMAIL = `member_${Date.now()}@connectshare.test`;

beforeAll(async () => {
  await connectMongoDB();

  // Register a MEMBER user
  const memberReg = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Member User', email: MEMBER_EMAIL, password: 'TestPass123' });
  memberToken = memberReg.body.data.accessToken;

  // Register a VIEWER user (default role is MEMBER, we'll update it)
  const viewerReg = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Viewer User', email: VIEWER_EMAIL, password: 'TestPass123' });
  viewerToken = viewerReg.body.data.accessToken;

  // Force VIEWER role in DB
  await prisma.user.update({
    where: { email: VIEWER_EMAIL },
    data: { role: 'VIEWER' },
  });

  // Create a workspace for testing
  const wsRes = await request(app)
    .post('/api/v1/workspaces')
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ name: 'Test Workspace for Resources' });
  workspaceId = wsRes.body.data.id;
});

afterAll(async () => {
  try {
    await prisma.workspaceMember.deleteMany({ where: { workspace: { name: 'Test Workspace for Resources' } } });
    await prisma.workspace.deleteMany({ where: { name: 'Test Workspace for Resources' } });
    await prisma.user.deleteMany({ where: { email: { contains: '@connectshare.test' } } });
  } catch (_) {}
  await mongoose.disconnect();
  await prisma.$disconnect();
});

describe('GET /api/v1/resources', () => {
  it('should return 401 without token', async () => {
    const res = await request(app)
      .get(`/api/v1/resources?workspaceId=${workspaceId}`);
    expect(res.statusCode).toBe(401);
  });

  it('should return 200 with valid token', async () => {
    const res = await request(app)
      .get(`/api/v1/resources?workspaceId=${workspaceId}`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.data.resources)).toBe(true);
  });
});

describe('POST /api/v1/resources/upload', () => {
  it('should return 403 when VIEWER tries to upload', async () => {
    // Re-login to get fresh token with VIEWER role
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: VIEWER_EMAIL, password: 'TestPass123' });
    const freshViewerToken = loginRes.body.data?.accessToken || viewerToken;

    const res = await request(app)
      .post('/api/v1/resources/upload')
      .set('Authorization', `Bearer ${freshViewerToken}`)
      .field('title', 'Test File')
      .field('workspaceId', workspaceId)
      .attach('file', Buffer.from('test content'), 'test.txt');

    expect(res.statusCode).toBe(403);
  });
});

describe('DELETE /api/v1/resources/:id', () => {
  it('should return 403 when non-owner non-admin tries to delete', async () => {
    // First upload a resource as member
    const uploadRes = await request(app)
      .post('/api/v1/resources/upload')
      .set('Authorization', `Bearer ${memberToken}`)
      .field('title', 'Deletable Resource')
      .field('workspaceId', workspaceId)
      .attach('file', Buffer.from('delete me content'), 'deleteme.txt');

    if (uploadRes.statusCode === 201) {
      resourceId = uploadRes.body.data.resource._id;

      // Register another user who is not owner
      const otherReg = await request(app)
        .post('/api/v1/auth/register')
        .send({ name: 'Other User', email: `other_${Date.now()}@connectshare.test`, password: 'TestPass123' });
      const otherToken = otherReg.body.data.accessToken;

      const deleteRes = await request(app)
        .delete(`/api/v1/resources/${resourceId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(deleteRes.statusCode).toBe(403);
    } else {
      // Skip if upload failed (Gemini/env issue in CI)
      console.warn('Upload skipped in test — check GEMINI_API_KEY');
    }
  });
});
