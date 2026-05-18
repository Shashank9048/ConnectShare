import { AnimatePresence, motion } from 'framer-motion';
import { useToast } from '../../hooks/useToast';
import { CheckCircle, AlertCircle, Info } from 'lucide-react';

export const ToastContainer = () => {
  const { toasts } = useToast();

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className={`glass-card p-4 flex items-center gap-3 min-w-[300px] shadow-lg ${
              toast.type === 'error' ? 'border-error/50 bg-error/10' :
              toast.type === 'success' ? 'border-success/50 bg-success/10' :
              'border-primary/50 bg-primary/10'
            }`}
          >
            {toast.type === 'success' && <CheckCircle className="text-success w-5 h-5" />}
            {toast.type === 'error' && <AlertCircle className="text-error w-5 h-5" />}
            {toast.type === 'info' && <Info className="text-primary w-5 h-5" />}
            <span className="text-text-primary text-sm font-medium">{toast.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
