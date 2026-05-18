// ============================================================
// role.middleware.js - RBAC Enforcement
// ============================================================
const prisma = require('../config/db.prisma');

const ROLE_HIERARCHY = { VIEWER: 1, MEMBER: 2, ADMIN: 3 };

/**
 * roleMiddleware('ADMIN') - only ADMINs can pass
 * roleMiddleware('MEMBER') - ADMIN and MEMBER can pass
 * roleMiddleware('VIEWER') - all authenticated users can pass
 */
const roleMiddleware = (requiredRole) => async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Not authenticated', code: 401 });
  }

  try {
    const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 999;
    const workspaceId = req.params.id || req.params.workspaceId || req.body.workspaceId || req.query.workspaceId;

    if (workspaceId) {
      const membership = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: req.user.id },
        select: { role: true },
      });

      if (!membership) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          code: 403,
        });
      }

      const memberLevel = ROLE_HIERARCHY[membership.role] ?? 0;
      if (memberLevel < requiredLevel) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          code: 403,
        });
      }

      req.workspaceRole = membership.role;
      return next();
    }

    const userLevel = ROLE_HIERARCHY[req.user.role] ?? 0;
    if (userLevel < requiredLevel) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 403,
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { roleMiddleware, ROLE_HIERARCHY };
