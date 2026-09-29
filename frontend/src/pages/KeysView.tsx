import { useState, useEffect } from 'react';
import { api } from '../services/api';
import Header from '../components/Header';
import Footer from '../components/Footer';

export function KeysView() {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get<{ data: { keys: any[] } }>('/public/keys');
        setKeys(res.data.keys);
      } catch (err: any) {
        setError(err.message || 'Failed to load keys');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <Header />
      <main className="flex-grow flex items-center justify-center p-8">
        <div className="text-gray-400 font-mono">Loading public keys...</div>
      </main>
      <Footer />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <Header />
      <main className="flex-grow p-8">
        <div className="max-w-4xl mx-auto mt-8 p-4 border border-red-500/30 bg-red-500/10 text-red-400 font-mono">{error}</div>
      </main>
      <Footer />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <Header />
      <main className="flex-grow p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <h1 className="text-3xl font-display text-white uppercase tracking-wider">Public Verification Keys</h1>
          <p className="text-gray-400 font-mono text-sm">
            These Ed25519 public keys are used to cryptographically verify Hackathon Participation Records and Certificates.
          </p>
          
          {keys.length === 0 ? (
            <div className="p-4 border border-gray-700 bg-gray-800 text-gray-400 font-mono text-sm">
              No public keys found.
            </div>
          ) : (
            <div className="space-y-6">
              {keys.map(k => (
                <div key={k.kid} className="bg-gray-800/50 border border-gray-700 p-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <h3 className="text-cyan-400 font-mono text-sm uppercase tracking-wider">Key ID</h3>
                      <div className="text-gray-200 font-mono text-sm break-all">{k.kid}</div>
                    </div>
                    {k.retired_at ? (
                      <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs font-mono border border-red-500/30">RETIRED</span>
                    ) : (
                      <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs font-mono border border-green-500/30">ACTIVE</span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs text-gray-500 uppercase tracking-wider font-mono">Algorithm</label>
                      <div className="text-gray-200 font-mono text-sm">{k.algorithm}</div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-500 uppercase tracking-wider font-mono">Created At</label>
                      <div className="text-gray-200 font-mono text-sm">{new Date(k.created_at).toLocaleString()}</div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-gray-700">
                    <label className="text-xs text-gray-500 uppercase tracking-wider font-mono">Public Key (PEM)</label>
                    <pre className="bg-gray-900 p-4 border border-gray-700 text-gray-300 font-mono text-xs overflow-x-auto whitespace-pre">
                      {k.public_key}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
