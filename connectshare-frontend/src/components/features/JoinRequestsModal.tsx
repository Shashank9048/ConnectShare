import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Check, Loader2 } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../hooks/useToast';

interface JoinRequest {
  id: string;
  userId: string;
  workspaceId: string;
  message: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

interface JoinRequestsModalProps {
  workspaceId: string;
  onClose: () => void;
  onRequestHandled?: () => void;
}

export const JoinRequestsModal = ({ workspaceId, onClose, onRequestHandled }: JoinRequestsModalProps) => {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [handlingId, setHandlingId] = useState<string | null>(null);
  const { addToast } = useToast();

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 30000);
    return () => clearInterval(interval);
  }, [workspaceId]);

  const fetchRequests = async () => {
    try {
      const res = await api.get(`/api/v1/workspaces/${workspaceId}/join-requests`);
      setRequests(res.data.data.requests || []);
    } catch {
      addToast('Failed to load join requests', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (requestId: string, action: 'approve' | 'reject') => {
    setHandlingId(requestId);
    try {
      await api.patch(`/api/v1/workspaces/${workspaceId}/join-requests/${requestId}`, { action });
      setRequests(prev => prev.filter(r => r.id !== requestId));
      addToast(action === 'approve' ? 'User approved and added to workspace' : 'Request declined', 'success');
      onRequestHandled?.();
    } catch {
      addToast(`Failed to ${action} request`, 'error');
    } finally {
      setHandlingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-bg-primary border border-border-color rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
      >
        <div className="p-4 border-b border-border-color flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold text-text-primary">Join Requests</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition p-1">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="animate-spin text-primary" size={32} />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-text-muted">No pending requests</p>
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map(req => (
                <motion.div 
                  key={req.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-bg-secondary border border-border-color rounded-xl p-4 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 font-bold flex items-center justify-center shrink-0">
                      {req.user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-text-primary truncate">{req.user.name}</div>
                      <div className="text-xs text-text-muted truncate">{req.user.email}</div>
                      {req.message && (
                        <div className="mt-2 text-sm text-text-secondary bg-bg-primary p-2 rounded border border-border-color">
                          "{req.message}"
                        </div>
                      )}
                      <div className="text-[10px] text-text-muted mt-2">
                        {new Date(req.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 w-full md:w-auto shrink-0 mt-2 md:mt-0">
                    <button
                      onClick={() => handleAction(req.id, 'reject')}
                      disabled={handlingId === req.id}
                      className="flex-1 md:flex-none px-4 py-2 bg-bg-primary hover:bg-danger/20 text-danger border border-border-color rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
                    >
                      <X size={16} className="inline mr-1" /> Reject
                    </button>
                    <button
                      onClick={() => handleAction(req.id, 'approve')}
                      disabled={handlingId === req.id}
                      className="flex-1 md:flex-none px-4 py-2 bg-success/20 hover:bg-success/30 text-success border border-success/30 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
                    >
                      {handlingId === req.id ? <Loader2 size={16} className="animate-spin inline mr-1" /> : <Check size={16} className="inline mr-1" />}
                      Approve
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
