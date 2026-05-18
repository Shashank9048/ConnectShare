import { useState, useRef, useEffect, type ChangeEvent, type KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../store/auth.store';
import ChatBubble from './ChatBubble';
import ResourcePickerModal from './ResourcePickerModal';

export const ChatPanel = ({ workspaceId, socketData }: { workspaceId: string, socketData: any }) => {
  const [input, setInput] = useState('');
  const [taggedResource, setTaggedResource] = useState<any>(null);
  const [showPicker, setShowPicker] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingRef = useRef<any>(null);
  const user = useAuthStore(s => s.user);

  const { messages, typingUsers, isConnected, sendMessage, deleteMessage, pinMessage, unpinMessage, sendTyping, stopTyping } = socketData;

  // Auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed && !taggedResource) return;
    
    sendMessage(trimmed, {
      type: taggedResource ? 'resource' : 'text',
      taggedResourceId: taggedResource?._id || undefined,
    });
    
    setInput('');
    setTaggedResource(null);
    stopTyping();
    clearTimeout(typingRef.current);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    sendTyping();
    clearTimeout(typingRef.current);
    typingRef.current = setTimeout(stopTyping, 1500);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isYesterday = (date: Date) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return date.toDateString() === yesterday.toDateString();
  };

  const groupMessagesByDate = (messages: any[]) => {
    const groups: { date: string; messages: any[] }[] = [];
    messages.forEach(msg => {
      const date = new Date(msg.createdAt);
      const dateStr = isToday(date) ? 'Today'
        : isYesterday(date) ? 'Yesterday'
        : date.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
      
      const last = groups[groups.length - 1];
      if (last && last.date === dateStr) {
        last.messages.push(msg);
      } else {
        groups.push({ date: dateStr, messages: [msg] });
      }
    });
    return groups;
  };

  const pinnedMessage = [...messages].reverse().find(m => m.pinnedBy);
  const scrollToMessage = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--bg-secondary)', borderLeft:'1px solid var(--border)' }}>

      {/* Header */}
      <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h3 style={{ color:'var(--text-primary)', margin:0, fontSize:15, fontWeight:600 }}>Workspace Chat</h3>
          <p style={{ color:'var(--text-muted)', margin:0, fontSize:12 }}>Real-time collaboration</p>
        </div>
        {/* Connection indicator */}
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color: isConnected ? '#10B981' : '#EF4444' }}>
          <div style={{ width:7, height:7, borderRadius:'50%', background: isConnected ? '#10B981' : '#EF4444', boxShadow: isConnected ? '0 0 6px #10B981' : 'none' }} />
          {isConnected ? 'Live' : 'Connecting...'}
        </div>
      </div>

      {/* Pinned message bar */}
      {pinnedMessage && (
        <div style={{
          padding:'8px 14px', borderBottom:'1px solid var(--border)',
          background:'rgba(245,158,11,0.06)',
          display:'flex', alignItems:'center', gap:10,
        }}>
          <span style={{ fontSize:14 }}>📌</span>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ fontSize:10, color:'#F59E0B', margin:'0 0 2px', fontWeight:700 }}>PINNED MESSAGE</p>
            <p style={{ fontSize:13, color:'var(--text-primary)', margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {pinnedMessage.content}
            </p>
          </div>
          <button
            onClick={() => scrollToMessage(pinnedMessage._id)}
            style={{ fontSize:11, color:'#6366F1', background:'none', border:'none', cursor:'pointer' }}
          >View</button>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:12 }}>
        {messages.length === 0 && (
          <div style={{ textAlign:'center', color:'var(--text-muted)', marginTop:40 }}>
            <div style={{ fontSize:32, marginBottom:8 }}>💬</div>
            <p style={{ fontSize:14 }}>No messages yet. Start the conversation!</p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {groupMessagesByDate(messages).map(group => (
            <div key={group.date}>
              {/* Date separator */}
              <div style={{ display:'flex', alignItems:'center', gap:10, margin:'16px 0 12px', padding:'0 4px' }}>
                <div style={{ flex:1, height:1, background:'var(--border)' }} />
                <span style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', padding:'3px 10px', background:'var(--bg-secondary)', borderRadius:20, border:'1px solid var(--border)', whiteSpace:'nowrap' }}>
                  {group.date}
                </span>
                <div style={{ flex:1, height:1, background:'var(--border)' }} />
              </div>
              {/* Messages for this date */}
              {group.messages.map(msg => (
                <motion.div
                  key={msg._id}
                  id={`msg-${msg._id}`}
                  initial={{ opacity:0, y:12, scale:0.95 }}
                  animate={{ opacity:1, y:0, scale:1 }}
                  exit={{ opacity:0, scale:0.88 }}
                  transition={{ type:'spring', stiffness:320, damping:26 }}
                  layout
                >
                  <ChatBubble
                    message={msg}
                    isSelf={msg.sender === user?.id}
                    onDelete={() => deleteMessage(msg._id)}
                    canDelete={msg.sender === user?.id || user?.role === 'ADMIN'}
                    onPin={() => pinMessage(msg._id)}
                    onUnpin={() => unpinMessage(msg._id)}
                    canPin={user?.role === 'ADMIN' || user?.role === 'MEMBER'}
                  />
                </motion.div>
              ))}
            </div>
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Typing indicator */}
      <AnimatePresence>
        {typingUsers.length > 0 && (
          <motion.div
            initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:4 }}
            style={{ padding:'4px 16px', display:'flex', alignItems:'center', gap:8 }}
          >
            <div style={{ display:'flex', gap:3, alignItems:'center' }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width:6, height:6, borderRadius:'50%',
                  background:'var(--text-muted)',
                  animation:'bounce 1.2s infinite',
                  animationDelay:`${i*0.2}s`
                }} />
              ))}
            </div>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>
              {typingUsers.map((u: { userName: string }) => u.userName).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tagged resource preview bar */}
      <AnimatePresence>
        {taggedResource && (
          <motion.div
            initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}
            style={{ margin:'0 12px', padding:'8px 12px', background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.3)', borderRadius:8, display:'flex', alignItems:'center', gap:8 }}
          >
            <span style={{ fontSize:13, color:'#6366F1' }}>📎 {taggedResource.title}</span>
            <button onClick={() => setTaggedResource(null)} style={{ marginLeft:'auto', background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:16 }}>×</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div style={{ padding:'12px', borderTop:'1px solid var(--border)', display:'flex', gap:8, alignItems:'flex-end' }}>
        <button
          onClick={() => setShowPicker(true)}
          title="Tag a resource"
          style={{ padding:'9px 10px', borderRadius:8, background:'var(--bg-card)', border:'1px solid var(--border)', color:'var(--text-muted)', cursor:'pointer', fontSize:16, flexShrink:0 }}
        >📎</button>

        <textarea
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={isConnected ? "Type a message... (Enter to send)" : "Connecting to chat..."}
          disabled={!isConnected}
          rows={1}
          style={{
            flex:1, resize:'none', padding:'9px 12px',
            background:'var(--bg-card)', border:'1px solid var(--border)',
            borderRadius:8, color:'var(--text-primary)',
            fontFamily:'Inter, sans-serif', fontSize:14, outline:'none',
            maxHeight:120, overflowY:'auto',
            opacity: isConnected ? 1 : 0.5,
          }}
        />

        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={handleSend}
          disabled={(!input.trim() && !taggedResource) || !isConnected}
          style={{
            padding:'9px 18px', borderRadius:8,
            background:(input.trim() || taggedResource) && isConnected ? '#6366F1' : 'rgba(99,102,241,0.25)',
            color:'white', border:'none', cursor:'pointer',
            fontWeight:600, fontSize:14, flexShrink:0,
            transition:'all 0.2s',
          }}
        >Send</motion.button>
      </div>

      {showPicker && (
        <ResourcePickerModal
          workspaceId={workspaceId}
          onSelect={(r) => { setTaggedResource(r); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
};

export default ChatPanel;
