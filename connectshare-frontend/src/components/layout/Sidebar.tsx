import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../store/auth.store';
import { useDarkMode } from '../../hooks/useDarkMode';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Home, Bell, ChevronLeft, ChevronRight, LogOut, Trash2, Globe } from 'lucide-react';
import { ConfirmModal } from '../ui/ConfirmModal';

export const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [deletingWorkspace, setDeletingWorkspace] = useState<any>(null);
  const { user, logout } = useAuthStore();
  const { isDark, toggle } = useDarkMode();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: workspaces } = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const res = await api.get('/api/v1/workspaces');
      return res.data.data.workspaces || res.data.data || [];
    }
  });

  const handleLogout = async () => {
    try {
      await api.post('/api/v1/auth/logout');
    } catch (_e) {
      // ignore
    }
    logout();
    navigate('/login');
  };

  const handleDeleteWorkspace = async () => {
    if (!deletingWorkspace) return;
    try {
      await api.delete(`/api/v1/workspaces/${deletingWorkspace.id}`);
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      setDeletingWorkspace(null);
      navigate('/dashboard');
    } catch (e) {
      console.error('Failed to delete workspace', e);
    }
  };

  return (
    <div
      className={`fixed md:relative z-40 flex flex-col h-screen bg-bg-card border-r border-border-color transition-all duration-300 ${
        collapsed ? 'w-[60px]' : 'w-[240px]'
      } hidden md:flex`}
    >
      <div className="flex items-center justify-between p-4 h-[60px]">
        {!collapsed && (
          <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary-hover">
            ConnectShare
          </h2>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-bg-secondary text-text-muted transition-colors mx-auto"
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col px-2 py-4 gap-6">
        {/* Workspaces List */}
        <div>
          {!collapsed && <p className="text-xs font-semibold text-text-muted uppercase px-3 mb-2">Workspaces</p>}
          <div className="space-y-1">
            {workspaces?.map((ws: any) => (
              <div key={ws.id} className="relative group/ws">
                <NavLink
                  to={`/workspace/${ws.id}`}
                  className={({ isActive }) => `
                    flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150
                    hover:scale-[1.01] hover:bg-bg-secondary pr-10
                    ${isActive ? 'border-l-[3px] border-primary bg-primary/10' : 'border-l-[3px] border-transparent'}
                  `}
                >
                  <div className="w-6 h-6 rounded bg-primary text-white flex items-center justify-center font-bold flex-shrink-0 text-xs">
                    {ws.name.charAt(0).toUpperCase()}
                  </div>
                  {!collapsed && (
                    <span className="text-sm font-medium text-text-primary truncate">{ws.name}</span>
                  )}
                </NavLink>

                {!collapsed && ws.currentUserRole === 'ADMIN' && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeletingWorkspace(ws);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-text-muted hover:text-error hover:bg-error/10 rounded-md opacity-0 group-hover/ws:opacity-100 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Nav Links */}
        <div>
          {!collapsed && <p className="text-xs font-semibold text-text-muted uppercase px-3 mb-2">Menu</p>}
          <div className="space-y-1">
            <NavLink
              to="/dashboard"
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-secondary transition-colors ${isActive ? 'text-primary bg-primary/5' : 'text-text-muted hover:text-text-primary'}`}
            >
              <Home size={20} className="flex-shrink-0" />
              {!collapsed && <span className="font-medium text-sm">Dashboard</span>}
            </NavLink>
            <NavLink
              to="/discover"
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-secondary transition-colors ${isActive ? 'text-primary bg-primary/5' : 'text-text-muted hover:text-text-primary'}`}
            >
              <Globe size={20} className="flex-shrink-0" />
              {!collapsed && <span className="font-medium text-sm">Discover</span>}
            </NavLink>
            <NavLink
              to="/activity"
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-secondary transition-colors ${isActive ? 'text-primary bg-primary/5' : 'text-text-muted hover:text-text-primary'}`}
            >
              <Bell size={20} className="flex-shrink-0" />
              {!collapsed && <span className="font-medium text-sm">Activity Log</span>}
            </NavLink>
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-border-color flex flex-col gap-2">
        <button
          onClick={toggle}
          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-secondary transition-colors text-text-muted hover:text-text-primary"
        >
          <motion.div whileTap={{ scale: 0.85 }} className="flex-shrink-0 flex items-center justify-center w-5 h-5">
            <AnimatePresence mode="wait">
              <motion.span
                key={isDark ? 'moon' : 'sun'}
                initial={{ rotate: -90, scale: 0, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                exit={{ rotate: 90, scale: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="block text-[16px] leading-none"
              >
                {isDark ? '🌙' : '☀️'}
              </motion.span>
            </AnimatePresence>
          </motion.div>
          {!collapsed && <span className="text-sm font-medium">{isDark ? 'Dark Mode' : 'Light Mode'}</span>}
        </button>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-error/10 hover:text-error transition-colors text-text-muted"
        >
          <LogOut size={20} className="flex-shrink-0" />
          {!collapsed && <span className="text-sm font-medium">Log out</span>}
        </button>

        {!collapsed && (
          <div className="flex items-center gap-3 px-3 py-2 mt-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium text-text-primary truncate">{user?.name}</span>
              <span className="text-xs text-text-muted truncate">{user?.email}</span>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!deletingWorkspace}
        title="Delete Workspace"
        message={`Are you sure you want to delete "${deletingWorkspace?.name}"? This will permanently remove all resources, messages, and activity logs. This action cannot be undone.`}
        isDanger={true}
        confirmText="Delete Workspace"
        onConfirm={handleDeleteWorkspace}
        onCancel={() => setDeletingWorkspace(null)}
      />
    </div>
  );
};
