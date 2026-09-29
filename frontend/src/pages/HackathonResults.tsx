import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';

export function HackathonResults() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [issuingRecords, setIssuingRecords] = useState(false);
  const [issueResult, setIssueResult] = useState<{ count: number, ids: string[] } | null>(null);

  
  const [inviteJudgeId, setInviteJudgeId] = useState<Record<string, string>>({});
  const [inviteStatus, setInviteStatus] = useState<Record<string, string>>({});

  const handleInvite = async (submissionId: string) => {
    const judgeId = inviteJudgeId[submissionId];
    if (!judgeId) return;
    try {
      setInviteStatus(prev => ({ ...prev, [submissionId]: 'Sending...' }));
      await api.post(`/hackathons/${id}/invitations`, {
        submission_id: submissionId,
        judge_user_id: judgeId
      });
      setInviteStatus(prev => ({ ...prev, [submissionId]: 'Success!' }));
      setInviteJudgeId(prev => ({ ...prev, [submissionId]: '' }));
    } catch (err: any) {
      setInviteStatus(prev => ({ ...prev, [submissionId]: err.message || 'Error' }));
    }
  };

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get(`/hackathons/${id}/results`) as any;
        setData(res.data);
      } catch (err: any) {
        setError(err.message || 'Failed to load results. Organizer access may be required.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return <div className="text-gray-400 font-mono">Loading aggregate results...</div>;
  if (error) return <div className="text-red-400 font-mono">{error}</div>;
  if (!data) return null;

  const handleExport = async () => {
    try {
      const res = await api.get(`/hackathons/${id}/export`) as any;
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hackathon-export-${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Export failed: ' + (err.message || 'Unknown error'));
    }
  };

  const handleIssueRecords = async () => {
    if (!confirm('Issue verifiable records? This requires the hackathon to be COMPLETED.')) return;
    try {
      setIssuingRecords(true);
      const res = await api.post<{ data: { issued_count: number, record_ids: string[] } }>(`/hackathons/${id}/verifiable-records/issue`);
      setIssueResult({ count: res.data.issued_count, ids: res.data.record_ids });
      alert(`Success! Issued ${res.data.issued_count} records.`);
    } catch (err: any) {
      alert('Issuance failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIssuingRecords(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex justify-between items-center border-b border-white/10 pb-4">
        <div>
          <h2 className="text-2xl font-display text-white uppercase tracking-wider">
            {data.hackathon_name} - Results
          </h2>
          <p className="mt-2 text-gray-400 font-mono text-sm">
            Aggregation Method: <span className="text-cyan-400">{data.aggregation_method}</span> | Policy ID: {data.policy_id || 'None'}
          </p>
        </div>
        <div className="flex space-x-4">
          <button onClick={handleIssueRecords} disabled={issuingRecords} className="px-4 py-2 border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 font-mono text-sm hover:bg-cyan-500/20 disabled:opacity-50">
              {issuingRecords ? 'Issuing...' : 'Issue Records'}
            </button>
            <button onClick={handleExport} className="px-4 py-2 border border-purple-500/30 bg-purple-500/10 text-purple-400 font-mono text-sm hover:bg-purple-500/20">
            Export Event Package
          </button>
          <Link to="/hackathons" className="px-4 py-2 border border-white/20 text-gray-300 font-mono text-sm hover:bg-white/5">
            Back
          </Link>
        </div>
      </div>

      {issueResult && issueResult.count > 0 && (
        <div className="mb-6 p-4 border border-cyan-500/30 bg-cyan-500/5">
          <h3 className="text-cyan-400 font-mono mb-2">Issued {issueResult.count} Records</h3>
          <ul className="list-disc pl-5 space-y-1">
            {issueResult.ids.map(rid => (
              <li key={rid}>
                <Link to={`/records/${rid}`} className="text-cyan-300 hover:underline font-mono text-sm">
                  {rid}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-400">
              <th className="pb-3 px-4 font-normal">Submission</th>
              <th className="pb-3 px-4 font-normal">Status</th>
              <th className="pb-3 px-4 font-normal">Evaluations (Sub/Miss)</th>
              <th className="pb-3 px-4 font-normal text-right">Aggregate Score</th>
              <th className="pb-3 px-4 font-normal text-right">Invite Judge</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.results.map((r: any) => (
              <tr key={r.submission_id} className="hover:bg-white/[0.02]">
                <td className="py-3 px-4">
                  <div className="text-white">{r.title}</div>
                  <div className="text-gray-500 text-xs mt-1 truncate max-w-[200px]" title={r.team_id}>Team ID: {r.team_id}</div>
                </td>
                <td className="py-3 px-4">
                  {r.status === 'COMPLETED' && <span className="text-green-400">COMPLETED</span>}
                  {r.status === 'INCOMPLETE' && <span className="text-yellow-400">INCOMPLETE</span>}
                  {r.status === 'NO_SCORE' && <span className="text-gray-500">NO SCORE</span>}
                  {r.status === 'UNASSIGNED' && <span className="text-red-400">UNASSIGNED</span>}
                </td>
                <td className="py-3 px-4">
                  <span className="text-cyan-400">{r.submitted_evaluations}</span>
                  <span className="text-gray-500 mx-1">/</span>
                  <span className="text-yellow-500">{r.missing_evaluations}</span> missing
                </td>
                <td className="py-3 px-4 text-right">
                  {r.aggregate_score !== null ? (
                    <span className="text-lg font-bold text-white">{r.aggregate_score.toFixed(4)}</span>
                  ) : (
                    <span className="text-gray-600">--</span>
                  )}
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end space-x-2">
                    <input 
                      type="text" 
                      placeholder="Judge User ID" 
                      className="bg-navy-900 border border-white/20 text-xs px-2 py-1 w-32"
                      value={inviteJudgeId[r.submission_id] || ''}
                      onChange={e => setInviteJudgeId(prev => ({...prev, [r.submission_id]: e.target.value}))}
                    />
                    <button 
                      onClick={() => handleInvite(r.submission_id)}
                      className="px-2 py-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-xs hover:bg-cyan-500/20"
                    >
                      Invite
                    </button>
                  </div>
                  {inviteStatus[r.submission_id] && (
                    <div className="text-xs text-yellow-400 mt-1">{inviteStatus[r.submission_id]}</div>
                  )}
                </td>
              </tr>
            ))}
            {data.results.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-gray-500">
                  No submissions found for this hackathon.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      <div className="mt-8 border border-white/10 bg-navy-800/30 p-4">
        <h4 className="text-gray-400 font-mono text-sm mb-2">Aggregation Rules</h4>
        <ul className="text-gray-500 font-mono text-xs space-y-1 list-disc list-inside">
          <li>Only SUBMITTED evaluations are included in the score calculation.</li>
          <li>DRAFT evaluations are deliberately excluded.</li>
          <li>Missing evaluations do NOT count as zero (they reduce the denominator).</li>
          <li>Precision is locked to 4 decimal places.</li>
          <li>Aggregate results are computed deterministically from stored evaluations.</li>
        </ul>
      </div>
    </div>
  );
}
