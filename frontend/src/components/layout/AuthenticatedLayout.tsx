import { Navigate, Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Terminal, 
  LogOut, 
  LayoutDashboard, 
  Trophy, 
  Users, 
  Send, 
  Gavel, 
  Menu,
  X
} from 'lucide-react';
import { useState } from 'react';

const NAV_ITEMS = [
  { name: 'Overview', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Hackathons', path: '/hackathons', icon: Trophy, adminOnly: true },
  { name: 'Teams', path: '/teams', icon: Users, adminOnly: true },
  { name: 'Submissions', path: '/submissions', icon: Send },
  { name: 'Judging', path: '/judging', icon: Gavel, adminOnly: true },
  { name: 'My Invitations', path: '/judging/invitations', icon: Gavel },
];

export default function AuthenticatedLayout() {
  const { user, isLoading, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-navy-900 flex items-center justify-center">
        <div className="animate-pulse flex items-center space-x-2 text-cyan-400 font-mono">
          <Terminal className="w-5 h-5" />
          <span>[ INITIALIZING ]</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <div className="min-h-screen bg-navy-900 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-white/10 bg-navy-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <Terminal className="text-cyan-400 w-5 h-5" />
          <span className="font-display font-bold text-sm tracking-widest text-white uppercase">
            DOGFOOD
          </span>
        </div>
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-gray-400 hover:text-white"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <nav className={`
        ${mobileMenuOpen ? 'flex' : 'hidden'} 
        md:flex flex-col w-full md:w-64 border-r border-white/10 bg-navy-900/95 md:bg-navy-900 
        fixed md:sticky top-[61px] md:top-0 h-[calc(100vh-61px)] md:h-screen z-40
      `}>
        {/* Branding (Desktop) */}
        <div className="hidden md:flex flex-col p-6 border-b border-white/10">
          <div className="flex items-center space-x-3 mb-2">
            <Terminal className="text-pink-500 w-6 h-6" />
            <span className="font-display font-bold text-lg tracking-widest text-white uppercase text-shadow-layered">
              RAPTORS
            </span>
          </div>
          <span className="font-mono text-xs text-cyan-400 tracking-widest">
            [ DOGFOOD_PLATFORM ]
          </span>
        </div>

        {/* Nav Links */}
        <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.filter(item => !item.adminOnly || user?.is_admin).map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`
                  flex items-center space-x-3 px-4 py-3 text-sm font-mono tracking-wider transition-all duration-200
                  ${isActive 
                    ? 'text-cyan-400 bg-cyan-400/10 border-l-2 border-cyan-400' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border-l-2 border-transparent'}
                `}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-gray-500'}`} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>

        {/* User Account Area */}
        <div className="p-4 border-t border-white/10 bg-navy-800/50">
          <div className="mb-4 px-2">
            <div className="text-sm font-bold text-white truncate">{user.display_name}</div>
            <div className="text-xs font-mono text-gray-500 truncate mt-1">{user.email}</div>
          </div>
          <button 
            onClick={() => logout()}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-xs font-mono tracking-widest text-pink-500 hover:text-white hover:bg-pink-500/20 border border-pink-500/30 transition-all duration-200"
          >
            <LogOut className="w-3 h-3" />
            <span>DISCONNECT</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 min-h-screen bg-navy-900 bg-grid-pattern relative overflow-x-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] mix-blend-screen" />
        
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
