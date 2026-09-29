import { useState, useEffect } from 'react';
import { api, ApiError } from '../services/api';
import { Trophy, Plus, FileText, Lock, Archive, AlertCircle } from 'lucide-react';

interface JudgingPolicy {
  id: string;
  name: string;
  description: string;
  status: string;
  version: number;
  created_at: string;
}

export default function JudgingPolicies({ onSelect }: { onSelect: (id: string) => void }) {
  const [policies, setPolicies] = useState<JudgingPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Create state
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const fetchPolicies = async () => {
    try {
      const res = await api.get<{ data: JudgingPolicy[] }>('/policies');
      setPolicies(res.data);
      setError('');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Failed to load policies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Policy name is required');
      return;
    }
    try {
      setCreating(true);
      const res = await api.post<{ data: JudgingPolicy }>('/policies', { name, description });
      setPolicies([res.data, ...policies]);
      setName('');
      setDescription('');
      setError('');
      onSelect(res.data.id); // Navigate to it directly
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Failed to create policy');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="text-cyan-400 font-mono animate-pulse">Loading policies...</div>;
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'DRAFT': return <FileText className="w-4 h-4 text-gray-400" />;
      case 'PUBLISHED': return <Trophy className="w-4 h-4 text-pink-500" />;
      case 'LOCKED': return <Lock className="w-4 h-4 text-red-500" />;
      case 'ARCHIVED': return <Archive className="w-4 h-4 text-gray-600" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-white uppercase tracking-wider">
            Judging Policies
          </h1>
          <p className="mt-2 text-gray-400 font-mono text-sm leading-relaxed">
            Configure scoring rubrics and evaluate conditions for hackathons.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 p-4 flex items-center space-x-3">
          <AlertCircle className="text-red-500 w-5 h-5" />
          <span className="text-red-500 font-mono text-sm">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <form onSubmit={handleCreate} className="bg-navy-800/40 border border-white/10 p-6 space-y-4">
            <h2 className="text-lg font-display text-white uppercase tracking-widest flex items-center">
              <Plus className="w-4 h-4 mr-2 text-cyan-400" /> New Policy
            </h2>
            
            <div>
              <label htmlFor="name" className="block text-xs font-mono text-gray-400 mb-1">POLICY NAME</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-navy-900 border border-white/20 px-3 py-2 text-white font-mono text-sm focus:border-cyan-400 focus:outline-none transition-colors"
                placeholder="e.g. Standard 2026"
                disabled={creating}
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-xs font-mono text-gray-400 mb-1">DESCRIPTION (OPTIONAL)</label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full bg-navy-900 border border-white/20 px-3 py-2 text-white font-mono text-sm focus:border-cyan-400 focus:outline-none transition-colors"
                disabled={creating}
              />
            </div>

            <button
              type="submit"
              disabled={creating}
              className="w-full bg-cyan-400/10 text-cyan-400 border border-cyan-400/50 py-2 font-mono text-sm hover:bg-cyan-400/20 transition-colors disabled:opacity-50"
            >
              {creating ? 'CREATING...' : 'CREATE DRAFT'}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {policies.length === 0 ? (
            <div className="text-center p-12 border border-dashed border-white/10 text-gray-500 font-mono text-sm">
              No judging policies found. Create your first draft.
            </div>
          ) : (
            policies.map((policy) => (
              <button
                key={policy.id}
                onClick={() => onSelect(policy.id)}
                className="w-full text-left bg-navy-800/40 border border-white/10 p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center hover:border-cyan-400/50 transition-colors group focus:outline-none focus:ring-2 focus:ring-cyan-400"
              >
                <div>
                  <h3 className="text-white font-display text-lg group-hover:text-cyan-400 transition-colors">
                    {policy.name}
                  </h3>
                  <div className="flex space-x-4 mt-2 font-mono text-xs text-gray-500">
                    <span>v{policy.version}</span>
                    <span>{new Date(policy.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="mt-4 sm:mt-0 flex items-center space-x-2 font-mono text-xs border border-white/10 px-3 py-1 bg-navy-900">
                  {getStatusIcon(policy.status)}
                  <span className="ml-2">{policy.status}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
