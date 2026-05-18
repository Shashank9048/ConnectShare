// ============================================================
// listeners.js - EventEmitter Activity Log Listeners
// Import this file in server.js to activate all listeners.
// ============================================================
const eventBus = require('./eventBus');
const ActivityLog = require('../models/ActivityLog.model');
const Notification = require('../models/Notification.model');

const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.JEST_WORKER_ID);

const writeActivityLog = async (payload) => {
  if (isTestEnv) return;
  await ActivityLog.create(payload);
};

module.exports = (io) => {
  eventBus.on('resource:uploaded', async ({ userId, resourceId, workspaceId }) => {
    try {
      await writeActivityLog({
        action: 'resource:uploaded',
        userId,
        resourceId,
        workspaceId,
      });
      console.log(`[EVENT] resource:uploaded by ${userId} in workspace ${workspaceId}`);
    } catch (err) {
      console.error('[EVENT ERROR] resource:uploaded -', err.message);
    }
  });

  eventBus.on('resource:deleted', async ({ userId, resourceId, workspaceId }) => {
    try {
      await writeActivityLog({
        action: 'resource:deleted',
        userId,
        resourceId,
        workspaceId,
      });
      console.log(`[EVENT] resource:deleted by ${userId}`);
    } catch (err) {
      console.error('[EVENT ERROR] resource:deleted -', err.message);
    }
  });

  eventBus.on('workspace:created', async ({ userId, workspaceId, workspaceName }) => {
    try {
      await writeActivityLog({
        action: 'workspace:created',
        userId,
        workspaceId,
      });
      console.log(`[EVENT] workspace:created by ${userId} -> ${workspaceId}`);
    } catch (err) {
      console.error('[EVENT ERROR] workspace:created -', err.message);
    }
  });

  eventBus.on('user:joined', async ({ userId, workspaceId }) => {
    try {
      await writeActivityLog({
        action: 'user:joined',
        userId,
        workspaceId,
      });
      console.log(`[EVENT] user:joined - user ${userId} joined workspace ${workspaceId}`);
    } catch (err) {
      console.error('[EVENT ERROR] user:joined -', err.message);
    }
  });

  eventBus.on('join:requested', async (data) => {
    const { requestId, userId, userName, workspaceId, workspaceName, adminIds, message } = data;
    console.log(`[EVENT] join:requested — ${userName} wants to join ${workspaceName}`);

    try {
      await writeActivityLog({
        action: 'join:requested',
        userId,
        workspaceId,
        metadata: { userName, workspaceName, message },
      });

      for (const adminId of adminIds) {
        if (!isTestEnv) {
          await Notification.create({
            userId: adminId,
            type: 'join:requested',
            title: 'New Join Request',
            message: `${userName} wants to join "${workspaceName}"`,
            workspaceId,
            metadata: { requestId, requestingUserId: userId, requestingUserName: userName },
            read: false,
          });
        }
        
        io.to(`user:${adminId}`).emit('notification:new', {
          type: 'join:requested',
          title: 'New Join Request',
          message: `${userName} wants to join "${workspaceName}"`,
          workspaceId: workspaceId,
          metadata: { requestId, requestingUserId: userId },
        });
        console.log(`[NOTIFY] Join request notification sent to admin: ${adminId}`);
      }
    } catch (err) {
      console.error('[EVENT] join:requested listener failed:', err.message);
    }
  });

  eventBus.on('join:approved', async (data) => {
    const { userId, userName, workspaceId, approvedBy } = data;
    try {
      if (!isTestEnv) {
        await Notification.create({
          userId,
          type: 'join:approved',
          title: 'Join Request Approved! 🎉',
          message: `${approvedBy} approved your request. You can now access the workspace.`,
          workspaceId,
          read: false,
        });
      }

      io.to(`user:${userId}`).emit('notification:new', {
        type: 'join:approved',
        title: '🎉 Join Request Approved!',
        message: `You can now access the workspace`,
        workspaceId: workspaceId,
      });

      io.to(workspaceId).emit('user:joined', {
        userId,
        userName,
      });
      console.log(`[NOTIFY] Join approved notification sent to user: ${userId}`);
    } catch (err) {
      console.error('[EVENT] join:approved listener failed:', err.message);
    }
  });

  eventBus.on('join:rejected', async (data) => {
    const { userId, workspaceId, rejectedBy } = data;
    try {
      if (!isTestEnv) {
        await Notification.create({
          userId,
          type: 'join:rejected',
          title: 'Join Request Declined',
          message: `Your request to join the workspace was declined.`,
          workspaceId,
          read: false,
        });
      }

      io.to(`user:${userId}`).emit('notification:new', {
        type: 'join:rejected',
        title: 'Join Request Declined',
        message: 'Your join request was declined',
        workspaceId: workspaceId,
      });
      console.log(`[NOTIFY] Join rejected notification sent to user: ${userId}`);
    } catch (err) {
      console.error('[EVENT] join:rejected listener failed:', err.message);
    }
  });

  console.log('EventBus listeners registered');
};
