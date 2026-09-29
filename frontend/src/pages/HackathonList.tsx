import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Link } from 'react-router-dom';

export function HackathonList() {
  const [hackathons, setHackathons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get('/hackathons') as any;
        setHackathons(res.data);
      } catch (err: any) {
        setError(err.message || 'Failed to load hackathons');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setLoading(true);
      setError(null);
      const text = await file.text();
      const payload = JSON.parse(text);
      await api.post('/hackathons/import', payload);
      const res = await api.get('/hackathons') as any;
      setHackathons(res.data);
      alert('Event migrated successfully!');
    } catch (err: any) {
      if (err.response?.data?.error?.details?.missing_emails) {
        setError(`Missing users: ${err.response.data.error.details.missing_emails.join(', ')}`);
      } else {
        setError(err.message || 'Import failed');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-gray-400 font-mono">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-display text-white uppercase tracking-wider">Hackathons</h2>
        <div className="relative">
          <input type="file" id="importFile" accept=".json" onChange={handleImport} className="hidden" />
          <label htmlFor="importFile" className="cursor-pointer px-4 py-2 bg-purple-500/10 text-purple-400 font-mono text-sm border border-purple-500/30 hover:bg-purple-500/20">
            Import Event (.json)
          </label>
        </div>
      </div>
      {error && <div className="text-red-400 font-mono p-4 bg-red-900/20 border border-red-500/30">{error}</div>}
      <div className="space-y-4">
        {hackathons.map(h => (
          <div key={h.id} className="p-4 border border-white/10 bg-navy-800/50 flex justify-between items-center">
            <div>
              <h3 className="text-white font-mono">{h.name}</h3>
              <p className="text-gray-400 font-mono text-sm">Status: {h.status}</p>
            </div>
            <Link to={`/hackathons/${h.id}/results`} className="px-4 py-2 bg-cyan-500/10 text-cyan-400 font-mono text-sm border border-cyan-500/30 hover:bg-cyan-500/20">
              View Results
            </Link>
          </div>
        ))}
        {hackathons.length === 0 && (
          <div className="text-gray-500 font-mono p-4 border border-white/5 text-center">No hackathons found</div>
        )}
      </div>
    </div>
  );
}
