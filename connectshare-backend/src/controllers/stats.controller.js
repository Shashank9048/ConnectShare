// ============================================================
// stats.controller.js — Resource Statistics Dashboard
// ============================================================
const Resource = require('../models/Resource.model');
const Message = require('../models/Message.model');
const prisma = require('../config/db.prisma');
const path = require('path');
const fs = require('fs');

// GET /api/v1/stats
const getStats = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get user's workspaces
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      select: { workspaceId: true },
    });
    const workspaceIds = memberships.map(m => m.workspaceId);

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalResources,
      aiGeneratedCount,
      resourcesThisWeek,
      messagesThisWeek,
      resourcesForSize,
    ] = await Promise.all([
      Resource.countDocuments({ workspaceId: { $in: workspaceIds } }),
      Resource.countDocuments({ workspaceId: { $in: workspaceIds }, isAIGenerated: true }),
      Resource.countDocuments({ workspaceId: { $in: workspaceIds }, createdAt: { $gte: oneWeekAgo } }),
      Message.countDocuments({ workspaceId: { $in: workspaceIds }, createdAt: { $gte: oneWeekAgo } }),
      Resource.find({ workspaceId: { $in: workspaceIds } }, 'fileSize').lean(),
    ]);

    const storageUsedBytes = resourcesForSize.reduce((acc, r) => acc + (r.fileSize || 0), 0);

    res.status(200).json({
      success: true,
      data: {
        totalResources,
        workspaceCount: workspaceIds.length,
        aiGeneratedCount,
        storageUsedBytes,
        resourcesThisWeek,
        messagesThisWeek,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getStats };
