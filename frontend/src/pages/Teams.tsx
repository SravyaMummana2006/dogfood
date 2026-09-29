import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Users, FileText, Activity } from 'lucide-react';

interface TeamMember {
  id: string;
  email: string;
  display_name: string;
}

interface Team {
  id: string;
  name: string;
  created_at: string;
  submission_id: string | null;
  submission_title: string | null;
  members: TeamMember[] | null;
}

interface PublicHackathon {
  id: string;
  name: string;
  status: string;
}

export default function Teams() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [hackathon, setHackathon] = useState<PublicHackathon | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        // Find active hackathon same as dashboard
        const hRes = await api.get<{ data: PublicHackathon[] }>('/public/hackathons');
        const activeEvents = hRes.data.filter(h => h.status === 'ACTIVE');
        const active = activeEvents.length > 0 ? activeEvents[activeEvents.length - 1] : null;

        if (active) {
          setHackathon(active);
          const tRes = await api.get<{ data: Team[] }>(`/hackathons/${active.id}/teams`);
          setTeams(tRes.data || []);
        } else {
          setError('No active hackathon found.');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load teams');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return <div className="text-gray-400 font-mono flex items-center justify-center py-20 animate-pulse">Loading Teams...</div>;
  }
  
  if (error) {
    return <div className="text-pink-500 font-mono p-4 border border-pink-500/30 bg-pink-500/10 max-w-5xl mx-auto mt-8">{error}</div>;
  }

  if (!hackathon) {
    return <div className="text-gray-500 font-mono flex items-center justify-center py-20">No event context</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto mt-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-white/10 pb-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-white uppercase tracking-wider">Manage Teams</h1>
          <p className="mt-2 text-gray-400 font-mono text-sm">Event: <span className="text-cyan-400">{hackathon.name}</span></p>
        </div>
        <div className="mt-4 md:mt-0 font-mono text-xs text-purple-400 border border-purple-400/30 px-3 py-1.5 bg-purple-400/5">
          [ ORGANIZER ]
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="flex flex-col justify-center items-center py-16 bg-navy-900/30 border border-dashed border-white/10">
          <Activity className="w-6 h-6 text-gray-600 mb-3" />
          <span className="font-mono text-gray-500 text-sm">No teams found for this event.</span>
        </div>
      ) : (
        <div className="overflow-x-auto border border-white/10 bg-navy-800/40">
          <table className="w-full text-left font-mono text-sm">
            <thead>
              <tr className="border-b border-white/10 text-gray-400 bg-navy-900/50">
                <th className="py-3 px-4 font-normal">Team</th>
                <th className="py-3 px-4 font-normal">Members</th>
                <th className="py-3 px-4 font-normal">Submission Status</th>
                <th className="py-3 px-4 font-normal text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.map(t => {
                const isSubmitted = !!t.submission_id;
                const members = t.members || [];
                return (
                  <tr key={t.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4">
                      <div className="text-white truncate max-w-[200px]">{t.name}</div>
                      <div className="text-xs text-gray-500 truncate mt-1">ID: {t.id.split('-')[0]}...</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center text-gray-300">
                        <Users className="w-4 h-4 mr-2 opacity-50" />
                        {members.length} {members.length === 1 ? 'Member' : 'Members'}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {isSubmitted ? (
                        <div className="text-cyan-400 flex items-center text-xs">
                          <FileText className="w-3 h-3 mr-1" />
                          SUBMITTED
                        </div>
                      ) : (
                        <div className="text-gray-500 text-xs">PENDING</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button 
                        onClick={() => setSelectedTeam(t)}
                        className="px-3 py-1.5 border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 uppercase tracking-wider text-xs"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-900/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-navy-800 border border-purple-500/30 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-navy-900/50">
              <h2 className="text-xl font-display text-white uppercase tracking-wider">Team Inspection</h2>
              <button 
                onClick={() => setSelectedTeam(null)}
                className="text-gray-400 hover:text-white font-mono text-sm border border-transparent hover:border-white/20 px-2 py-1"
              >
                CLOSE [X]
              </button>
            </div>
            
            <div className="p-6 space-y-6 font-mono text-sm">
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-widest mb-1">Team Information</div>
                <div className="grid grid-cols-3 gap-4 border border-white/10 p-4 bg-navy-900/30">
                  <div className="col-span-3">
                    <span className="text-gray-400 block mb-1">Name</span>
                    <span className="text-white text-base">{selectedTeam.name}</span>
                  </div>
                  <div className="col-span-3 sm:col-span-1">
                    <span className="text-gray-400 block mb-1">Hackathon</span>
                    <span className="text-cyan-400 truncate">{hackathon.name}</span>
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <span className="text-gray-400 block mb-1">Created At</span>
                    <span className="text-gray-300">{new Date(selectedTeam.created_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-gray-500 text-xs uppercase tracking-widest mb-1">Submission Status</div>
                <div className="border border-white/10 p-4 bg-navy-900/30">
                  {selectedTeam.submission_id ? (
                    <div>
                      <span className="text-cyan-400 block mb-2 flex items-center">
                        <FileText className="w-4 h-4 mr-2" /> SUBMITTED
                      </span>
                      <span className="text-gray-400 block mb-1">Project Title</span>
                      <span className="text-white">{selectedTeam.submission_title}</span>
                    </div>
                  ) : (
                    <div className="text-gray-500 flex items-center">
                      <Activity className="w-4 h-4 mr-2 opacity-50" /> NO ACTIVE SUBMISSION
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-gray-500 text-xs uppercase tracking-widest mb-1 flex justify-between">
                  <span>Members ({(selectedTeam.members || []).length})</span>
                </div>
                <div className="border border-white/10 bg-navy-900/30">
                  {(selectedTeam.members || []).length === 0 ? (
                    <div className="p-4 text-gray-500">No members found.</div>
                  ) : (
                    <ul className="divide-y divide-white/10">
                      {(selectedTeam.members || []).map(m => (
                        <li key={m.id} className="p-4 flex flex-col sm:flex-row sm:justify-between sm:items-center">
                          <span className="text-white">{m.display_name}</span>
                          <span className="text-gray-400 text-xs">{m.email}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
