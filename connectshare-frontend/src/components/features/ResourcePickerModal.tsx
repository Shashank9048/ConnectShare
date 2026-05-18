import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import api from '../../services/api';
import { FileText, Image as ImageIcon, Link as LinkIcon, File, X } from 'lucide-react';

interface ResourcePickerModalProps {
  workspaceId: string;
  onSelect: (resource: any) => void;
  onClose: () => void;
}

const ResourcePickerModal = ({ workspaceId, onSelect, onClose }: ResourcePickerModalProps) => {
  const { data: resources, isLoading } = useQuery({
    queryKey: ['resources-picker', workspaceId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/resources?workspaceId=${workspaceId}`);
      return res.data.data.resources;
    }
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'PDF': return <FileText size={16} className="text-error" />;
      case 'IMAGE': return <ImageIcon size={16} className="text-primary" />;
      case 'LINK': return <LinkIcon size={16} className="text-success" />;
      default: return <File size={16} className="text-text-muted" />;
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="glass-card w-full max-w-md flex flex-col max-h-[80vh] shadow-2xl overflow-hidden"
      >
        <div className="p-4 border-b border-border-color flex items-center justify-between">
          <h3 className="text-lg font-bold text-text-primary">Tag a Resource</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-bg-secondary rounded-full text-text-muted transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading ? (
            <div className="p-8 text-center text-text-muted italic">Loading resources...</div>
          ) : resources?.length > 0 ? (
            resources.map((res: any) => (
              <button
                key={res._id}
                onClick={() => onSelect(res)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-primary/10 transition-colors text-left group"
              >
                <div className="w-8 h-8 rounded bg-bg-secondary flex items-center justify-center group-hover:scale-110 transition-transform">
                  {getIcon(res.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{res.title}</p>
                  <p className="text-[10px] text-text-muted uppercase">{res.type}</p>
                </div>
              </button>
            ))
          ) : (
            <div className="p-12 text-center">
              <p className="text-text-muted text-sm">No resources available in this workspace.</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default ResourcePickerModal;
