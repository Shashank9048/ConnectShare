import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ChatBubble = ({ message, isSelf, onDelete, canDelete, onPin, onUnpin, canPin }: any) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display:'flex', flexDirection:'column', alignItems: isSelf ? 'flex-end' : 'flex-start' }}
    >
      {!isSelf && (
        <span style={{ fontSize:11, color:'#6366F1', fontWeight:600, marginBottom:3, marginLeft:4 }}>
          {message.senderName}
        </span>
      )}
      <div style={{ position:'relative', maxWidth:'75%' }}>
        {/* Tagged resource chip */}
        {message.taggedResourceId && (
          <div style={{ padding:'6px 10px', marginBottom:4, borderRadius:6, background:'rgba(99,102,241,0.12)', border:'1px solid rgba(99,102,241,0.25)', borderLeft:'3px solid #6366F1', fontSize:12, color:'#6366F1' }}>
            📎 {message.taggedResourceId?.title || 'Tagged Resource'}
          </div>
        )}
        
        {/* Pinned label */}
        {message.pinnedBy && (
          <div style={{ fontSize:10, color:'#F59E0B', fontWeight:700, marginBottom:2, display:'flex', alignItems:'center', gap:4 }}>
            📌 Pinned by {message.pinnedBy}
          </div>
        )}

        {/* Bubble */}
        <div style={{
          padding:'9px 13px',
          borderRadius: isSelf ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          background: isSelf ? '#6366F1' : 'var(--bg-secondary)',
          color: isSelf ? '#fff' : 'var(--text-primary)',
          fontSize:14, lineHeight:1.5, wordBreak:'break-word',
          border: isSelf ? 'none' : '1px solid var(--border)',
          borderLeft: message.pinnedBy && !isSelf ? '3px solid #F59E0B' : undefined,
          borderRight: message.pinnedBy && isSelf ? '3px solid #F59E0B' : undefined,
        }}>
          {message.content || <em style={{ opacity:0.6 }}>Shared a resource</em>}
        </div>

        {/* Hover Actions */}
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity:0, scale:0.7 }}
              animate={{ opacity:1, scale:1 }}
              exit={{ opacity:0, scale:0.7 }}
              style={{
                position:'absolute', top:-8,
                [isSelf ? 'left' : 'right']: -8,
                display:'flex', gap:4,
              }}
            >
              {canPin && (
                <button
                  onClick={message.pinnedBy ? onUnpin : onPin}
                  style={{
                    width:22, height:22, borderRadius:'50%',
                    background: message.pinnedBy ? '#F59E0B' : '#E5E7EB', border:'none',
                    color: message.pinnedBy ? 'white' : '#4B5563', fontSize:11, cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    boxShadow:'0 1px 2px rgba(0,0,0,0.1)'
                  }}
                  title={message.pinnedBy ? "Unpin message" : "Pin message"}
                >📌</button>
              )}
              {canDelete && (
                <button
                  onClick={onDelete}
                  style={{
                    width:22, height:22, borderRadius:'50%',
                    background:'#EF4444', border:'none',
                    color:'white', fontSize:11, cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    boxShadow:'0 1px 2px rgba(0,0,0,0.1)'
                  }}
                  title="Delete message"
                >✕</button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <span style={{ fontSize:10, color:'var(--text-muted)', margin:'2px 4px' }}>
        {new Date(message.createdAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}
      </span>
    </div>
  );
};

export default ChatBubble;
