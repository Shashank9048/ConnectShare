const ActivityLog = require('../models/ActivityLog.model');
const prisma = require('../config/db.prisma');

const listActivity = async (req, res, next) => {
  try {
    const { workspaceId, limit = 50 } = req.query;
    
    const filter = {};
    if (workspaceId) {
      filter.workspaceId = workspaceId;
    } else {
      // Get all workspaces user is member of
      const memberships = await prisma.workspaceMember.findMany({
        where: { userId: req.user.id },
        select: { workspaceId: true }
      });
      const wsIds = memberships.map(m => m.workspaceId);
      filter.workspaceId = { $in: wsIds };
    }

    const logs = await ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('resourceId', 'title');

    // Resolve user names from PostgreSQL
    const userIds = [...new Set(logs.map(l => l.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true }
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    const enrichedLogs = logs.map(log => {
      const logObj = log.toObject();
      return {
        ...logObj,
        userName: userMap[log.userId]?.name || userMap[log.userId]?.email || 'Unknown System User',
      };
    });

    res.status(200).json({
      success: true,
      data: enrichedLogs
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { listActivity };
