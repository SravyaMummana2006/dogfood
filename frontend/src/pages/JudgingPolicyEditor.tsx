import { useState, useEffect } from 'react';
import { api, ApiError } from '../services/api';
import { ArrowLeft, Plus, Save, Trash2, CheckCircle, AlertCircle } from 'lucide-react';

interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  min_score: number;
  max_score: number;
  weight: number;
  display_order: number;
}

interface PolicyWithCriteria {
  id: string;
  name: string;
  description: string;
  status: string;
  version: number;
  criteria: RubricCriterion[];
}

export default function JudgingPolicyEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const [policy, setPolicy] = useState<PolicyWithCriteria | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Editor state for a new criterion
  const [showAdd, setShowAdd] = useState(false);
  const [newCrit, setNewCrit] = useState({ name: '', description: '', min_score: 1, max_score: 5, weight: 10, display_order: 0 });

  useEffect(() => {
    fetchPolicy();
  }, [id]);

  const fetchPolicy = async () => {
    try {
      const res = await api.get<{ data: PolicyWithCriteria }>(`/policies/${id}`);
      setPolicy(res.data);
      setError('');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Failed to load policy');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/policies/${id}/criteria`, newCrit);
      setShowAdd(false);
      setNewCrit({ name: '', description: '', min_score: 1, max_score: 5, weight: 10, display_order: 0 });
      fetchPolicy();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  const handleDelete = async (critId: string) => {
    if (!confirm('Delete this criterion?')) return;
    try {
      await api.delete(`/policies/${id}/criteria/${critId}`);
      fetchPolicy();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  const handlePublish = async () => {
    if (!confirm('Publishing will lock this policy from further changes. Continue?')) return;
    try {
      await api.post(`/policies/${id}/publish`);
      fetchPolicy();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  if (loading) return <div className="text-cyan-400 font-mono animate-pulse">Loading policy...</div>;
  if (!policy) return <div className="text-red-500 font-mono">Policy not found</div>;

  const totalWeight = policy.criteria.reduce((sum, c) => sum + c.weight, 0);
  const isDraft = policy.status === 'DRAFT';

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <button 
        onClick={onBack}
        className="flex items-center text-gray-400 hover:text-white transition-colors font-mono text-sm"
      >
        <ArrowLeft className="w-4 h-4 mr-2" /> BACK TO POLICIES
      </button>

      <div className="flex flex-col md:flex-row justify-between items-start border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-white uppercase tracking-wider">
            {policy.name}
          </h1>
          <p className="mt-2 text-gray-400 font-mono text-sm">{policy.description}</p>
        </div>
        <div className="mt-4 md:mt-0 flex flex-col items-end space-y-2">
          <div className="flex space-x-2 font-mono text-xs border border-white/10 px-3 py-1 bg-navy-900">
            <span className={isDraft ? 'text-gray-400' : 'text-pink-500'}>STATUS: {policy.status}</span>
            <span className="text-gray-600">|</span>
            <span className="text-cyan-400">v{policy.version}</span>
          </div>
          {isDraft && (
            <button
              onClick={handlePublish}
              className="bg-pink-500/10 text-pink-500 border border-pink-500/50 px-4 py-2 font-mono text-sm hover:bg-pink-500/20 transition-colors"
            >
              PUBLISH POLICY
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 p-4 flex items-center space-x-3">
          <AlertCircle className="text-red-500 w-5 h-5" />
          <span className="text-red-500 font-mono text-sm">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-display text-white uppercase tracking-widest">Rubric Criteria</h2>
            {isDraft && !showAdd && (
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center text-cyan-400 font-mono text-sm hover:text-white transition-colors"
              >
                <Plus className="w-4 h-4 mr-1" /> ADD CRITERION
              </button>
            )}
          </div>

          {showAdd && isDraft && (
            <form onSubmit={handleAdd} className="bg-navy-800/40 border border-cyan-400/50 p-6 space-y-4 relative">
              <h3 className="text-white font-mono mb-4 border-b border-white/10 pb-2">New Criterion</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-xs font-mono text-gray-400 mb-1">NAME</label>
                  <input required value={newCrit.name} onChange={e => setNewCrit({...newCrit, name: e.target.value})} className="w-full bg-navy-900 border border-white/20 px-3 py-2 text-white font-mono text-sm focus:border-cyan-400 focus:outline-none" />
                </div>
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-xs font-mono text-gray-400 mb-1">DESCRIPTION</label>
                  <input value={newCrit.description} onChange={e => setNewCrit({...newCrit, description: e.target.value})} className="w-full bg-navy-900 border border-white/20 px-3 py-2 text-white font-mono text-sm focus:border-cyan-400 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">MIN SCORE</label>
                  <input type="number" required value={newCrit.min_score} onChange={e => setNewCrit({...newCrit, min_score: parseInt(e.target.value)})} className="w-full bg-navy-900 border border-white/20 px-3 py-2 text-white font-mono text-sm focus:border-cyan-400 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">MAX SCORE</label>
                  <input type="number" required value={newCrit.max_score} onChange={e => setNewCrit({...newCrit, max_score: parseInt(e.target.value)})} className="w-full bg-navy-900 border border-white/20 px-3 py-2 text-white font-mono text-sm focus:border-cyan-400 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1">WEIGHT % (0-100)</label>
                  <input type="number" required min="0" max="100" value={newCrit.weight} onChange={e => setNewCrit({...newCrit, weight: parseInt(e.target.value)})} className="w-full bg-navy-900 border border-white/20 px-3 py-2 text-white font-mono text-sm focus:border-cyan-400 focus:outline-none" />
                </div>
              </div>
              <div className="flex justify-end space-x-4 mt-6">
                <button type="button" onClick={() => setShowAdd(false)} className="text-gray-400 font-mono text-sm hover:text-white">CANCEL</button>
                <button type="submit" className="bg-cyan-400/20 text-cyan-400 border border-cyan-400/50 px-4 py-2 font-mono text-sm hover:bg-cyan-400/30 flex items-center">
                  <Save className="w-4 h-4 mr-2" /> SAVE
                </button>
              </div>
            </form>
          )}

          {policy.criteria.length === 0 && !showAdd ? (
            <div className="text-center p-12 border border-dashed border-white/10 text-gray-500 font-mono text-sm">
              No criteria added yet.
            </div>
          ) : (
            <div className="space-y-4">
              {policy.criteria.map(crit => (
                <div key={crit.id} className="bg-navy-800/20 border border-white/10 p-4 flex flex-col md:flex-row justify-between">
                  <div className="flex-1">
                    <h4 className="text-white font-display text-md">{crit.name}</h4>
                    <p className="text-gray-400 font-mono text-xs mt-1">{crit.description || 'No description'}</p>
                    <div className="flex space-x-4 mt-3">
                      <span className="font-mono text-xs text-gray-500 border border-white/10 px-2 py-1 bg-navy-900">
                        RANGE: {crit.min_score} - {crit.max_score}
                      </span>
                      <span className="font-mono text-xs text-cyan-400 border border-cyan-400/20 px-2 py-1 bg-cyan-400/5">
                        WEIGHT: {crit.weight}%
                      </span>
                    </div>
                  </div>
                  {isDraft && (
                    <div className="mt-4 md:mt-0 flex items-start">
                      <button onClick={() => handleDelete(crit.id)} className="text-gray-500 hover:text-red-500 p-2" aria-label="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          <div className="bg-navy-800/40 border border-white/10 p-6 sticky top-24">
            <h3 className="text-white font-display text-sm uppercase tracking-widest border-b border-white/10 pb-3 mb-4">Policy Validation</h3>
            
            <ul className="space-y-3 font-mono text-xs">
              <li className={`flex items-center ${policy.criteria.length > 0 ? 'text-cyan-400' : 'text-gray-500'}`}>
                <CheckCircle className="w-4 h-4 mr-2" /> Has criteria
              </li>
              <li className={`flex items-center ${totalWeight === 100 ? 'text-cyan-400' : (totalWeight > 100 ? 'text-red-500' : 'text-gray-500')}`}>
                {totalWeight > 100 ? <AlertCircle className="w-4 h-4 mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                Total Weight: {totalWeight}% / 100%
              </li>
              <li className={`flex items-center ${policy.status !== 'DRAFT' ? 'text-cyan-400' : 'text-gray-500'}`}>
                <CheckCircle className="w-4 h-4 mr-2" /> Published
              </li>
            </ul>

            {isDraft && totalWeight !== 100 && (
              <p className="mt-4 text-pink-500 text-xs font-mono">
                Total weight must equal exactly 100% to publish.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
