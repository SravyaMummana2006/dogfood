import ScrollReveal from './ScrollReveal';
import { Database, Shield, LayoutDashboard, Settings2 } from 'lucide-react';

const features = [
  {
    name: 'Local-First Architecture',
    description: 'Designed to run entirely locally. Operates without internet connection once Docker images are built, ensuring the event survives network failures.',
    icon: Database,
    color: 'text-cyan-400',
    border: 'border-cyan-400/30 group-hover:border-cyan-400',
    glow: 'group-hover:shadow-[0_0_15px_rgba(0,240,255,0.15)]'
  },
  {
    name: 'Strict Server-Side Auth',
    description: 'Authentication and authorization are strictly enforced at the API layer. Business rules never rely solely on frontend validation.',
    icon: Shield,
    color: 'text-pink-500',
    border: 'border-pink-500/30 group-hover:border-pink-500',
    glow: 'group-hover:shadow-[0_0_15px_rgba(255,0,85,0.15)]'
  },
  {
    name: 'Multi-Hackathon Capable',
    description: 'The platform manages multiple events through parameterized schemas. Team sizes, visibility rules, and judging criteria are configurable per-event.',
    icon: Settings2,
    color: 'text-cyan-400',
    border: 'border-cyan-400/30 group-hover:border-cyan-400',
    glow: 'group-hover:shadow-[0_0_15px_rgba(0,240,255,0.15)]'
  },
  {
    name: 'Immutable Auditing',
    description: 'Every score change and critical action is recorded in an immutable audit log, preserving integrity throughout the event lifecycle.',
    icon: LayoutDashboard,
    color: 'text-pink-500',
    border: 'border-pink-500/30 group-hover:border-pink-500',
    glow: 'group-hover:shadow-[0_0_15px_rgba(255,0,85,0.15)]'
  },
];

export default function Features() {
  return (
    <section className="py-20 relative border-t border-white/5 bg-navy-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="text-center">
            <h2 className="text-base font-mono font-semibold tracking-wide uppercase text-cyan-400">
              Platform Architecture
            </h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-white sm:text-4xl font-display">
              Built for resilience.
            </p>
            <p className="mt-4 max-w-2xl text-xl text-gray-400 mx-auto">
              Hackathon Raptors platform enforces strict technical boundaries. No cloud dependencies. No magic.
            </p>
          </div>
        </ScrollReveal>

        <div className="mt-20">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, index) => (
              <ScrollReveal key={feature.name} delay={index * 100}>
                <div className={`group relative pt-6 bg-navy-900 border ${feature.border} p-6 h-full transition-all duration-300 ${feature.glow}`}>
                  <div className="absolute -top-6 left-6">
                    <span className="inline-flex items-center justify-center p-3 bg-navy-900 border border-white/10 shadow-lg">
                      <feature.icon className={`h-6 w-6 ${feature.color}`} aria-hidden="true" />
                    </span>
                  </div>
                  <h3 className="mt-8 text-lg font-medium text-white font-display tracking-wide">
                    {feature.name}
                  </h3>
                  <p className="mt-2 text-sm text-gray-400 font-sans leading-relaxed">
                    {feature.description}
                  </p>
                  
                  {/* Decorative corner accent */}
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-white/10 group-hover:border-white/30 transition-colors m-1" />
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
