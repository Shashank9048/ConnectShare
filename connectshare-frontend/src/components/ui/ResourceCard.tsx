import { useState } from 'react';
import { FileText, Image as ImageIcon, Link as LinkIcon, File, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import { ConfirmModal } from './ConfirmModal';

interface ResourceProps {
  resource: {
    _id: string;
    title: string;
    type: string;
    fileType?: string;
    fileSize?: number;
    isAIGenerated?: boolean;
    url?: string;
    tags: string[];
    owner: string;
    ownerName: string;
    createdAt: string;
    similarity?: number;
  };
  onClick?: () => void;
  onDelete?: (id: string) => void;
}

const getHashColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 40%)`;
};

export const ResourceCard = ({ resource, onClick, onDelete }: ResourceProps) => {
  const { user } = useAuthStore();
  const [showConfirm, setShowConfirm] = useState(false);

  const canDelete = user?.id === resource.owner || user?.role === 'ADMIN';

  const getIcon = () => {
    switch (resource.type) {
      case 'PDF': return <FileText className="text-error" />;
      case 'IMAGE': return <ImageIcon className="text-primary" />;
      case 'LINK': return <LinkIcon className="text-success" />;
      default: return <File className="text-text-muted" />;
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirm(true);
  };



  return (
    <>
      <div 
        onClick={onClick}
        className="glass-card p-4 flex flex-col gap-4 cursor-pointer hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 group relative"
      >
        {resource.similarity !== undefined && (
          <div className="absolute top-4 right-4 text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded">
            {Math.round(resource.similarity * 100)}% Match
          </div>
        )}

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded bg-bg-secondary flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
            {getIcon()}
          </div>
          <div className="flex-1 min-w-0 pr-8">
            <h3 className="font-semibold text-text-primary truncate" title={resource.title}>
              {resource.title}
            </h3>
            <p className="text-xs text-text-muted">{resource.type}</p>
          </div>
          
          {canDelete && (
            <button
              onClick={handleDelete}
              className="p-2 text-text-muted hover:text-white hover:bg-error rounded-lg transition-all opacity-50 hover:opacity-100"
              title="Delete Resource"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>



        <div className="flex flex-wrap gap-2 flex-1 items-start">
          {resource.tags.slice(0, 4).map(tag => (
            <span 
              key={tag} 
              className="text-[10px] font-medium px-2 py-1 rounded-full text-white"
              style={{ backgroundColor: getHashColor(tag) }}
            >
              {tag}
            </span>
          ))}
          {resource.tags.length > 4 && (
            <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-bg-secondary text-text-muted">
              +{resource.tags.length - 4}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border-color mt-auto">
          <span className="text-xs text-text-muted font-medium truncate max-w-[120px]">
            {resource.ownerName || 'Unknown'}
          </span>
          <span className="text-xs text-text-muted">
            {new Date(resource.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      <ConfirmModal
        isOpen={showConfirm}
        title="Delete Resource"
        message={`Are you sure you want to delete "${resource.title}"? This action cannot be undone.`}
        isDanger={true}
        confirmText="Delete"
        onConfirm={() => {
          onDelete?.(resource._id);
          setShowConfirm(false);
        }}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
};
