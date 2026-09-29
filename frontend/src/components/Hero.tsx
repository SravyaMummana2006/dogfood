import Cube3D from './Cube3D';
import ScrollReveal from './ScrollReveal';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Hero() {
  return (
    <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="lg:grid lg:grid-cols-12 lg:gap-8 items-center">
          
          <div className="sm:text-center md:max-w-2xl md:mx-auto lg:col-span-6 lg:text-left">
            <ScrollReveal>
              <div className="inline-flex items-center text-gray-500 font-mono text-xs mb-8 tracking-widest uppercase">
                <span>[ UNIT / DF-01 ]</span>
                <span className="mx-4 text-cyan-400">■ SYS READY</span>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={100}>
              <h1 className="text-5xl md:text-7xl lg:text-7xl xl:text-8xl tracking-tight text-white mb-6">
                <span className="block font-display uppercase pb-1">ONE PLATFORM.</span>
                <span className="block text-pink-500 font-display uppercase mt-2 text-shadow-layered">
                  EVERY HACKATHON.
                </span>
              </h1>
            </ScrollReveal>

            <ScrollReveal delay={200}>
              <div className="mt-8 border-t border-cyan-400/20 pt-6">
                <p className="text-xs font-mono text-cyan-400 mb-4 tracking-widest uppercase">[ BRIEF / 00 ]</p>
                <p className="text-sm md:text-base font-mono text-gray-400 max-w-2xl leading-relaxed">
                  A highly scalable, self-hosted, offline-capable multi-hackathon management platform by Hackathon Raptors. 
                  Currently running live for the <span className="bg-pink-500 text-white px-1">DOGFOOD</span> event.
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={300}>
              <div className="mt-8 sm:max-w-lg sm:mx-auto sm:text-center lg:text-left lg:mx-0">
                <Link to="/dashboard" className="group relative inline-flex items-center justify-center px-8 py-3 font-mono font-medium text-navy-900 bg-cyan-400 overflow-hidden transition-all hover:bg-cyan-300 shadow-[0_0_20px_rgba(0,240,255,0.4)] tracking-wider">
                  <span className="relative flex items-center">
                    INITIALIZE DASHBOARD
                    <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </span>
                </Link>
              </div>
            </ScrollReveal>
          </div>

          <div className="mt-12 relative sm:max-w-lg sm:mx-auto lg:mt-0 lg:max-w-none lg:mx-0 lg:col-span-6 lg:flex lg:items-center">
            <ScrollReveal delay={200}>
              <Cube3D />
            </ScrollReveal>
          </div>

        </div>
      </div>
    </section>
  );
}
