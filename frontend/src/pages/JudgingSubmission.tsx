import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

interface Criterion {
  id: string;
  name: string;
  description: string;
  min_score: number;
  max_score: number;
  weight: number;
}

interface EvaluationData {
  hackathon_status: string;
  policy: { name: string; description: string };
  criteria: Criterion[];
  evaluation: { status: string; total_score: string } | null;
  scores: { criterion_id: string; raw_score: number; weighted_score: string }[];
}

export const JudgingSubmission: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<EvaluationData | null>(null);
  const [formScores, setFormScores] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const res: any = await api.get(`/judging/submissions/${id}/evaluation`);
      setData(res.data);
      const initialScores: Record<string, number> = {};
      res.data.scores.forEach((s: any) => {
        initialScores[s.criterion_id] = s.raw_score;
      });
      setFormScores(initialScores);
    } catch (err: any) {
      setError(err.message || 'Failed to load judging context');
    }
  };

  const handleScoreChange = (criterionId: string, value: string) => {
    setFormScores(prev => ({
      ...prev,
      [criterionId]: parseInt(value, 10) || 0
    }));
  };

  const handleSave = async (submit: boolean) => {
    setError(null);
    try {
      const scoresPayload = Object.entries(formScores).map(([criterion_id, raw_score]) => ({
        criterion_id,
        raw_score
      }));
      await api.put(`/judging/submissions/${id}/evaluation`, {
        submit,
        scores: scoresPayload
      });
      loadData();
      if (submit) {
        alert('Evaluation submitted successfully!');
      } else {
        alert('Draft saved successfully!');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save evaluation');
    }
  };

  if (error) return <div className="text-red-500">Error: {error}</div>;
  if (!data) return <div>Loading...</div>;

  const isSubmitted = data.evaluation?.status === 'SUBMITTED';

  return (
    <div className="p-6 max-w-3xl mx-auto text-white">
      <button onClick={() => navigate('/dashboard')} className="text-pink-500 mb-4">&larr; Back</button>
      
      <h1 className="text-2xl font-bold mb-2">Evaluate Submission</h1>
      <div className="bg-gray-800 p-4 rounded mb-6">
        <h2 className="text-xl text-cyan-400">{data.policy?.name}</h2>
        <p className="text-gray-400">{data.policy?.description}</p>
        <p className="mt-2 text-sm text-yellow-400">Hackathon Status: {data.hackathon_status}</p>
        {data.evaluation && (
          <div className="mt-4 p-2 bg-gray-700 rounded flex justify-between">
            <span>Status: <strong>{data.evaluation.status}</strong></span>
            <span>Total Score: <strong>{data.evaluation.total_score} / 100</strong></span>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {data.criteria.map(c => (
          <div key={c.id} className="bg-gray-900 p-4 rounded border border-gray-700">
            <h3 className="font-bold text-lg">{c.name} <span className="text-sm text-gray-400 font-normal">(Weight: {c.weight}%)</span></h3>
            <p className="text-sm text-gray-300 mb-4">{c.description}</p>
            
            <div className="flex items-center space-x-4">
              <label className="text-sm text-gray-400">
                Score [{c.min_score} - {c.max_score}]:
              </label>
              <input 
                type="number"
                min={c.min_score}
                max={c.max_score}
                disabled={isSubmitted || data.hackathon_status !== 'ACTIVE'}
                value={formScores[c.id] ?? ''}
                onChange={(e) => handleScoreChange(c.id, e.target.value)}
                className="bg-gray-800 text-white p-2 rounded w-24 border border-gray-600 focus:border-cyan-400 outline-none"
              />
              {data.scores.find(s => s.criterion_id === c.id) && (
                <span className="text-xs text-green-400">
                  Weighted: {data.scores.find(s => s.criterion_id === c.id)?.weighted_score}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex space-x-4">
        {!isSubmitted && (
          <>
            <button 
              onClick={() => handleSave(false)}
              disabled={data.hackathon_status !== 'ACTIVE'}
              className="bg-gray-700 hover:bg-gray-600 px-6 py-2 rounded font-bold"
            >
              Save Draft
            </button>
            <button 
              onClick={() => handleSave(true)}
              disabled={data.hackathon_status !== 'ACTIVE'}
              className="bg-pink-600 hover:bg-pink-500 px-6 py-2 rounded font-bold"
            >
              Finalize & Submit
            </button>
          </>
        )}
      </div>
    </div>
  );
};
