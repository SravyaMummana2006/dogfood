import { useState, useEffect } from 'react';
import { api } from '../services/api';
import WebhookSettings from '../components/WebhookSettings';

export default function Settings() {
  const [hackathons, setHackathons] = useState<any[]>([]);

  useEffect(() => {
    loadHackathons();
  }, []);

  const loadHackathons = async () => {
    try {
      const response = await api.get<{data: any[]}>('/hackathons');
      setHackathons(response.data);
    } catch (e) {
      console.error(e);
    }
  };

  const activeHackathon = hackathons.find(h => h.status !== 'ARCHIVED');

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-4xl font-display font-bold text-white mb-2 tracking-tight">System Settings</h1>
          <p className="text-cyan-400 font-mono">Platform Configuration & Integrations</p>
        </div>
      </div>

      {!activeHackathon ? (
        <div className="p-8 border border-white/10 bg-navy-800/50 flex flex-col items-center justify-center min-h-[200px]">
          <div className="text-gray-500 font-mono mb-4">No active hackathon found to configure.</div>
        </div>
      ) : (
        <div className="space-y-8">
          <WebhookSettings hackathonId={activeHackathon.id} />
        </div>
      )}
    </div>
  );
}
