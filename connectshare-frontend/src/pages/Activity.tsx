import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { FilePlus, Trash2, UserPlus, FolderPlus, Clock } from 'lucide-react';
import api from '../services/api';

export default function Activity() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['activity-logs'],
    queryFn: async () => {
      const res = await api.get('/api/v1/activity');
      return res.data.data;
    }
  });

  const getIcon = (action: string) => {
    switch (action) {
      case 'resource:uploaded': return <FilePlus size={18} className="text-primary" />;
      case 'resource:deleted': return <Trash2 size={18} className="text-error" />;
      case 'workspace:created': return <FolderPlus size={18} className="text-success" />;
      case 'user:joined': return <UserPlus size={18} className="text-warning" />;
      default: return <Clock size={18} className="text-text-muted" />;
    }
  };

  const getMessage = (log: any) => {
    const user = <span className="font-semibold text-text-primary">{log.userName}</span>;
    const resource = log.resourceId?.title ? <span className="font-semibold text-text-primary">"{log.resourceId.title}"</span> : <span className="text-text-muted italic">a resource</span>;

    switch (log.action) {
      case 'resource:uploaded': return <>{user} uploaded {resource}</>;
      case 'resource:deleted': return <>{user} deleted {resource}</>;
      case 'workspace:created': return <>{user} created a new workspace</>;
      case 'user:joined': return <>{user} joined the workspace</>;
      default: return <>{user} performed {log.action}</>;
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto h-full overflow-y-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-text-primary mb-2">Activity Feed</h1>
        <p className="text-text-muted">Track updates and changes across your workspaces.</p>
      </header>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="glass-card p-4 h-16 animate-pulse bg-bg-secondary/50" />
          ))}
        </div>
      ) : logs?.length > 0 ? (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-3"
        >
          <AnimatePresence initial={false}>
            {logs.map((log: any, idx: number) => (
              <motion.div
                key={log._id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="glass-card p-4 flex items-center gap-4 hover:bg-bg-secondary/40 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-bg-secondary flex items-center justify-center shrink-0">
                  {getIcon(log.action)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-muted leading-relaxed">
                    {getMessage(log)}
                  </p>
                  <p className="text-[11px] text-text-muted/60 mt-1 flex items-center gap-1">
                    <Clock size={10} />
                    {new Date(log.createdAt).toLocaleString()}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <div className="text-center py-20 border-2 border-dashed border-border-color rounded-2xl">
          <p className="text-text-muted italic">No activity logged yet.</p>
        </div>
      )}
    </div>
  );
}

