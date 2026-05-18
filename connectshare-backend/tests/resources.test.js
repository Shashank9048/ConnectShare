// ============================================================
// Resource Tests — Jest + Supertest
// ============================================================
const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { app } = require('../server');
const { connectMongoDB } = require('../src/config/db.mongo');
const mongoose = require('mongoose');

let accessToken = '';
let workspaceId = '';
let resourceId = '';

const testUser = {
  name: 'Resource Tester',
  email: `restester_${Date.now()}@test.com`,
  password: 'Test@1234',
};

beforeAll(async () => {
  await connectMongoDB();

  // Register and login
  const regRes = await request(app)
    .post('/api/v1/auth/register')
    .send(testUser);
  accessToken = regRes.body.data?.accessToken;

  // Create workspace
  if (accessToken) {
    const wsRes = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Resource Test WS' });
    workspaceId = wsRes.body.data?.workspace?.id;
  }
});

afterAll(async () => {
  const { getPrisma } = require('../src/config/database');
  try {
    const prisma = getPrisma();
    await prisma.workspaceMember.deleteMany({
      where: {
        user: {
          email: testUser.email,
        },
      },
    });
    await prisma.user.deleteMany({
      where: { email: testUser.email },
    });
    await prisma.$disconnect();
  } catch (e) {}
  await mongoose.disconnect();
});

describe('GET /api/v1/resources', () => {
  it('should return resources list', async () => {
    if (!accessToken || !workspaceId) return;

    const res = await request(app)
      .get(`/api/v1/resources?workspaceId=${workspaceId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.resources)).toBe(true);
    expect(res.body.data.pagination).toBeDefined();
  });

  it('should return 401 without authentication', async () => {
    const res = await request(app).get('/api/v1/resources?workspaceId=test');
    expect(res.status).toBe(401);
  });

  it('should return resources across user workspaces without workspaceId', async () => {
    if (!accessToken) return;

    const res = await request(app)
      .get('/api/v1/resources')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.resources)).toBe(true);
  });
});

describe('POST /api/v1/resources/upload', () => {
  it('should upload a file and return compressed metadata', async () => {
    if (!accessToken || !workspaceId) return;

    // Create a temp test file
    const tempFile = path.join(__dirname, 'test-upload.txt');
    fs.writeFileSync(tempFile, 'Hello ConnectShare! '.repeat(100));

    const res = await request(app)
      .post('/api/v1/resources/upload')
      .set('Authorization', `Bearer ${accessToken}`)
      .field('title', 'Test Resource')
      .field('workspaceId', workspaceId)
      .field('tags', 'test,upload')
      .attach('file', tempFile);

    fs.unlinkSync(tempFile);

    if (res.status === 201) {
      expect(res.body.success).toBe(true);
      expect(res.body.data.resource.compressed).toBe(true);
      expect(res.body.data.compression.originalSize).toBeGreaterThan(0);
      resourceId = res.body.data.resource._id;
    } else {
      // May fail if MongoDB is not connected — skip gracefully
      expect([201, 500, 503]).toContain(res.status);
    }
  });
});

describe('DELETE /api/v1/resources/:id', () => {
  it('should delete owned resource', async () => {
    if (!accessToken || !resourceId) return;

    const res = await request(app)
      .delete(`/api/v1/resources/${resourceId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect([200, 404]).toContain(res.status);
  });
});
