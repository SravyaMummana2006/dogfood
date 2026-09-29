import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import Header from '../components/Header';
import Footer from '../components/Footer';

export function RecordView() {
  const { id } = useParams();
  const [record, setRecord] = useState<any>(null);
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [recRes, keysRes] = await Promise.all([
          api.get<{ data: any }>(`/public/records/${id}`),
          api.get<{ data: { keys: any[] } }>('/public/keys')
        ]);
        setRecord(recRes.data);
        setKeys(keysRes.data.keys);
      } catch (err: any) {
        setError(err.message || 'Failed to load record');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <Header />
      <main className="flex-grow flex items-center justify-center p-8">
        <div className="text-gray-400 font-mono">Loading verifiable record...</div>
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

  const matchedKey = keys.find(k => k.kid === record.kid);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <Header />
      <main className="flex-grow p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-display text-cyan-400 uppercase tracking-wider">Verifiable Record</h1>
            <span className="px-3 py-1 bg-gray-800 border border-gray-700 text-gray-300 font-mono text-sm uppercase">
              {record.type}
            </span>
          </div>

          <div className="bg-gray-800/50 border border-gray-700 p-6 space-y-4">
            <h2 className="text-xl font-display text-white border-b border-gray-700 pb-2">Record Payload</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-gray-500 uppercase tracking-wider font-mono">Hackathon Name</label>
                <div className="text-gray-200 font-mono text-sm">{record.payload.hackathon_name}</div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500 uppercase tracking-wider font-mono">Hackathon ID</label>
                <div className="text-gray-200 font-mono text-sm break-all">{record.payload.hackathon_id}</div>
              </div>

              {record.type === 'JUDGE_PARTICIPATION' && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 uppercase tracking-wider font-mono">Judge Name</label>
                    <div className="text-gray-200 font-mono text-sm">{record.payload.judge_name}</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 uppercase tracking-wider font-mono">Judge ID</label>
                    <div className="text-gray-200 font-mono text-sm break-all">{record.payload.judge_user_id}</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 uppercase tracking-wider font-mono">Participation Status</label>
                    <div className="text-gray-200 font-mono text-sm">{record.payload.participation_status}</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 uppercase tracking-wider font-mono">Evaluations Submitted</label>
                    <div className="text-gray-200 font-mono text-sm">{record.payload.total_submitted} / {record.payload.total_assignments}</div>
                  </div>
                </>
              )}

              {record.type === 'PARTICIPANT_CERTIFICATE' && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 uppercase tracking-wider font-mono">Project Title</label>
                    <div className="text-gray-200 font-mono text-sm">{record.payload.project_title}</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 uppercase tracking-wider font-mono">Team Name</label>
                    <div className="text-gray-200 font-mono text-sm">{record.payload.team_name}</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 uppercase tracking-wider font-mono">Aggregate Score</label>
                    <div className="text-gray-200 font-mono text-sm">{record.payload.aggregate_score || 'N/A'}</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 uppercase tracking-wider font-mono">Community Votes</label>
                    <div className="text-gray-200 font-mono text-sm">{record.payload.community_votes || 0}</div>
                  </div>
                </>
              )}

              <div className="space-y-1 md:col-span-2">
                <label className="text-xs text-gray-500 uppercase tracking-wider font-mono">Issued At</label>
                <div className="text-gray-200 font-mono text-sm">{new Date(record.issued_at).toLocaleString()}</div>
              </div>
            </div>

            <div className="mt-6 space-y-2">
              <label className="text-xs text-gray-500 uppercase tracking-wider font-mono">Raw JSON Payload (Canonicalized)</label>
              <pre className="bg-gray-900 p-4 border border-gray-700 text-gray-300 font-mono text-xs overflow-x-auto">
                {JSON.stringify(record.payload, null, 2)}
              </pre>
            </div>
          </div>

          <div className="bg-gray-800/50 border border-gray-700 p-6 space-y-4">
            <h2 className="text-xl font-display text-white border-b border-gray-700 pb-2">Cryptographic Signature</h2>
            
            <div className="space-y-1">
              <label className="text-xs text-gray-500 uppercase tracking-wider font-mono">Key ID (KID)</label>
              <div className="text-gray-200 font-mono text-sm break-all">{record.kid}</div>
            </div>
            
            <div className="space-y-1">
              <label className="text-xs text-gray-500 uppercase tracking-wider font-mono">Signature (Base64)</label>
              <div className="text-gray-200 font-mono text-sm break-all">{record.signature}</div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-700 space-y-2">
              <h3 className="text-sm text-cyan-400 font-mono uppercase tracking-wider">Verification Public Key</h3>
              {matchedKey ? (
                <>
                  <div className="text-xs text-gray-400 font-mono">Algorithm: {matchedKey.algorithm}</div>
                  <pre className="bg-gray-900 p-4 border border-gray-700 text-gray-300 font-mono text-xs overflow-x-auto whitespace-pre">
                    {matchedKey.public_key}
                  </pre>
                  <p className="text-xs text-gray-500 font-mono mt-2">
                    To verify manually, canonicalize the JSON payload and verify the Base64 signature using this Ed25519 public key.
                  </p>
                </>
              ) : (
                <div className="text-yellow-400 font-mono text-sm bg-yellow-400/10 p-3 border border-yellow-400/30">
                  Public key with ID {record.kid} not found in current active keys list.
                </div>
              )}
            </div>
          </div>

          <div className="flex space-x-4 pt-4">
            <Link to="/keys" className="px-4 py-2 border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 font-mono text-sm hover:bg-cyan-500/20">
              View All Keys
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
