import { Terminal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Header() {
  const { user } = useAuth();

  return (
    <header className="fixed top-0 w-full z-50 border-b border-white/10 bg-navy-900/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Brand Identity */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Terminal className="text-cyan-400 w-6 h-6" />
            <span className="font-display font-bold text-lg tracking-widest text-white uppercase">
              HACKATHON RAPTORS
            </span>
          </div>
          <div className="hidden sm:block h-4 w-px bg-white/20"></div>
          <div className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-pink-500/10 text-pink-500 border border-pink-500/20 uppercase tracking-widest">
            EVENT: DOGFOOD
          </div>
        </div>

        {/* Public Navigation */}
        <nav className="hidden md:flex items-center space-x-6 mr-6">
          <Link to="/gallery" className="text-sm font-mono text-gray-300 hover:text-cyan-400 transition-colors uppercase tracking-wider">
            Gallery
          </Link>
        </nav>

        {/* Auth Actions */}
        <div className="flex items-center space-x-4">
          {user ? (
            <Link to="/dashboard" className="text-sm font-mono bg-cyan-400/10 text-cyan-400 border border-cyan-400/30 px-4 py-2 hover:bg-cyan-400/20 transition-all uppercase tracking-wider">
              Enter Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="text-sm font-mono text-gray-300 hover:text-cyan-400 transition-colors uppercase tracking-wider">
                Login
              </Link>
              <Link to="/register" className="text-sm font-mono bg-pink-500/10 text-pink-500 border border-pink-500/30 px-4 py-2 hover:bg-pink-500/20 transition-all uppercase tracking-wider">
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
