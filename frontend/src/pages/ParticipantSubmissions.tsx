import { useState, useEffect } from 'react';
import { api, ApiError } from '../services/api';
import { Terminal, Send, CheckCircle, AlertTriangle } from 'lucide-react';

interface Submission {
  id: string;
  title: string;
  hackathon_id: string;
}

export default function ParticipantSubmissions() {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadSubmission() {
      try {
        const response = await api.get<{ data: Submission }>('/public/my-submission');
        setSubmission(response.data);
        setTitle(response.data.title);
      } catch (err: any) {
        if (err.status !== 404) {
          setError(err.message || 'Failed to load submission');
        }
      } finally {
        setLoading(false);
      }
    }
    loadSubmission();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (submission) {
        // Edit existing
        await api.put(`/public/submissions/${submission.id}`, { title });
        setSuccess('Submission updated successfully.');
      } else {
        // Create new
        const res = await api.post<{ data: { id: string, title: string } }>('/public/submit', { title, summary: 'Auto summary' });
        setSubmission({ id: res.data.id, title: res.data.title, hackathon_id: '' });
        setSuccess('Project submitted successfully.');
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Terminal className="w-8 h-8 text-cyan-400 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-3xl">
      <div className="border-b border-white/10 pb-6">
        <h1 className="text-3xl font-display font-bold text-white uppercase tracking-wider">
          My Project Submission
        </h1>
        <p className="mt-2 text-gray-400 font-mono text-sm leading-relaxed">
          Submit or update your project details. Edits are permitted until the hackathon deadline.
        </p>
      </div>

      {error && (
        <div className="flex items-center space-x-2 text-pink-500 bg-pink-500/10 p-4 border border-pink-500/30">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="font-mono text-sm">{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center space-x-2 text-cyan-400 bg-cyan-400/10 p-4 border border-cyan-400/30">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span className="font-mono text-sm">{success}</span>
        </div>
      )}

      <div className="border border-white/10 bg-navy-800/40 p-6 sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="title" className="block text-sm font-mono text-gray-400 mb-2 uppercase">
              Project Title
            </label>
            <input
              id="title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-navy-900/50 border border-white/10 text-white font-mono text-sm p-3 focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none transition-all"
              placeholder="Enter your project title..."
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex items-center space-x-2 px-6 py-3 bg-cyan-400/10 text-cyan-400 border border-cyan-400/50 font-mono text-sm tracking-widest hover:bg-cyan-400/20 focus:ring-2 focus:ring-cyan-400 focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            <span>{submitting ? 'PROCESSING...' : submission ? 'UPDATE SUBMISSION' : 'SUBMIT PROJECT'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
