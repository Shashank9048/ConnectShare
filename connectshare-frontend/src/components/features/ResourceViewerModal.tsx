import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Download, FileText, Brain, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';

interface ResourceViewerModalProps {
  resource: any;
  onClose: () => void;
}

export const ResourceViewerModal = ({ resource, onClose }: ResourceViewerModalProps) => {
  const token = useAuthStore(state => state.accessToken);
  const apiOrigin = (import.meta.env.VITE_API_URL || 'http://localhost:5001').replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
  const downloadUrl = resource._id
    ? `${apiOrigin}/api/v1/resources/${resource._id}/download?token=${encodeURIComponent(token || '')}`
    : '';

  const [downloadState, setDownloadState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!downloadUrl) return;

    setDownloadState('loading');
    setErrorMsg('');

    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) {
        let msg = 'File no longer exists on server';
        try {
          const json = await res.json();
          msg = json.error || msg;
        } catch {}
        setDownloadState('error');
        setErrorMsg(msg);
        return;
      }

      // Trigger browser download from the blob
      const blob = await res.blob();
      const contentDisposition = res.headers.get('Content-Disposition') || '';
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch?.[1] || resource.title || 'download';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadState('idle');
    } catch (err) {
      setDownloadState('error');
      setErrorMsg('Network error — could not reach the server. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 md:p-8">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }} 
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="bg-bg-card border border-border-color shadow-2xl rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden relative"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-6 border-b border-border-color bg-bg-secondary/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              {resource.isAIGenerated ? <Brain size={20} /> : <FileText size={20} />}
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-primary">{resource.title}</h2>
              <div className="flex gap-2 items-center text-xs text-text-muted mt-1">
                <span className="uppercase font-bold tracking-wider">{resource.fileType || 'Document'}</span>
                <span>•</span>
                <span>{new Date(resource.createdAt).toLocaleDateString()}</span>
                {resource.ownerName && (
                  <>
                    <span>•</span>
                    <span>By {resource.ownerName}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 bg-bg-secondary hover:bg-border-color text-text-muted hover:text-text-primary rounded-full transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar bg-bg-card">
          {resource.aiContent ? (
            <div className="prose prose-invert prose-indigo max-w-none">
              {/* Very basic markdown rendering for display purposes */}
              {resource.aiContent.split('\n').map((line: string, i: number) => {
                if (line.startsWith('## ')) return <h2 key={i} className="text-2xl font-bold text-text-primary mt-6 mb-3">{line.replace('## ', '')}</h2>;
                if (line.startsWith('# ')) return <h1 key={i} className="text-3xl font-bold text-text-primary mt-8 mb-4">{line.replace('# ', '')}</h1>;
                if (line.startsWith('- ')) return <li key={i} className="text-text-secondary ml-4 mb-1">{line.replace('- ', '')}</li>;
                if (line.startsWith('**') && line.endsWith('**')) return <strong key={i} className="text-text-primary">{line.replace(/\*\*/g, '')}</strong>;
                if (line.trim() === '') return <br key={i} />;
                return <p key={i} className="text-text-secondary mb-3 leading-relaxed">{line}</p>;
              })}
            </div>
          ) : resource.sourceUrl ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <ExternalLink size={40} />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-text-primary mb-2">External Web Resource</h3>
                <p className="text-text-muted max-w-md mx-auto">This resource points to an external link. Click below to open it securely in a new tab.</p>
              </div>
              <a 
                href={resource.sourceUrl} 
                target="_blank" 
                rel="noreferrer"
                className="bg-primary hover:bg-primary-hover text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-primary/20 transition-all flex items-center gap-2"
              >
                Visit Source <ExternalLink size={18} />
              </a>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
              <AnimatePresence mode="wait">
                {downloadState === 'error' ? (
                  <motion.div
                    key="error"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center text-red-400"
                  >
                    <AlertTriangle size={40} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="download"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center text-success"
                  >
                    <Download size={40} />
                  </motion.div>
                )}
              </AnimatePresence>

              <div>
                {downloadState === 'error' ? (
                  <>
                    <h3 className="text-2xl font-bold text-red-400 mb-2">Download Failed</h3>
                    <p className="text-text-muted max-w-md mx-auto">{errorMsg}</p>
                    <button
                      onClick={() => setDownloadState('idle')}
                      className="mt-3 text-sm text-primary hover:underline"
                    >
                      Try again
                    </button>
                  </>
                ) : (
                  <>
                    <h3 className="text-2xl font-bold text-text-primary mb-2">Downloadable File</h3>
                    <p className="text-text-muted max-w-md mx-auto">This is an uploaded file. Due to compression, it must be downloaded to be viewed.</p>
                  </>
                )}
              </div>

              {downloadState !== 'error' && (
                <button
                  onClick={handleDownload}
                  disabled={downloadState === 'loading'}
                  className="bg-success hover:bg-success/80 disabled:opacity-60 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-success/20 transition-all flex items-center gap-2"
                >
                  {downloadState === 'loading' ? (
                    <><Loader2 size={18} className="animate-spin" /> Downloading...</>
                  ) : (
                    <>Download File <Download size={18} /></>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

