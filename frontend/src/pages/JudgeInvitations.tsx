import { useState, useEffect } from 'react';
import { api } from '../services/api';

export function JudgeInvitations() {
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await api.get('/judging/invitations') as any;
      setInvitations(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load invitations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAction = async (id: string, action: 'accept' | 'decline') => {
    try {
      await api.post(`/judging/invitations/${id}/${action}`, {});
      await load();
    } catch (err: any) {
      alert(err.message || `Failed to ${action} invitation`);
    }
  };

  if (loading) return <div className="text-gray-400 font-mono p-6">Loading invitations...</div>;
  if (error) return <div className="text-red-400 font-mono p-6">{error}</div>;

  return (
    <div className="space-y-6 animate-in fade-in">
      <h2 className="text-2xl font-display text-white uppercase tracking-wider">My Invitations</h2>
      <div className="space-y-4">
        {invitations.map(inv => (
          <div key={inv.invitation_id} className="p-4 border border-white/10 bg-navy-800/50 flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
            <div>
              <h3 className="text-white font-mono text-lg">{inv.submission_title}</h3>
              <p className="text-gray-400 font-mono text-sm">
                Hackathon: {inv.hackathon_name} | Team: {inv.team_name}
              </p>
              <p className="text-xs text-gray-500 font-mono mt-1">Status: {inv.invitation_status}</p>
            </div>
            {inv.invitation_status === 'PENDING' && (
              <div className="flex space-x-3">
                <button 
                  onClick={() => handleAction(inv.invitation_id, 'accept')}
                  className="px-4 py-2 bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20 font-mono text-sm uppercase"
                >
                  Accept
                </button>
                <button 
                  onClick={() => handleAction(inv.invitation_id, 'decline')}
                  className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 font-mono text-sm uppercase"
                >
                  Decline
                </button>
              </div>
            )}
          </div>
        ))}
        {invitations.length === 0 && (
          <div className="text-gray-500 font-mono p-4 border border-white/5 text-center">No invitations found</div>
        )}
      </div>
    </div>
  );
}
