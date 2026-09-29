import type { ReactNode } from 'react';
import { Terminal } from 'lucide-react';
import { Link } from 'react-router-dom';

export function AuthLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="min-h-screen bg-navy-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-grid-pattern relative overflow-hidden">
      
      {/* Background Decorative Mesh (Abstract) */}
      <div className="absolute top-0 right-0 -mt-20 -mr-20 opacity-20 pointer-events-none">
        <div className="wireframe-cube outer !w-[40rem] !h-[40rem]">
          <div className="wireframe-face cube-front" />
          <div className="wireframe-face cube-back" />
          <div className="wireframe-face cube-right" />
          <div className="wireframe-face cube-left" />
          <div className="wireframe-face cube-top" />
          <div className="wireframe-face cube-bottom" />
        </div>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <Link to="/" className="flex justify-center items-center space-x-2 group">
          <Terminal className="text-cyan-400 w-8 h-8 group-hover:text-pink-500 transition-colors" />
          <span className="font-display font-bold text-2xl tracking-widest text-white uppercase">
            Hackathon Raptors
          </span>
        </Link>
        <div className="mt-4 text-center">
          <span className="inline-flex items-center px-3 py-1 text-xs font-mono font-medium bg-pink-500/10 text-pink-500 border border-pink-500/20 tracking-widest uppercase">
            EVENT: DOGFOOD
          </span>
        </div>
        <h2 className="mt-8 text-center text-3xl font-display font-bold text-white tracking-wider uppercase">
          {title}
        </h2>
        <p className="mt-2 text-center text-sm font-mono text-cyan-400">
          [ {subtitle} ]
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-navy-800/80 backdrop-blur-xl py-8 px-4 border border-cyan-400/20 sm:rounded-none sm:px-10 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          {children}
        </div>
      </div>
    </div>
  );
}
