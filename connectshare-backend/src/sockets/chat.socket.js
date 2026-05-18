const jwt = require('jsonwebtoken');
const Message = require('../models/Message.model');

// Track online users per workspace
const workspacePresence = new Map(); // workspaceId → Map of { userId, userName }

module.exports = (io) => {

  // Authenticate socket on connect
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token
                 || socket.handshake.headers?.authorization?.split(' ')[1];
      if (!token) return next(new Error('No token provided'));
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      socket.userId = decoded.id;
      socket.userName = decoded.name || decoded.email || 'User';
      socket.userRole = decoded.role || 'MEMBER';
      console.log(`🔌 Socket auth OK: ${socket.userName} (${socket.userId})`);
      next();
    } catch (err) {
      console.error('Socket auth failed:', err.message);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);
    console.log(`✅ Socket connected: ${socket.userId} — ${socket.userName} (joined personal room user:${socket.userId})`);

    // ── JOIN WORKSPACE ──────────────────────────────────────
    socket.on('join:workspace', async ({ workspaceId }) => {
      // Leave previous workspace if any
      if (socket.currentWorkspace) {
        socket.leave(socket.currentWorkspace);
        removePresence(socket.currentWorkspace, socket.userId);
        broadcastPresence(io, socket.currentWorkspace);
      }

      socket.join(workspaceId);
      socket.currentWorkspace = workspaceId;
      console.log(`📁 ${socket.userName} joined workspace ${workspaceId}`);

      // Add to presence
      addPresence(workspaceId, { userId: socket.userId, userName: socket.userName });
      broadcastPresence(io, workspaceId);

      // Send message history to the joining user
      try {
        const messages = await Message.find({ workspaceId })
          .sort({ createdAt: 1 })
          .limit(50)
          .populate('taggedResourceId', 'title fileType tags')
          .lean();
        
        socket.emit('messages:history', messages);
        console.log(`📜 Sent ${messages.length} history messages to ${socket.userName}`);
      } catch (err) {
        console.error('Failed to load history:', err.message);
        socket.emit('messages:history', []);
      }

      // Tell others someone joined
      socket.to(workspaceId).emit('user:joined', {
        userId: socket.userId,
        userName: socket.userName,
      });
    });

    // ── SEND MESSAGE ────────────────────────────────────────
    socket.on('message:send', async (data) => {
      console.log(`💬 message:send from ${socket.userName}:`, data);
      
      const { content, workspaceId, type = 'text', taggedResourceId = null } = data;

      if (!content?.trim() && !taggedResourceId) {
        return socket.emit('message:error', { error: 'Message cannot be empty' });
      }

      try {
        const msgData = {
          content: content?.trim() || '',
          sender: socket.userId,
          senderName: socket.userName,
          workspaceId,
          type,
        };
        if (taggedResourceId) msgData.taggedResourceId = taggedResourceId;

        const message = await Message.create(msgData);
        
        // Populate tagged resource
        await message.populate('taggedResourceId', 'title fileType tags');

        const payload = message.toObject();
        console.log(`✅ Message saved, broadcasting to workspace ${workspaceId}`);

        // Broadcast to ALL in room (including sender)
        io.to(workspaceId).emit('message:receive', payload);

      } catch (err) {
        console.error('Failed to save/send message:', err);
        socket.emit('message:error', { error: 'Failed to send message: ' + err.message });
      }
    });

    // ── DELETE MESSAGE ──────────────────────────────────────
    socket.on('message:delete', async ({ messageId, workspaceId }) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) return socket.emit('message:error', { error: 'Message not found' });
        if (message.sender !== socket.userId && socket.userRole !== 'ADMIN') {
          return socket.emit('message:error', { error: 'Not authorized' });
        }
        await Message.findByIdAndDelete(messageId);
        io.to(workspaceId).emit('message:deleted', { messageId });
      } catch (err) {
        console.error('Delete message error:', err.message);
      }
    });

    // ── PIN MESSAGE ─────────────────────────────────────────
    socket.on('message:pin', async ({ messageId, workspaceId }) => {
      try {
        const canPin = socket.userRole === 'ADMIN' || socket.userRole === 'MEMBER';
        if (!canPin) return socket.emit('message:error', { error: 'Not authorized to pin' });
        
        const message = await Message.findByIdAndUpdate(messageId,
          { pinnedBy: socket.userId, pinnedAt: new Date() },
          { new: true }
        );
        io.to(workspaceId).emit('message:pinned', { messageId, pinnedBy: socket.userName });
      } catch (err) { console.error('Pin error:', err); }
    });

    socket.on('message:unpin', async ({ messageId, workspaceId }) => {
      try {
        await Message.findByIdAndUpdate(messageId, { pinnedBy: null, pinnedAt: null });
        io.to(workspaceId).emit('message:unpinned', { messageId });
      } catch (err) { console.error('Unpin error:', err); }
    });

    // ── TYPING ─────────────────────────────────────────────
    socket.on('user:typing', ({ workspaceId }) => {
      socket.to(workspaceId).emit('user:typing', {
        userId: socket.userId,
        userName: socket.userName,
      });
    });

    socket.on('user:stop-typing', ({ workspaceId }) => {
      socket.to(workspaceId).emit('user:stop-typing', { userId: socket.userId });
    });

    // ── DISCONNECT ─────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`❌ Socket disconnected: ${socket.userName} — ${reason}`);
      if (socket.currentWorkspace) {
        removePresence(socket.currentWorkspace, socket.userId);
        broadcastPresence(io, socket.currentWorkspace);
        socket.to(socket.currentWorkspace).emit('user:left', {
          userId: socket.userId,
          userName: socket.userName,
        });
      }
    });
  });

  // Presence helpers
  function addPresence(workspaceId, user) {
    if (!workspacePresence.has(workspaceId)) {
      workspacePresence.set(workspaceId, new Map());
    }
    workspacePresence.get(workspaceId).set(user.userId, user);
  }

  function removePresence(workspaceId, userId) {
    workspacePresence.get(workspaceId)?.delete(userId);
  }

  function broadcastPresence(io, workspaceId) {
    const users = Array.from(workspacePresence.get(workspaceId)?.values() || []);
    io.to(workspaceId).emit('presence:update', { onlineUsers: users });
  }
};
