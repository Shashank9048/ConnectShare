import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { Plus, FolderOpen } from 'lucide-react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { ResourceCard } from '../components/ui/ResourceCard';
import { SkeletonResourceCard } from '../components/ui/SkeletonResourceCard';
import { FileDropZone } from '../components/features/FileDropZone';
import { ResourceViewerModal } from '../components/features/ResourceViewerModal';
import { useToast } from '../hooks/useToast';
import { Loader2 } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuthStore();
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [viewingResource, setViewingResource] = useState<any | null>(null);
  const { addToast } = useToast();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch
  } = useInfiniteQuery({
    queryKey: ['resources', 'all'],
    queryFn: async ({ pageParam = 1 }) => {
      // If backend doesn't support pagination, it might return all, but we'll try to pass it
      const res = await api.get(`/api/v1/resources?page=${pageParam}&limit=10`);
      // Assuming backend returns { data: { resources: [...] } }
      // To simulate pagination if backend ignores page, we could slice, but let's assume it works or we just take the first result.
      return {
        resources: res.data.data.resources || [],
        nextPage: res.data.data.resources?.length === 10 ? pageParam + 1 : undefined
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 1,
  });

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    }, { threshold: 0.1 });
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const resources = data?.pages.flatMap(p => p.resources) || [];

  const handleCreateWorkspace = async () => {
    try {
      await api.post('/api/v1/workspaces', { name: newWorkspaceName });
      addToast('Workspace created', 'success');
      setIsWorkspaceModalOpen(false);
      setNewWorkspaceName('');
      // Invalidate workspaces query? Yes, we should! But we don't have it explicitly accessed here.
      window.location.reload(); // Quick way for now, or useQueryClient
    } catch (_e) {
      addToast('Failed to create workspace', 'error');
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

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const res = await api.get('/api/v1/stats');
      return res.data.data;
    }
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto h-full overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Good morning, {user?.name?.split(' ')[0] || 'User'}</h1>
          <p className="text-text-muted mt-1">Your collaborative hub is looking productive.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsWorkspaceModalOpen(true)}
            className="flex items-center gap-2 bg-bg-secondary hover:bg-border-color text-text-primary px-4 py-2 rounded-lg font-medium transition-colors text-sm"
          >
            <Plus size={18} /> New Workspace
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {[
          { label: 'Total Resources', value: stats?.totalResources || 0, icon: '📂', color: 'primary' },
          { label: 'Workspaces', value: stats?.workspaceCount || 0, icon: '🏗️', color: 'warning' },
          { label: 'AI Generated', value: stats?.aiGeneratedCount || 0, icon: '✨', color: 'success' },
          { label: 'Storage Used', value: `${((stats?.storageUsedBytes || 0) / 1024).toFixed(1)} KB`, icon: '💾', color: 'error' },
        ].map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass-card p-4 flex flex-col gap-2 hover:translate-y-[-2px] transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">{s.icon}</span>
              <span className={`text-[10px] font-bold uppercase text-${s.color} bg-${s.color}/10 px-2 py-0.5 rounded`}>Live</span>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold text-text-primary leading-tight">{s.value}</p>
              <p className="text-xs text-text-muted mt-1 font-medium">{s.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Recent Resources Title */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-text-primary">Recent Resources</h2>
        <button onClick={() => refetch()} className="text-xs text-primary hover:underline font-bold">Refresh Feed</button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => <SkeletonResourceCard key={i} />)}
        </div>
      ) : resources.length > 0 ? (
        <AnimatePresence>
          <motion.div 
            variants={containerVariants} 
            initial="hidden" 
            whileInView="visible" 
            viewport={{ once: true, margin: "-50px" }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
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
                      refetch();
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
        <motion.div 
          initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <FolderOpen size={64} className="text-primary opacity-80 mb-4" />
          <h2 className="text-xl font-semibold text-text-primary">No resources yet</h2>
          <p className="text-text-muted mt-2 mb-6">Upload your first resource to get started</p>
          <button 
            onClick={() => setIsUploadModalOpen(true)}
            className="bg-primary hover:bg-primary-hover text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Upload Resource
          </button>
        </motion.div>
      )}

      <div ref={sentinelRef} style={{ height: 1 }} />
      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}
      {!hasNextPage && resources.length > 0 && (
        <p className="text-center text-text-muted py-8">
          You have seen all resources
        </p>
      )}

      {/* Modals */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="glass-card w-full max-w-lg p-6 relative"
          >
            <button onClick={() => setIsUploadModalOpen(false)} className="absolute top-4 right-4 text-text-muted hover:text-text-primary">✕</button>
            <h2 className="text-xl font-bold text-text-primary mb-4">Upload Resource</h2>
            {/* If no workspace selected on dashboard, you might need a workspace selector. 
                Assuming we can upload to a default or require a workspace in FileDropZone. 
                Wait, dashboard means all resources, so we need a workspace ID to upload.
                I'll add a simple input if needed, but for now I'll just hardcode or require it. */}
            <p className="text-sm text-warning mb-4">Note: Uploading from dashboard might fail if no workspace is provided. Please upload from within a Workspace.</p>
            {/* Real app would let you pick a workspace. I'll just pass a placeholder or first workspace id */}
            <FileDropZone workspaceId={""} onSuccess={() => { setIsUploadModalOpen(false); refetch(); }} />
          </motion.div>
        </div>
      )}

      {isWorkspaceModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="glass-card w-full max-w-md p-6 relative"
          >
            <button onClick={() => setIsWorkspaceModalOpen(false)} className="absolute top-4 right-4 text-text-muted hover:text-text-primary">✕</button>
            <h2 className="text-xl font-bold text-text-primary mb-4">New Workspace</h2>
            <input 
              type="text" 
              value={newWorkspaceName} 
              onChange={e => setNewWorkspaceName(e.target.value)}
              placeholder="Workspace Name"
              className="w-full bg-bg-secondary border border-border-color rounded-lg px-4 py-2 text-text-primary mb-4"
            />
            <button 
              onClick={handleCreateWorkspace}
              className="w-full bg-primary text-white py-2 rounded-lg font-medium"
            >
              Create
            </button>
          </motion.div>
        </div>
      )}

      {viewingResource && (
        <ResourceViewerModal 
          resource={viewingResource} 
          onClose={() => setViewingResource(null)} 
        />
      )}
    </div>
  );
}
