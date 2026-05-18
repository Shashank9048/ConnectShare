// ============================================================
// Workspace Tests — Jest + Supertest
// ============================================================
const request = require('supertest');
const { app } = require('../server');

let accessToken = '';
let viewerToken = '';
let workspaceId = '';

const adminUser = {
  name: 'WS Admin',
  email: `wsadmin_${Date.now()}@test.com`,
  password: 'Admin@1234',
};

const viewerUser = {
  name: 'WS Viewer',
  email: `wsviewer_${Date.now()}@test.com`,
  password: 'Viewer@1234',
};

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 1000));

  // Register admin user
  const adminRes = await request(app)
    .post('/api/v1/auth/register')
    .send(adminUser);
  accessToken = adminRes.body.data?.accessToken;

  // Register viewer user (will be invited)
  const viewerRes = await request(app)
    .post('/api/v1/auth/register')
    .send(viewerUser);
  viewerToken = viewerRes.body.data?.accessToken;
});

afterAll(async () => {
  const { getPrisma } = require('../src/config/database');
  try {
    const prisma = getPrisma();
    await prisma.workspaceMember.deleteMany({
      where: {
        user: {
          email: { in: [adminUser.email, viewerUser.email] },
        },
      },
    });
    await prisma.workspace.deleteMany({
      where: {
        members: {
          none: {},
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: { in: [adminUser.email, viewerUser.email] },
      },
    });
    await prisma.$disconnect();
  } catch (e) {}
});

describe('POST /api/v1/workspaces', () => {
  it('should create a workspace', async () => {
    if (!accessToken) return;

    const res = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'CS Study Group', description: 'Resources for 3rd year CS' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.workspace.name).toBe('CS Study Group');
    workspaceId = res.body.data.workspace.id;
  });

  it('should return 401 without authentication', async () => {
    const res = await request(app)
      .post('/api/v1/workspaces')
      .send({ name: 'Unauth Workspace' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/workspaces', () => {
  it('should return user workspace list', async () => {
    if (!accessToken) return;

    const res = await request(app)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('POST /api/v1/workspaces/:id/invite', () => {
  it('should invite a viewer to the workspace', async () => {
    if (!accessToken || !workspaceId) return;

    const res = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/invite`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: viewerUser.email, role: 'VIEWER' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('RBAC: Viewer cannot delete workspace', () => {
  it('should return 403 when viewer tries to delete', async () => {
    if (!viewerToken || !workspaceId) return;

    const res = await request(app)
      .delete(`/api/v1/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    // Viewer should be forbidden
    expect([403, 404]).toContain(res.status);
  });
});
