import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

interface AuditEvent {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, any>;
  created_at: string;
  actor_email: string;
}

export const AuditLog: React.FC = () => {
  const [logs, setLogs] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      const res: any = await api.get('/audit');
      setLogs(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load audit log. Are you an organizer?');
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto text-white">
      <h1 className="text-2xl font-bold mb-4 text-cyan-400">Security Audit Log</h1>
      {error && <div className="text-red-500 mb-4">{error}</div>}
      
      <div className="bg-gray-800 rounded shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Timestamp</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actor</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Action</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Target</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Details</th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-pink-400">
                  {log.actor_email}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                  {log.action}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                  {log.entity_type}<br/>
                  <span className="text-xs">{log.entity_id}</span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-400 max-w-xs truncate">
                  {JSON.stringify(log.details)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
