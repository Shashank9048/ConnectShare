const router = require('express').Router();
const authMiddleware = require('../middleware/auth.middleware');
const Message = require('../models/Message.model');

// GET message history via REST (fallback)
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const { workspaceId, limit = 50 } = req.query;
    if (!workspaceId) return res.status(400).json({ success: false, error: 'workspaceId required' });
    
    const messages = await Message.find({ workspaceId })
      .sort({ createdAt: 1 })
      .limit(Number(limit))
      .populate('taggedResourceId', 'title fileType tags')
      .lean();
    
    res.json({ success: true, data: { messages } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
