import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { Plus, Users, MessageSquare, X, Sparkles } from 'lucide-react';
import api from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { useToast } from '../hooks/useToast';
import { useSocket } from '../hooks/useSocket';
import { ResourceCard } from '../components/ui/ResourceCard';
import { SkeletonResourceCard } from '../components/ui/SkeletonResourceCard';
import { FileDropZone } from '../components/features/FileDropZone';
import ChatPanel from '../components/features/ChatPanel';
import AIAssistantPanel from '../components/features/AIAssistantPanel';
import { ResourceViewerModal } from '../components/features/ResourceViewerModal';
import { JoinRequestsModal } from '../components/features/JoinRequestsModal';

export default function Workspace() {
  const { id } = useParams();
  const { user } = useAuthStore();
  const { addToast } = useToast();
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isRequestsModalOpen, setIsRequestsModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isChatOpenOnMobile, setIsChatOpenOnMobile] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiDefaultTab, setAiDefaultTab] = useState<'Generate' | 'Summarize' | 'Chat'>('Generate');
  const [aiDefaultResourceId, setAiDefaultResourceId] = useState<string | undefined>(undefined);
  const [viewingResource, setViewingResource] = useState<any | null>(null);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  // Fetch Workspace Details
  const { data: workspace, refetch: refetchWorkspace } = useQuery({
    queryKey: ['workspace', id],
    queryFn: async () => {
      const res = await api.get(`/api/v1/workspaces/${id}`);
      return res.data.data;
    },
    enabled: !!id
  });

  // Fetch Resources
  const { data: resources, isLoading: isLoadingResources, refetch: refetchResources } = useQuery({
    queryKey: ['resources', id],
    queryFn: async () => {
      const res = await api.get(`/api/v1/resources?workspaceId=${id}`);
      return res.data.data.resources;
    },
    enabled: !!id
  });

  // Role Logic
  const currentUserMember = workspace?.members?.find((m: any) => m.userId === user?.id);
  const role = currentUserMember?.role || 'VIEWER';

  const socketData = useSocket(id || '');
  const { latestNotification } = socketData;

  useEffect(() => {
    if (workspace) {
      setPendingRequestsCount(workspace.pendingRequestCount || 0);
    }
  }, [workspace]);

  useEffect(() => {
    if (latestNotification) {
      if (latestNotification.type === 'join:requested' && latestNotification.workspaceId === id) {
        setPendingRequestsCount(prev => prev + 1);
        addToast(`New join request from ${latestNotification.metadata?.requestingUserName || 'a user'}!`, 'info');
      }
    }
  }, [latestNotification, id, addToast]);

  const handleInvite = async () => {
    if (!inviteEmail) return;
    try {
      await api.post(`/api/v1/workspaces/${id}/invite`, { email: inviteEmail, role: 'MEMBER' });
      addToast('Invitation sent successfully', 'success');
      setInviteEmail('');
      setIsInviteModalOpen(false);
      refetchWorkspace();
    } catch (error: any) {
      addToast(error.response?.data?.error || 'User not found or already member', 'error');
    }
  };

  const containerVariants: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.08 } }
  };
  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } }
  };

  const openAIPanel = (tab: 'Generate' | 'Summarize' | 'Chat', resourceId?: string) => {
    setAiDefaultTab(tab);
    setAiDefaultResourceId(resourceId);
    setAiPanelOpen(true);
  };

  return (
    <div className="flex h-full relative overflow-hidden">
      {/* Left Content Area - 65% on Desktop */}
      <div className="flex-1 lg:w-[65%] lg:flex-none h-full overflow-y-auto p-4 md:p-8">
        
        {/* Workspace Header */}
        <div className="mb-8 bg-bg-card border border-border-color rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl md:text-3xl font-bold text-text-primary">{workspace?.name || 'Loading...'}</h1>
                {role === 'ADMIN' && <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-1 rounded">ADMIN</span>}
                {role === 'MEMBER' && <span className="bg-bg-secondary text-text-muted text-xs font-bold px-2 py-1 rounded">MEMBER</span>}
                {role === 'VIEWER' && <span className="bg-success/10 text-success text-xs font-bold px-2 py-1 rounded">VIEWER</span>}
              </div>
              <p className="text-text-muted flex items-center gap-2">
                <Users size={16} /> 
                {workspace?.members?.length || 0} Members
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button 
                onClick={() => openAIPanel('Generate')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all text-sm border-0 text-white bg-gradient-to-r from-primary to-violet-500 shadow-lg shadow-primary/20 hover:scale-[1.03]"
              >
                <Sparkles size={16} /> AI Assistant
              </button>
              {role === 'ADMIN' && (
                <button 
                  onClick={() => setIsRequestsModalOpen(true)}
                  className="relative bg-bg-secondary hover:bg-border-color text-text-primary px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                >
                  Requests
                  {pendingRequestsCount > 0 && (
                    <motion.span 
                      key={pendingRequestsCount}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-2 -right-2 bg-error text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full shadow-lg"
                    >
                      {pendingRequestsCount}
                    </motion.span>
                  )}
                </button>
              )}
              {role === 'ADMIN' && (
                <button 
                  onClick={() => setIsInviteModalOpen(true)}
                  className="bg-bg-secondary hover:bg-border-color text-text-primary px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                >
                  Invite Member
                </button>
              )}
              {(role === 'ADMIN' || role === 'MEMBER') && (
                <button 
                  onClick={() => setIsUploadModalOpen(true)}
                  className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm flex items-center gap-2"
                >
                  <Plus size={16} /> Upload Resource
                </button>
              )}
              {/* Mobile Chat Toggle Button */}
              <button 
                className="lg:hidden bg-bg-secondary p-2 rounded-lg"
                onClick={() => setIsChatOpenOnMobile(true)}
              >
                <MessageSquare size={20} className="text-primary" />
              </button>
            </div>
          </div>
        </div>

        {/* Resources Grid */}
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-4">Workspace Resources</h2>
          {isLoadingResources ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => <SkeletonResourceCard key={i} />)}
            </div>
          ) : resources?.length > 0 ? (
            <AnimatePresence>
              <motion.div 
                variants={containerVariants} 
                initial="hidden" 
                whileInView="visible" 
                viewport={{ once: true, margin: "-50px" }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {resources.map((res: any) => (
                  <motion.div key={res._id} variants={itemVariants} layout>
                    <ResourceCard 
                      resource={res} 
                      onClick={() => setViewingResource(res)}
                      onDelete={async (id) => {
                        try {
                          await api.delete(`/api/v1/resources/${id}`);
                          addToast('Resource deleted', 'success');
                          refetchResources();
                        } catch (e: any) {
                          addToast(e.response?.data?.error || 'Failed to delete resource', 'error');
                        }
                      }}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="text-center py-20 border-2 border-dashed border-border-color rounded-2xl">
              <p className="text-text-muted">No resources in this workspace yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Side Area - 35% on Desktop, Drawer on Mobile */}
      <div 
        className={`absolute lg:static top-0 right-0 h-full w-full sm:w-[400px] lg:w-[35%] lg:flex-none z-30 transition-transform duration-300 transform 
          ${isChatOpenOnMobile ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        `}
      >
        {isChatOpenOnMobile && (
          <button 
            className="lg:hidden absolute top-4 right-4 z-40 p-2 bg-bg-secondary rounded-full"
            onClick={() => setIsChatOpenOnMobile(false)}
          >
            <X size={20} className="text-text-primary" />
          </button>
        )}
        
        <ChatPanel workspaceId={id!} socketData={socketData} />
      </div>

      <AIAssistantPanel
        isOpen={aiPanelOpen}
        onClose={() => setAiPanelOpen(false)}
        workspaceId={id!}
        defaultTab={aiDefaultTab}
        defaultResourceId={aiDefaultResourceId}
        onResourceCreated={refetchResources}
      />


      {/* Modals */}
      <AnimatePresence>
        {isUploadModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-bg-card border border-border-color shadow-2xl rounded-2xl w-full max-w-lg p-6 relative"
            >
              <button 
                onClick={() => setIsUploadModalOpen(false)} 
                className="absolute right-4 top-4 text-text-muted hover:text-white transition-colors p-2"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-bold text-white mb-6">Upload Resource</h2>
              <FileDropZone 
                workspaceId={id!} 
                onSuccess={() => {
                  setIsUploadModalOpen(false);
                  refetchResources();
                }} 
              />
            </motion.div>
          </div>
        )}

        {isInviteModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-bg-card border border-border-color shadow-2xl rounded-2xl w-full max-w-md p-6 relative"
            >
              <button 
                onClick={() => setIsInviteModalOpen(false)} 
                className="absolute right-4 top-4 text-text-muted hover:text-white transition-colors p-2"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-bold text-white mb-6">Invite Member</h2>
              <div className="flex gap-2">
                <input 
                  type="email" 
                  placeholder="User's email..." 
                  value={inviteEmail} 
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="flex-1 bg-bg-secondary border border-border-color text-white px-4 py-2 rounded-xl focus:outline-none focus:border-primary transition-colors"
                />
                <button 
                  onClick={handleInvite} 
                  className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-xl font-bold shadow-lg shadow-primary/20 transition-all"
                >
                  Invite
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {viewingResource && (
          <ResourceViewerModal 
            resource={viewingResource} 
            onClose={() => setViewingResource(null)} 
          />
        )}

        {isRequestsModalOpen && (
          <JoinRequestsModal
            workspaceId={id!}
            onClose={() => setIsRequestsModalOpen(false)}
            onRequestHandled={() => {
              refetchWorkspace();
              // Depending on requirements, we can decrement the count locally or let refetchWorkspace handle it
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
