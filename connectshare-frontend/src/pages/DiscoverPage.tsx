import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Users, Loader2, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../hooks/useToast';

interface PublicWorkspace {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  createdAt: string;
  adminName: string;
  isMember: boolean;
  requestStatus: string | null; // PENDING, APPROVED, REJECTED
}

export const DiscoverPage = () => {
  const [workspaces, setWorkspaces] = useState<PublicWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const { addToast } = useToast();
  const navigate = useNavigate();

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedWs, setSelectedWs] = useState<PublicWorkspace | null>(null);
  const [joinMessage, setJoinMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    fetchPublicWorkspaces();
  }, [debouncedSearch]);

  const fetchPublicWorkspaces = async () => {
    try {
      const res = await api.get(`/api/v1/workspaces/discover?q=${debouncedSearch}`);
      setWorkspaces(res.data.data.workspaces || res.data.data);
    } catch (_e) {
      addToast('Failed to load public workspaces', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openJoinModal = (ws: PublicWorkspace) => {
    setSelectedWs(ws);
    setJoinMessage('');
    setModalOpen(true);
  };

  const handleSendRequest = async () => {
    if (!selectedWs) return;
    setSubmitting(true);
    try {
      await api.post(`/api/v1/workspaces/${selectedWs.id}/request-join`, { message: joinMessage });
      addToast('Join request sent! The admin will review your request.', 'success');
      setWorkspaces(prev => prev.map(w => w.id === selectedWs.id ? { ...w, requestStatus: 'PENDING' } : w));
      setModalOpen(false);
    } catch (e: any) {
      addToast(e.response?.data?.error || 'Failed to send request', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const getButtonProps = (ws: PublicWorkspace) => {
    if (ws.isMember) {
      return { text: '✓ Member', className: 'bg-success/10 text-success cursor-default', disabled: true };
    }
    if (ws.requestStatus === 'PENDING') {
      return { text: '⏳ Pending', className: 'bg-warning/10 text-warning cursor-default', disabled: true, title: 'Request sent' };
    }
    if (ws.requestStatus === 'REJECTED') {
      return { text: 'Request Again', className: 'bg-bg-secondary text-text-muted hover:bg-bg-secondary-hover', disabled: false };
    }
    return { text: 'Request to Join', className: 'bg-indigo-600 hover:bg-indigo-500 text-white', disabled: false };
  };

  if (loading && !workspaces.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-primary w-12 h-12" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-10">
      <div className="mb-10 text-center">
        <motion.div 
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-500/10 text-indigo-500 mb-6 shadow-glow"
        >
          <Globe size={32} />
        </motion.div>
        <motion.h1 
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="text-4xl md:text-5xl font-black text-text-primary mb-4"
        >
          Discover <span className="text-indigo-500">Workspaces</span>
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="text-text-muted text-lg max-w-2xl mx-auto"
        >
          Find and join public communities to collaborate, share resources, and learn together.
        </motion.p>
      </div>

      <div className="max-w-2xl mx-auto mb-10">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
          <input 
            type="text" 
            placeholder="Search public workspaces..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-bg-secondary border border-border-color rounded-2xl py-4 pl-12 pr-4 text-text-primary focus:outline-none focus:border-indigo-500 shadow-sm"
          />
        </div>
      </div>

      {workspaces.length === 0 ? (
        <div className="text-center py-20 bg-bg-secondary/30 rounded-3xl border border-border-color border-dashed">
          <Globe className="mx-auto text-text-muted mb-4 opacity-50" size={48} />
          <h3 className="text-xl font-bold text-text-primary mb-2">No public workspaces found</h3>
          <p className="text-text-muted">Check back later or create your own public workspace!</p>
          <button 
            onClick={() => navigate('/dashboard')}
            className="mt-6 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-colors"
          >
            Go back to Dashboard
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workspaces.map((ws, i) => {
            const btn = getButtonProps(ws);
            return (
              <motion.div
                key={ws.id}
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
                className="glass-card p-6 flex flex-col h-full hover:border-indigo-500/50 transition-all duration-300 group bg-bg-secondary rounded-2xl border border-border-color"
              >
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xl font-bold text-text-primary line-clamp-1">{ws.name}</h3>
                    <div className="flex items-center gap-1 text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-full whitespace-nowrap">
                      <Users size={12} /> {ws.memberCount} members
                    </div>
                  </div>
                  <p className="text-text-muted text-sm line-clamp-2 mb-4">
                    {ws.description || "No description provided."}
                  </p>
                  <p className="text-text-muted text-xs mb-6">
                    Created by {ws.adminName} • {new Date(ws.createdAt).toLocaleDateString()}
                  </p>
                </div>
                
                <button
                  onClick={() => !btn.disabled && openJoinModal(ws)}
                  disabled={btn.disabled}
                  title={btn.title}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${btn.className} ${btn.disabled ? 'opacity-80' : 'hover:shadow-glow'}`}
                >
                  {btn.text}
                </button>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Join Request Modal */}
      <AnimatePresence>
        {modalOpen && selectedWs && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-bg-primary border border-border-color rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-border-color flex items-center justify-between">
                <h2 className="text-lg font-bold text-text-primary">Join {selectedWs.name}</h2>
                <button onClick={() => setModalOpen(false)} className="text-text-muted hover:text-text-primary transition">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6">
                <p className="text-sm text-text-muted mb-4">
                  Send a request to the admin to join this workspace.
                </p>
                <textarea
                  placeholder="Add a message to the admin (optional)"
                  value={joinMessage}
                  onChange={(e) => setJoinMessage(e.target.value)}
                  className="w-full h-24 bg-bg-secondary border border-border-color rounded-xl p-3 text-sm text-text-primary focus:outline-none focus:border-indigo-500 resize-none mb-6"
                />
                <button
                  onClick={handleSendRequest}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-colors disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="animate-spin" size={18} /> : 'Send Request'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
