const router = require('express').Router();
const authMiddleware = require('../middleware/auth.middleware');
const { roleMiddleware } = require('../middleware/role.middleware');
const prisma = require('../config/db.prisma');
const Resource = require('../models/Resource.model');
const Message = require('../models/Message.model');
const ActivityLog = require('../models/ActivityLog.model');
const eventBus = require('../events/eventBus');

// ── GET /api/v1/workspaces — user's workspaces ──────────
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: req.user.id },
      include: {
        workspace: {
          include: {
            _count: { select: { members: true } },
            joinRequests: {
              where: { status: 'PENDING' },
              select: { id: true },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const workspaces = memberships.map(m => ({
      ...m.workspace,
      currentUserRole: m.role,
      memberCount: m.workspace._count.members,
      pendingRequestCount: m.workspace.joinRequests.length,
    }));

    res.json({ success: true, data: workspaces });
  } catch (err) { next(err); }
});

// ── POST /api/v1/workspaces — create workspace ──────────
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { name, description = '', isPublic = true } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: 'Workspace name is required' });
    }

    const workspace = await prisma.workspace.create({
      data: {
        name: name.trim(),
        description: description.trim(),
        isPublic,
        members: {
          create: { userId: req.user.id, role: 'ADMIN' },
        },
      },
    });

    eventBus.emit('workspace:created', {
      userId: req.user.id,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
    });

    console.log(`✅ Workspace created: ${workspace.name} by ${req.user.id}`);
    res.status(201).json({ success: true, data: { ...workspace, workspace } });
  } catch (err) { next(err); }
});

// ── GET /api/v1/workspaces/discover — all public workspaces
router.get('/discover', authMiddleware, async (req, res, next) => {
  try {
    const { q = '', page = 1, limit = 12 } = req.query;
    const userId = req.user.id;

    const myMemberships = await prisma.workspaceMember.findMany({
      where: { userId },
      select: { workspaceId: true },
    });
    const myWorkspaceIds = myMemberships.map(m => m.workspaceId);

    const myRequests = await prisma.joinRequest.findMany({
      where: { userId },
      select: { workspaceId: true, status: true },
    });
    const requestMap = Object.fromEntries(myRequests.map(r => [r.workspaceId, r.status]));

    const where = {
      ...(q.trim() ? { name: { contains: q.trim(), mode: 'insensitive' } } : {}),
      isPublic: true,
    };

    const [total, workspaces] = await Promise.all([
      prisma.workspace.count({ where }),
      prisma.workspace.findMany({
        where,
        include: {
          _count: { select: { members: true } },
          members: {
            where: { role: 'ADMIN' },
            include: { user: { select: { name: true, email: true } } },
            take: 1,
          },
        },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const enriched = workspaces.map(w => ({
      id: w.id,
      name: w.name,
      description: w.description || '',
      memberCount: w._count.members,
      createdAt: w.createdAt,
      adminName: w.members[0]?.user?.name || w.members[0]?.user?.email || 'Unknown',
      isMember: myWorkspaceIds.includes(w.id),
      requestStatus: requestMap[w.id] || null,
    }));

    res.json({
      success: true,
      data: {
        workspaces: enriched,
        total,
        page: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) { next(err); }
});

// ── GET /api/v1/workspaces/:id — single workspace ───────
router.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: req.params.id },
      include: {
        members: {
          include: { user: { select: { id:true, name:true, email:true } } },
          orderBy: { role: 'asc' },
        },
        joinRequests: {
          where: { status: 'PENDING' },
          select: { id: true },
        },
        _count: { select: { members: true } },
      },
    });
    if (!workspace) return res.status(404).json({ success: false, error: 'Workspace not found' });

    const membership = workspace.members.find(m => m.userId === req.user.id);
    res.json({
      success: true,
      data: {
        ...workspace,
        currentUserRole: membership?.role || null,
        memberCount: workspace._count.members,
        pendingRequestCount: workspace.joinRequests?.length || 0,
      },
    });
  } catch (err) { next(err); }
});

// ── POST /api/v1/workspaces/:id/request-join ────────────
router.post('/:id/request-join', authMiddleware, async (req, res, next) => {
  try {
    const { id: workspaceId } = req.params;
    const userId = req.user.id;
    const { message = '' } = req.body;

    // Check workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          where: { role: 'ADMIN' },
          include: { user: { select: { id:true, name:true, email:true } } },
        },
      },
    });
    if (!workspace) return res.status(404).json({ success: false, error: 'Workspace not found' });

    // Check not already a member
    const existing = await prisma.workspaceMember.findFirst({ where: { userId, workspaceId } });
    if (existing) return res.status(400).json({ success: false, error: 'You are already a member' });

    // Upsert join request (handles duplicate gracefully)
    const request = await prisma.joinRequest.upsert({
      where: { userId_workspaceId: { userId, workspaceId } },
      create: { userId, workspaceId, status: 'PENDING', message },
      update: { status: 'PENDING', message, updatedAt: new Date() },
    });

    // Fire event so admins get real-time notification
    eventBus.emit('join:requested', {
      requestId: request.id,
      userId,
      userName: req.user.name || req.user.email,
      workspaceId,
      workspaceName: workspace.name,
      adminIds: workspace.members.map(m => m.user.id),
      message,
    });

    console.log(`📨 Join request sent: ${req.user.name} → ${workspace.name}`);

    res.status(201).json({
      success: true,
      data: { request },
      message: `Join request sent to ${workspace.name} admins`,
    });
  } catch (err) { next(err); }
});

