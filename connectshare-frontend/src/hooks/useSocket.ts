import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/auth.store';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:5001';

export interface Message {
  _id: string;
  content: string;
  sender: string;
  senderName: string;
  workspaceId: string;
  type: string;
  taggedResourceId?: any;
  createdAt: string;
  pinnedBy?: string | null;
  pinnedAt?: string | null;
}

export const useSocket = (workspaceId: string) => {
  const socketRef = useRef<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<{userId:string; userName:string}[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<{userId:string; userName:string}[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [latestNotification, setLatestNotification] = useState<any>(null);
  const token = useAuthStore(s => s.accessToken);

  useEffect(() => {
    if (!workspaceId || !token) {
      console.warn('useSocket: missing workspaceId or token', { workspaceId, hasToken: !!token });
      return;
    }

    console.log('🔌 Connecting socket to', SOCKET_URL, 'for workspace', workspaceId);

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Socket connected! ID:', socket.id);
      setIsConnected(true);
      socket.emit('join:workspace', { workspaceId });
      console.log('📤 Emitted join:workspace for', workspaceId);
    });

    socket.on('connect_error', (err) => {
      console.error('❌ Socket connect_error:', err.message, err);
      setIsConnected(false);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', reason);
      setIsConnected(false);
    });

    socket.on('messages:history', (history: Message[]) => {
      console.log('📜 Received history:', history.length, 'messages');
      setMessages(history);
    });

    socket.on('message:receive', (message: Message) => {
      console.log('📩 Received message:', message);
      setMessages(prev => {
        if (prev.find(m => m._id === message._id)) return prev;
        return [...prev, message];
      });
    });

    socket.on('message:deleted', ({ messageId }: { messageId: string }) => {
      setMessages(prev => prev.filter(m => m._id !== messageId));
    });

    socket.on('message:pinned', ({ messageId, pinnedBy }: { messageId: string, pinnedBy: string }) => {
      setMessages(prev => prev.map(m => m._id === messageId ? { ...m, pinnedBy, pinnedAt: new Date().toISOString() } : m));
    });

    socket.on('message:unpinned', ({ messageId }: { messageId: string }) => {
      setMessages(prev => prev.map(m => m._id === messageId ? { ...m, pinnedBy: null, pinnedAt: null } : m));
    });

    socket.on('user:typing', (data: {userId:string; userName:string}) => {
      setTypingUsers(prev => prev.find(u => u.userId === data.userId) ? prev : [...prev, data]);
    });

    socket.on('user:stop-typing', ({ userId }: { userId: string }) => {
      setTypingUsers(prev => prev.filter(u => u.userId !== userId));
    });

    socket.on('presence:update', ({ onlineUsers }: { onlineUsers: any[] }) => {
      setOnlineUsers(onlineUsers);
    });

    socket.on('message:error', ({ error }: { error: string }) => {
      console.error('Message error from server:', error);
    });

    socket.on('notification:new', (notification: any) => {
      console.log('🔔 New notification:', notification);
      setLatestNotification(notification);
    });

    return () => {
      console.log('🧹 Cleaning up socket for workspace', workspaceId);
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      setMessages([]);
      setTypingUsers([]);
    };
  }, [workspaceId, token]);

  const sendMessage = useCallback((content: string, extras: Record<string, any> = {}) => {
    if (!socketRef.current) {
      console.error('No socket ref');
      return;
    }
    if (!socketRef.current.connected) {
      console.error('Socket not connected, state:', socketRef.current.disconnected);
      return;
    }
    const payload = { content, workspaceId, ...extras };
    console.log('📤 Sending message:', payload);
    socketRef.current.emit('message:send', payload);
  }, [workspaceId]);

  const deleteMessage = useCallback((messageId: string) => {
    socketRef.current?.emit('message:delete', { messageId, workspaceId });
  }, [workspaceId]);

  const pinMessage = useCallback((messageId: string) => {
    socketRef.current?.emit('message:pin', { messageId, workspaceId });
  }, [workspaceId]);

  const unpinMessage = useCallback((messageId: string) => {
    socketRef.current?.emit('message:unpin', { messageId, workspaceId });
  }, [workspaceId]);

  const sendTyping = useCallback(() => {
    socketRef.current?.emit('user:typing', { workspaceId });
  }, [workspaceId]);

  const stopTyping = useCallback(() => {
    socketRef.current?.emit('user:stop-typing', { workspaceId });
  }, [workspaceId]);

  return { messages, typingUsers, onlineUsers, isConnected, latestNotification, sendMessage, deleteMessage, pinMessage, unpinMessage, sendTyping, stopTyping };
};
