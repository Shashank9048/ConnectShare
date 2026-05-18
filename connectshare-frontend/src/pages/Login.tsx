import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { useToast } from '../hooks/useToast';
import { Loader2 } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { setUser, setAccessToken } = useAuthStore();
  const { addToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data } = await api.post('/api/v1/auth/login', { email, password });
      setUser(data.data.user);
      setAccessToken(data.data.accessToken);
      addToast('Login successful', 'success');
      navigate('/dashboard');
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Invalid credentials', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <motion.div
        initial={{ y: 10, scale: 0.985 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="glass-card w-full max-w-[440px] p-8 sm:p-10"
      >
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-text-primary mb-2">Welcome Back</h1>
          <p className="text-text-muted">Sign in to ConnectShare</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative">
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="peer w-full bg-transparent border-b-2 border-border-color px-0 py-2 text-text-primary focus:outline-none focus:border-primary placeholder-transparent transition-colors"
              placeholder="Email"
              required
            />
            <label
              htmlFor="email"
              className="absolute left-0 -top-3.5 text-text-muted text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:top-2 peer-focus:-top-3.5 peer-focus:text-sm peer-focus:text-primary"
            >
              Email Address
            </label>
          </div>

          <div className="relative">
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="peer w-full bg-transparent border-b-2 border-border-color px-0 py-2 text-text-primary focus:outline-none focus:border-primary placeholder-transparent transition-colors"
              placeholder="Password"
              required
            />
            <label
              htmlFor="password"
              className="absolute left-0 -top-3.5 text-text-muted text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:top-2 peer-focus:-top-3.5 peer-focus:text-sm peer-focus:text-primary"
            >
              Password
            </label>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary hover:bg-primary-hover text-white rounded-lg py-3 font-medium transition-colors flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
          </button>
        </form>

        <p className="mt-6 text-center text-text-muted text-sm">
          Don't have an account?{' '}
          <Link to="/register" className="text-primary hover:underline font-medium">
            Register here
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