// ── GET /api/v1/workspaces/:id/join-requests — admin view
router.get('/:id/join-requests', authMiddleware, async (req, res, next) => {
  try {
    const { id: workspaceId } = req.params;

    // Verify requester is ADMIN of this workspace
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: req.user.id, workspaceId, role: 'ADMIN' },
    });
    if (!membership) return res.status(403).json({ success: false, error: 'Admin access required' });

    const requests = await prisma.joinRequest.findMany({
      where: { workspaceId, status: 'PENDING' },
      include: {
        user: { select: { id:true, name:true, email:true, createdAt:true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`📋 ${requests.length} pending join requests for workspace ${workspaceId}`);
    res.json({ success: true, data: { requests } });
  } catch (err) { next(err); }
});

// ── PATCH /api/v1/workspaces/:id/join-requests/:requestId
router.patch('/:id/join-requests/:requestId', authMiddleware, async (req, res, next) => {
  try {
    const { id: workspaceId, requestId } = req.params;
    const { action } = req.body; // 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, error: 'action must be approve or reject' });
    }

    // Verify admin
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: req.user.id, workspaceId, role: 'ADMIN' },
    });
    if (!membership) return res.status(403).json({ success: false, error: 'Admin access required' });

    const request = await prisma.joinRequest.findUnique({
      where: { id: requestId },
      include: { user: { select: { id:true, name:true, email:true } } },
    });
    if (!request) return res.status(404).json({ success: false, error: 'Request not found' });

    // Update request status
    await prisma.joinRequest.update({
      where: { id: requestId },
      data: { status: action === 'approve' ? 'APPROVED' : 'REJECTED', updatedAt: new Date() },
    });

    if (action === 'approve') {
      // Add user to workspace
      await prisma.workspaceMember.create({
        data: { userId: request.userId, workspaceId, role: 'MEMBER' },
      });

      // Fire event for the approved user
      eventBus.emit('join:approved', {
        userId: request.userId,
        userName: request.user.name,
        workspaceId,
        approvedBy: req.user.name || req.user.email,
      });

      console.log(`✅ ${request.user.name} approved to join workspace ${workspaceId}`);
    } else {
      eventBus.emit('join:rejected', {
        userId: request.userId,
        workspaceId,
        rejectedBy: req.user.name,
      });
      console.log(`❌ ${request.user.name} rejected from workspace ${workspaceId}`);
    }

    res.json({
      success: true,
      message: `Request ${action}d successfully`,
      data: { userId: request.userId, action },
    });
  } catch (err) { next(err); }
});

// ── POST /api/v1/workspaces/:id/invite ──────────────────
router.post('/:id/invite', authMiddleware, async (req, res, next) => {
  try {
    const { email, role = 'MEMBER' } = req.body;
    const { id: workspaceId } = req.params;

    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: req.user.id, workspaceId, role: 'ADMIN' },
    });
    if (!membership) return res.status(403).json({ success: false, error: 'Admin access required' });

    const invitee = await prisma.user.findUnique({ where: { email } });
    if (!invitee) return res.status(404).json({ success: false, error: 'No user found with that email' });

    const alreadyMember = await prisma.workspaceMember.findFirst({
      where: { userId: invitee.id, workspaceId },
    });
    if (alreadyMember) return res.status(400).json({ success: false, error: 'User is already a member' });

    await prisma.workspaceMember.create({
      data: { userId: invitee.id, workspaceId, role },
    });

    eventBus.emit('user:invited', {
      userId: invitee.id,
      invitedBy: req.user.name,
      workspaceId,
    });

    res.json({ success: true, message: `${invitee.name} added to workspace` });
  } catch (err) { next(err); }
});

// ── DELETE /api/v1/workspaces/:id ───────────────────────
router.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    const { id: workspaceId } = req.params;

    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: req.user.id, workspaceId, role: 'ADMIN' },
    });
    if (!membership) return res.status(403).json({ success: false, error: 'Admin access required' });

    // Delete all related data
    await Promise.all([
      prisma.workspaceMember.deleteMany({ where: { workspaceId } }),
      prisma.joinRequest.deleteMany({ where: { workspaceId } }),
      Resource.deleteMany({ workspaceId }),
      Message.deleteMany({ workspaceId }),
      ActivityLog.deleteMany({ workspaceId }),
    ]);

    await prisma.workspace.delete({ where: { id: workspaceId } });

    res.json({ success: true, message: 'Workspace deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
