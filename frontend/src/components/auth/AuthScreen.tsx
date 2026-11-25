import {ArrowRight, Lock, Mail, ShieldCheck, User} from 'lucide-react';
import {useState} from 'react';
import {api} from '../../services/api';
import type {UserProfile} from '../../types/inventory';

interface AuthScreenProps {
  onAuthenticated: (user: UserProfile) => void;
}

export function AuthScreen({onAuthenticated}: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('siddharth.thakur@marble-ops.com');
  const [password, setPassword] = useState('password123');
  const [role, setRole] = useState('Showroom Manager');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await api.login(email, password);
        onAuthenticated(res.user);
      } else {
        const res = await api.register({name, email, password, role});
        onAuthenticated(res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoLogin() {
    setError(null);
    setLoading(true);
    try {
      const res = await api.loginDemo();
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F6F8FB] flex items-center justify-center p-6">
      <div className="w-full max-w-[440px] bg-white border border-[#E5E9F0] rounded-2xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <svg width="34" height="34" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <circle cx="18" cy="18" r="16" fill="#0F172A" />
            <path
              d="M23.5 11.5C20.5 8.8 15.2 9.1 12.6 12.2C10.4 14.8 11.5 18.2 15.2 19.3L20.4 20.8C23.1 21.6 24.1 24.4 22.3 26.4C19.8 29.1 14.7 28.8 11.9 25.9"
              stroke="#3B82F6"
              strokeWidth="4.2"
              strokeLinecap="round"
            />
            <path
              d="M19.5 7.5C24.2 8.2 28.2 12.2 28.2 17.5C28.2 21.2 26.1 24.4 23 26"
              stroke="#F97316"
              strokeWidth="4.2"
              strokeLinecap="round"
            />
          </svg>
          <div>
            <h1 className="text-[18px] font-bold text-[#0F172A] leading-tight">
              StonePulse Marble &amp; Tile Ops
            </h1>
            <p className="text-[12px] text-[#64748B]">
              Showroom, Slab Yard &amp; Godown Inventory
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg mb-6">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`flex-1 py-2 text-[12.5px] font-medium rounded-md transition-colors ${
              mode === 'login'
                ? 'bg-white text-[#0F172A] shadow-sm'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setEmail('');
              setPassword('');
              setError(null);
            }}
            className={`flex-1 py-2 text-[12.5px] font-medium rounded-md transition-colors ${
              mode === 'register'
                ? 'bg-white text-[#0F172A] shadow-sm'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-[12px] font-medium text-[#334155] mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Rajesh Agarwal"
                    className="w-full h-10 pl-9 pr-3 text-[13px] rounded-lg border border-[#E2E8F0] focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#334155] mb-1.5">
                  Shop Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full h-10 px-3 text-[13px] rounded-lg border border-[#E2E8F0] bg-white focus:outline-none focus:border-blue-500"
                >
                  <option value="Showroom Manager">Showroom Manager</option>
                  <option value="Yard Supervisor">Yard Supervisor</option>
                  <option value="Billing & Stock Clerk">Billing &amp; Stock Clerk</option>
                  <option value="Shop Owner">Shop Owner</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-[12px] font-medium text-[#334155] mb-1.5">
              Work Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="manager@marble-ops.com"
                className="w-full h-10 pl-9 pr-3 text-[13px] rounded-lg border border-[#E2E8F0] focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#334155] mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full h-10 pl-9 pr-3 text-[13px] rounded-lg border border-[#E2E8F0] focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[12px] text-[#DC2626]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-[13px] font-semibold inline-flex items-center justify-center gap-2 transition-colors"
          >
            <span>{loading ? 'Authenticating...' : mode === 'login' ? 'Sign In' : 'Create Account'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-[#F1F5F9]">
          <button
            type="button"
            disabled={loading}
            onClick={handleDemoLogin}
            className="w-full h-10 rounded-lg border border-[#E2E8F0] bg-[#FAFBFD] hover:bg-slate-100 text-[#0F172A] text-[12.5px] font-medium inline-flex items-center justify-center gap-2 transition-colors"
          >
            <ShieldCheck className="w-4 h-4 text-[#2563EB]" />
            <span>Continue as Siddharth Thakur (Demo Operator · ST)</span>
          </button>
          <p className="mt-2.5 text-[11px] text-[#64748B] text-center">
            Each operator account persists its own custom drag-and-drop widget layout.
          </p>
        </div>
      </div>
    </div>
  );
}
