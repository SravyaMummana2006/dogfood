import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { api } from '../services/api';

interface Webhook {
  id: string;
  url: string;
  is_active: boolean;
  created_at: string;
}

interface SettingsProps {
  hackathonId: string;
}

export default function WebhookSettings({ hackathonId }: SettingsProps) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [secret, setSecret] = useState<string | null>(null);

  useEffect(() => {
    loadWebhooks();
  }, [hackathonId]);

  const loadWebhooks = async () => {
    try {
      const response = await api.get<{data: Webhook[]}>(`/hackathons/${hackathonId}/webhooks`);
      setWebhooks(response.data);
    } catch (e) {
      console.error(e);
    }
  };

  const createWebhook = async (e: FormEvent) => {
    e.preventDefault();
    if (!newUrl) return;
    try {
      const response = await api.post<{data: {id: string, secret: string}}>(`/hackathons/${hackathonId}/webhooks`, { url: newUrl });
      setSecret(response.data.secret);
      setNewUrl('');
      loadWebhooks();
    } catch (e) {
      console.error(e);
    }
  };

  const testWebhook = async (webhookId: string) => {
    try {
      await api.post(`/hackathons/${hackathonId}/webhooks/${webhookId}/test`);
      alert('Test webhook sent successfully!');
    } catch (e) {
      alert('Failed to send test webhook');
    }
  };

  const deleteWebhook = async (webhookId: string) => {
    if (!confirm('Are you sure you want to delete this webhook?')) return;
    try {
      await api.delete(`/hackathons/${hackathonId}/webhooks/${webhookId}`);
      loadWebhooks();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="bg-navy-800 border border-white/10 p-6 shadow-xl relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 blur-3xl rounded-full transition-transform duration-500 group-hover:scale-150"></div>
      
      <div className="relative z-10">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-display text-white">Event Webhooks</h2>
        </div>

        {secret && (
          <div className="mb-6 p-4 bg-cyan-900/30 border border-cyan-500/30 rounded">
            <h3 className="text-cyan-400 font-bold mb-2">Webhook Created</h3>
            <p className="text-sm text-gray-300 mb-2">Please save this secret key. It will not be shown again.</p>
            <code className="block bg-navy-900 p-2 text-cyan-300 break-all">{secret}</code>
            <button onClick={() => setSecret(null)} className="mt-3 text-xs text-cyan-400 hover:text-cyan-300">Dismiss</button>
          </div>
        )}

        <form onSubmit={createWebhook} className="flex gap-4 mb-8">
          <input
            type="url"
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            placeholder="https://your-api.com/webhooks"
            className="flex-1 bg-navy-900 border border-white/10 p-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
            required
          />
          <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 font-mono text-sm transition-colors shadow-[0_0_15px_rgba(8,145,178,0.3)] hover:shadow-[0_0_25px_rgba(8,145,178,0.5)]">
            + Add Webhook
          </button>
        </form>

        <div className="space-y-4">
          {webhooks.length === 0 ? (
            <div className="text-gray-500 font-mono text-center py-4">No webhooks configured.</div>
          ) : (
            webhooks.map(wh => (
              <div key={wh.id} className="flex justify-between items-center p-4 bg-navy-900/50 border border-white/5">
                <div>
                  <div className="text-white font-mono text-sm mb-1">{wh.url}</div>
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>Status: <span className={wh.is_active ? "text-cyan-400" : "text-gray-500"}>{wh.is_active ? 'ACTIVE' : 'INACTIVE'}</span></span>
                    <span>Created: {new Date(wh.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => testWebhook(wh.id)} className="text-xs font-mono text-cyan-400 hover:text-cyan-300">Test</button>
                  <button onClick={() => deleteWebhook(wh.id)} className="text-xs font-mono text-red-400 hover:text-red-300">Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
