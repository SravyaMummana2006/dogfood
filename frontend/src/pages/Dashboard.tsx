import { useAuth } from '../contexts/AuthContext';
import { Terminal, AlertCircle, Users, Gavel, FileText, Activity, ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

interface PublicHackathon {
  id: string;
  name: string;
  description: string;
  status: string;
  submissions_close: string | null;
}

interface HackathonResult {
  submission_id: string;
  title: string;
  team_id: string;
  total_assignments: number;
  submitted_evaluations: number;
  missing_evaluations: number;
  aggregate_score: number;
  status: string;
}

interface Assignment {
  assignment_id: string;
  submission_id: string;
  submission_title: string;
  team_name: string;
  hackathon_name: string;
}

interface Evaluation {
  status: string;
  total_score: string;
}

interface Invitation {
  id: string;
  hackathon_name: string;
  submission_title: string;
  status: string;
}

interface RoleContext {
  is_participant: boolean;
  is_judge: boolean;
}

export default function Dashboard() {
  const { user } = useAuth();
  if (user?.is_admin) return <OrganizerDashboard />;
  return <UserDashboard />;
}

function getActiveHackathon(hackathons: PublicHackathon[]): PublicHackathon | null {
  const activeEvents = hackathons.filter(h => h.status === 'ACTIVE');
  if (activeEvents.length === 0) return null;
  // Fallback to most recently created if multiple exist (which is the last item in the ASC list)
  return activeEvents[activeEvents.length - 1];
}

function OrganizerDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hackathon, setHackathon] = useState<PublicHackathon | null>(null);
  const [results, setResults] = useState<HackathonResult[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const hRes = await api.get<{ data: PublicHackathon[] }>('/public/hackathons');
        const active = getActiveHackathon(hRes.data);
        if (active) {
          setHackathon(active);
          const rRes = await api.get<{ data: { results: HackathonResult[] } }>(`/hackathons/${active.id}/results`);
          setResults(rRes.data.results || []);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load organizer data');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  
  if (!hackathon) {
    return (
      <DashboardLayout title="Organizer Overview" roleLabel="ORGANIZER">
        <EmptyState message="No active hackathons found. Initialize an event to begin." />
      </DashboardLayout>
    );
  }

  const totalTeams = new Set(results.map(r => r.team_id)).size;
  const totalSubmissions = results.length;
  const totalAssignments = results.reduce((acc, r) => acc + (r.total_assignments || 0), 0);
  const totalEvals = results.reduce((acc, r) => acc + (r.submitted_evaluations || 0), 0);
  const missingEvals = totalAssignments - totalEvals;
  const progress = totalAssignments > 0 ? Math.round((totalEvals / totalAssignments) * 100) : 0;

  return (
    <DashboardLayout title="Organizer Overview" roleLabel="ORGANIZER">
      <div className="border border-white/10 bg-navy-800/40 p-6 mb-6">
        <h2 className="text-xl font-display text-white uppercase">{hackathon.name}</h2>
        <div className="mt-2 flex space-x-4 font-mono text-xs">
          <span className="text-pink-500">STATUS: {hackathon.status}</span>
          {hackathon.submissions_close && (
            <span className="text-cyan-400">DEADLINE: {new Date(hackathon.submissions_close).toLocaleDateString()}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Users} label="Teams" value={totalTeams} />
        <StatCard icon={FileText} label="Submissions" value={totalSubmissions} />
        <StatCard icon={Gavel} label="Assignments" value={totalAssignments} />
        <StatCard icon={CheckCircle2} label="Evaluations" value={totalEvals} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="border border-white/10 bg-navy-800/40 p-6">
          <h3 className="text-sm font-mono text-cyan-400 mb-4 uppercase tracking-wider">Judging Progress</h3>
          <div className="flex justify-between text-white font-mono mb-2">
            <span>{progress}% Completed</span>
            <span className="text-pink-500">{missingEvals} Pending</span>
          </div>
          <div className="w-full bg-navy-900/50 h-2">
            <div className="bg-cyan-400 h-2 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
        
        <div className="border border-white/10 bg-navy-800/40 p-6">
          <h3 className="text-sm font-mono text-cyan-400 mb-4 uppercase tracking-wider">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            <ActionLink to="/hackathons" label="Manage Event" />
            <ActionLink to="/teams" label="Manage Teams" />
            <ActionLink to="/judging" label="Judging Rules" />
            <ActionLink to={`/hackathons/${hackathon.id}/results`} label="CSV Export" />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function UserDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [hackathon, setHackathon] = useState<PublicHackathon | null>(null);
  const [roleContext, setRoleContext] = useState<RoleContext>({ is_participant: false, is_judge: false });
  
  const [mySubmission, setMySubmission] = useState<any>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, Evaluation | null>>({});
  const [invitations, setInvitations] = useState<Invitation[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const hRes = await api.get<{ data: PublicHackathon[] }>('/public/hackathons');
        const active = getActiveHackathon(hRes.data);
        
        if (active) {
          setHackathon(active);
          const ctxRes = await api.get<{ data: RoleContext }>(`/hackathons/${active.id}/context`);
          const ctx = ctxRes.data;
          setRoleContext(ctx);

          const fetches: Promise<any>[] = [];
          
          if (ctx.is_participant) {
            fetches.push(
              api.get<{ data: any }>('/public/my-submission')
                .then(r => setMySubmission(r.data))
                .catch(() => {})
            );
          }
          
          if (ctx.is_judge) {
            fetches.push(
              api.get<{ data: Assignment[] }>('/judging/assignments').then(async r => {
                const asgns = r.data.filter(a => a.hackathon_name === active.name);
                setAssignments(asgns);
                
                const evals = await Promise.allSettled(
                  asgns.map(a => api.get<{ data: { evaluation: Evaluation | null } }>(`/judging/submissions/${a.submission_id}/evaluation`))
                );
                
                const evalMap: Record<string, Evaluation | null> = {};
                evals.forEach((res, idx) => {
                  if (res.status === 'fulfilled' && res.value.data.evaluation) {
                    evalMap[asgns[idx].submission_id] = res.value.data.evaluation;
                  }
                });
                setEvaluations(evalMap);
              })
            );
            
            fetches.push(
              api.get<{ data: Invitation[] }>('/judging/invitations').then(r => {
                setInvitations(r.data.filter(i => i.status === 'PENDING' && i.hackathon_name === active.name));
              })
            );
          }
          
          await Promise.allSettled(fetches);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  let roleLabel = 'EVENT VIEWER / PARTICIPATION AVAILABLE';
  if (roleContext.is_participant && roleContext.is_judge) roleLabel = 'PARTICIPANT + JUDGE';
  else if (roleContext.is_participant) roleLabel = 'PARTICIPANT';
  else if (roleContext.is_judge) roleLabel = 'JUDGE';

  if (!hackathon) {
    return (
      <DashboardLayout title="Overview" roleLabel={roleLabel}>
        <EmptyState message="No active hackathons available." />
      </DashboardLayout>
    );
  }
  
  return (
    <DashboardLayout title="Overview" roleLabel={roleLabel}>
      {/* Participant Profile Section */}
      {(roleContext.is_participant || (!roleContext.is_participant && !roleContext.is_judge)) && (
        <div className="mb-10">
          <div className="flex justify-between items-end border-b border-white/10 pb-2 mb-4">
             <h2 className="text-lg font-display text-white uppercase">Participant Profile</h2>
             <Link to="/gallery" className="text-xs font-mono text-cyan-400 hover:text-cyan-300 hover:underline">
               &rarr; VIEW PUBLIC GALLERY
             </Link>
          </div>
          {mySubmission ? (
            <div className="border border-white/10 bg-navy-800/40 p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <p className="text-sm font-mono text-cyan-400 mb-1 uppercase tracking-wider">Your Active Submission</p>
                <h3 className="text-xl font-display text-white">{mySubmission.title}</h3>
              </div>
              <Link to="/submissions" className="px-6 py-2 border border-cyan-400 text-cyan-400 font-mono text-sm hover:bg-cyan-400/10 transition-colors whitespace-nowrap">
                VIEW / EDIT
              </Link>
            </div>
          ) : (
            <div className="border border-white/10 bg-navy-800/40 p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-white font-display text-lg mb-2 truncate">{hackathon.name}</h3>
                <div className="flex space-x-4 font-mono text-xs mb-6">
                  <span className="text-pink-500">STATUS: {hackathon.status}</span>
                  {hackathon.submissions_close && (
                    <span className="text-cyan-400">DUE: {new Date(hackathon.submissions_close).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <Link to="/submissions" className="text-center px-4 py-2 border border-cyan-400 text-cyan-400 font-mono text-sm hover:bg-cyan-400/10 transition-colors">
                SUBMIT PROJECT
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Judging Queue Section */}
      {roleContext.is_judge && (
        <div className="mb-8">
          <h2 className="text-lg font-display text-white mb-4 border-b border-white/10 pb-2 flex items-center uppercase">
            <Gavel className="w-5 h-5 mr-2 text-pink-500" />
            Judging Queue
          </h2>
          
          {invitations.length > 0 && (
            <div className="mb-6 border border-pink-500/30 bg-pink-500/5 p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <p className="text-pink-500 font-mono text-sm">You have {invitations.length} pending judge invitation(s).</p>
              </div>
              <Link to="/judging/invitations" className="text-pink-500 hover:text-pink-400 font-mono text-sm underline whitespace-nowrap">
                Review Invitations
              </Link>
            </div>
          )}

          {assignments.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assignments.map(a => {
                const evalData = evaluations[a.submission_id];
                const isComplete = evalData?.status === 'SUBMITTED';
                return (
                  <div key={a.assignment_id} className="border border-white/10 bg-navy-800/40 p-6 flex flex-col justify-between">
                    <div>
                      <h3 className="text-white font-display text-lg truncate">{a.submission_title}</h3>
                      <p className="text-gray-400 font-mono text-xs mt-1 truncate">{a.hackathon_name}</p>
                      <div className="mt-4 mb-6 font-mono text-xs">
                        {isComplete ? (
                          <span className="text-cyan-400 flex items-center"><CheckCircle2 className="w-4 h-4 mr-2"/> EVALUATION COMPLETED</span>
                        ) : (
                          <span className="text-pink-500 flex items-center"><Clock className="w-4 h-4 mr-2"/> EVALUATION PENDING</span>
                        )}
                      </div>
                    </div>
                    <Link 
                      to={`/judging/submissions/${a.submission_id}`} 
                      className={`text-center px-4 py-2 border font-mono text-sm transition-colors uppercase tracking-wider ${isComplete ? 'border-white/20 text-gray-300 hover:bg-white/5' : 'border-cyan-400 text-cyan-400 hover:bg-cyan-400/10'}`}
                    >
                      {isComplete ? 'View Score' : 'Evaluate'}
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState message="No active assignments in your queue." />
          )}
        </div>
      )}
    </DashboardLayout>
  );
}

function DashboardLayout({ title, roleLabel, children }: { title: string, roleLabel: string, children: React.ReactNode }) {
  const { user } = useAuth();
  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-white/10 pb-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-white uppercase tracking-wider">{title}</h1>
        </div>
        <div className="mt-4 md:mt-0 font-mono text-xs text-cyan-400 border border-cyan-400/30 px-3 py-1.5 bg-cyan-400/5">
          [ {roleLabel} : {user?.email} ]
        </div>
      </div>
      {children}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any, label: string, value: number }) {
  return (
    <div className="border border-white/10 bg-navy-800/40 p-4 flex flex-col items-center justify-center text-center focus-within:ring-2 focus-within:ring-cyan-400 transition-all">
      <Icon className="w-6 h-6 text-cyan-400 mb-2" />
      <span className="text-2xl font-display text-white mb-1">{value}</span>
      <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">{label}</span>
    </div>
  );
}

function ActionLink({ to, label }: { to: string, label: string }) {
  return (
    <Link to={to} className="flex items-center justify-between p-3 border border-white/10 hover:border-cyan-400/50 bg-navy-900/50 hover:bg-cyan-400/5 text-gray-300 hover:text-cyan-400 transition-colors font-mono text-sm group">
      <span className="uppercase tracking-wide">{label}</span>
      <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}

function LoadingState() {
  return (
    <div className="flex justify-center items-center py-20 animate-in fade-in">
      <Terminal className="w-8 h-8 text-cyan-400 animate-pulse" />
      <span className="ml-3 font-mono text-cyan-400 uppercase tracking-widest text-sm animate-pulse">Loading Telemetry...</span>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col justify-center items-center py-20 bg-pink-500/5 border border-pink-500/20">
      <AlertCircle className="w-8 h-8 text-pink-500 mb-3" />
      <span className="font-mono text-pink-500 text-sm">{message}</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col justify-center items-center py-16 bg-navy-900/30 border border-dashed border-white/10">
      <Activity className="w-6 h-6 text-gray-600 mb-3" />
      <span className="font-mono text-gray-500 text-sm">{message}</span>
    </div>
  );
}
