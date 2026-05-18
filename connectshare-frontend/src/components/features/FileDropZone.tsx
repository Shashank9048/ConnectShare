import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { UploadCloud, File as FileIcon } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  workspaceId: string;
  onSuccess: () => void;
}

export const FileDropZone = ({ workspaceId, onSuccess }: Props) => {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const handleDrop = (droppedFile: File) => {
    if (droppedFile) {
      setFile(droppedFile);
      if (!title) setTitle(droppedFile.name.split('.')[0]);
    }
  };

  const handleUpload = async () => {
    if (!file || !title) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    formData.append('workspaceId', workspaceId);
    
    const tagsArray = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
    if (tagsArray.length > 0) {
      formData.append('tags', JSON.stringify(tagsArray));
    }

    try {
      await api.post('/api/v1/resources/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) {
            setProgress(Math.round((e.loaded * 100) / e.total));
          }
        }
      });
      addToast('Resource uploaded successfully', 'success');
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      onSuccess();
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Upload failed', 'error');
      setProgress(0);
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { 
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false); 
        }}
        onDrop={(e) => { 
          e.preventDefault(); 
          setIsDragging(false); 
          handleDrop(e.dataTransfer.files[0]); 
        }}
        onClick={() => !file && fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? '#6366F1' : 'var(--border)'}`,
          background: isDragging ? 'rgba(99,102,241,0.1)' : 'transparent',
          borderRadius: 12,
          padding: 40,
          textAlign: 'center',
          cursor: file ? 'default' : 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: isDragging ? '0 0 0 4px rgba(99,102,241,0.2)' : 'none',
        }}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          onChange={(e) => {
            if (e.target.files?.[0]) handleDrop(e.target.files[0]);
          }} 
        />

        {!file ? (
          <div className="flex flex-col items-center gap-3">
            <UploadCloud size={48} className="text-primary" />
            <p className="text-text-primary font-medium">Drop file here or click to browse</p>
            <p className="text-sm text-text-muted">Supports PDF, Images, and text files</p>
          </div>
        ) : (
          <motion.div initial={{ opacity:0, x:-20 }} animate={{ opacity:1, x:0 }} className="flex items-center gap-4 bg-bg-secondary p-4 rounded-lg">
            <FileIcon className="text-primary" size={32} />
            <div className="flex-1 text-left overflow-hidden">
              <p className="text-text-primary font-medium truncate">{file.name}</p>
              <p className="text-sm text-text-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); setFile(null); setProgress(0); }}
              className="text-text-muted hover:text-error transition-colors px-2"
            >
              ✕
            </button>
          </motion.div>
        )}
      </div>

      {progress > 0 && progress < 100 && (
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 4, marginTop: 12, overflow: 'hidden' }}>
          <div style={{
            height: 4, borderRadius: 4,
            background: '#6366F1',
            width: `${progress}%`,
            transition: 'width 0.3s ease'
          }} />
        </div>
      )}

      {file && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-4 pt-2">
          <div>
            <label className="block text-sm text-text-muted mb-1">Title</label>
            <input 
              type="text" 
              value={title} 
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-bg-secondary border border-border-color rounded-lg px-4 py-2 text-text-primary focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Tags (comma separated)</label>
            <input 
              type="text" 
              value={tagsInput} 
              onChange={e => setTagsInput(e.target.value)}
              placeholder="e.g. math, assignment, chapter1"
              className="w-full bg-bg-secondary border border-border-color rounded-lg px-4 py-2 text-text-primary focus:outline-none focus:border-primary"
            />
          </div>
          <button 
            onClick={handleUpload}
            disabled={!title || progress > 0}
            className="w-full bg-primary hover:bg-primary-hover text-white py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {progress > 0 ? `Uploading ${progress}%...` : 'Upload Resource'}
          </button>
        </motion.div>
      )}
    </div>
  );
};
