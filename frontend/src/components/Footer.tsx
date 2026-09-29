import { Terminal } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-navy-900 border-t border-white/10 pt-12 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="md:flex md:items-center md:justify-between">
          <div className="flex justify-center md:justify-start items-center space-x-2">
            <Terminal className="text-cyan-400 w-5 h-5" />
            <span className="font-display font-bold text-gray-300 tracking-widest">
              HACKATHON RAPTORS
            </span>
          </div>
          <div className="mt-8 md:mt-0">
            <p className="text-center md:text-right text-sm font-mono text-gray-500">
              &copy; 2026 Hackathon Raptors. All rights reserved.
              <br />
              <span className="text-pink-500/80">Active Event: DOGFOOD 2026</span>
            </p>
          </div>
        </div>
        
        {/* Technical Decorative Bar */}
        <div className="mt-8 grid grid-cols-12 gap-2 h-1 opacity-20">
          <div className="col-span-4 bg-cyan-400"></div>
          <div className="col-span-2 bg-pink-500"></div>
          <div className="col-span-6 bg-white/20"></div>
        </div>
      </div>
    </footer>
  );
}
