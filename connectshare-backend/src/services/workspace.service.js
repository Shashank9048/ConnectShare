// ============================================================
// workspace.service.js — Workspace CRUD Business Logic
// ============================================================
const prisma = require('../config/db.prisma');
const eventBus = require('../events/eventBus');

/**
 * Create a new workspace — creator becomes ADMIN member
 */
const createWorkspace = async ({ name, description, userId }) => {
  const workspace = await prisma.workspace.create({
    data: {
      name,
      description,
      members: {
        create: { userId, role: 'ADMIN' },
      },
    },
    include: { members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } } },
  });

  eventBus.emit('workspace:created', { userId, workspaceId: workspace.id });
  return workspace;
};

/**
 * Get all workspaces where the user is a member
 */
const getUserWorkspaces = async (userId) => {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: {
        include: {
          members: { select: { id: true, role: true, userId: true, joinedAt: true } },
        },
      },
    },
  });

  return memberships.map(m => ({
    ...m.workspace,
    myRole: m.role,
  }));
};

/**
 * Get single workspace by ID with all members + roles
 */
const getWorkspaceById = async (workspaceId) => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!workspace) {
    const err = new Error('Workspace not found');
    err.status = 404;
    throw err;
  }
  return workspace;
};

/**
 * Invite a user (by email) to a workspace as MEMBER
 */
const inviteToWorkspace = async (workspaceId, email, role = 'MEMBER') => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  // Check if already a member
  const existing = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: user.id },
  });
  if (existing) {
    const err = new Error('User is already a member');
    err.status = 409;
    throw err;
  }

  await prisma.workspaceMember.create({
    data: { workspaceId, userId: user.id, role },
  });

  eventBus.emit('user:joined', { userId: user.id, workspaceId });

  // Return updated member list
  const updated = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  return updated;
};

/**
 * Delete workspace and all member records (cascade) + all MongoDB data
 */
const deleteWorkspace = async (workspaceId) => {
  const Resource = require('../models/Resource.model');
  const Message = require('../models/Message.model');
  const ActivityLog = require('../models/ActivityLog.model');
  const fs = require('fs');

  // Delete all resource files from disk before removing DB records
  const resources = await Resource.find({ workspaceId }, 'fileUrl').lean();
  for (const r of resources) {
    if (r.fileUrl) {
      try { fs.unlinkSync(r.fileUrl); } catch (_) { /* file may not exist */ }
    }
  }

  // Delete MongoDB collections for workspace
  await Promise.all([
    Resource.deleteMany({ workspaceId }),
    Message.deleteMany({ workspaceId }),
    ActivityLog.deleteMany({ workspaceId }),
  ]);

  // Delete PostgreSQL records
  await prisma.joinRequest?.deleteMany({ where: { workspaceId } });
  await prisma.workspaceMember.deleteMany({ where: { workspaceId } });
  await prisma.workspace.delete({ where: { id: workspaceId } });
  return { deleted: true };
};

/**
 * Get all public workspaces where user is NOT a member
 */
const getPublicWorkspaces = async (userId) => {
  const workspaces = await prisma.workspace.findMany({
    where: {
      isPublic: true,
      members: { none: { userId } },
    },
    include: {
      _count: { select: { members: true } },
    },
  });
  return workspaces;
};

/**
 * Request to join a public workspace
 */
const requestToJoin = async (userId, workspaceId) => {
  const existing = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId },
  });
  if (existing) throw new Error('Already a member');

  const pending = await prisma.joinRequest?.findFirst({
    where: { workspaceId, userId, status: 'PENDING' },
  });
  if (pending) throw new Error('Request already pending');

  return prisma.joinRequest?.create({
    data: { userId, workspaceId, status: 'PENDING' },
  });
};

/**
 * Get pending join requests for a workspace
 */
const getJoinRequests = async (workspaceId) => {
  return prisma.joinRequest?.findMany({
    where: { workspaceId, status: 'PENDING' },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
};

/**
 * Approve or reject join request
 */
const handleJoinRequest = async (requestId, status) => {
  const request = await prisma.joinRequest?.update({
    where: { id: requestId },
    data: { status },
  });

  if (status === 'APPROVED') {
    await prisma.workspaceMember.create({
      data: { workspaceId: request.workspaceId, userId: request.userId, role: 'MEMBER' },
    });
    eventBus.emit('user:joined', { userId: request.userId, workspaceId: request.workspaceId });
  }
  return request;
};

module.exports = {
  createWorkspace,
  getUserWorkspaces,
  getWorkspaceById,
  inviteToWorkspace,
  deleteWorkspace,
  getPublicWorkspaces,
  requestToJoin,
  getJoinRequests,
  handleJoinRequest,
};
