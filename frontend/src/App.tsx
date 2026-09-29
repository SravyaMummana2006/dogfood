import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import Hero from './components/Hero';
import Features from './components/Features';
import Footer from './components/Footer';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import { Gallery } from './pages/Gallery';
import { PublicSubmissionDetail } from './pages/PublicSubmissionDetail';
import { RecordView } from './pages/RecordView';
import { KeysView } from './pages/KeysView';
import AuthenticatedLayout from './components/layout/AuthenticatedLayout';
import { AuthProvider } from './contexts/AuthContext';

function LandingPage() {
  return (
    <div className="min-h-screen bg-navy-900 bg-grid-pattern relative">
      <Header />
      <main>
        <Hero />
        <Features />
      </main>
      <Footer />
    </div>
  );
}

// Placeholder for unbuilt modules
function PlaceholderModule({ title }: { title: string }) {
  return (
    <div className="p-8 border border-white/10 bg-navy-800/50 flex flex-col items-center justify-center min-h-[400px]">
      <div className="text-gray-500 font-mono mb-4">[ MODULE NOT FOUND ]</div>
      <h2 className="text-xl font-display text-white">{title} is under construction</h2>
      <p className="mt-2 text-gray-400 font-mono text-sm">Phase 4 implementation focuses on the application shell.</p>
    </div>
  );
}

import JudgingPolicies from './pages/JudgingPolicies';
import JudgingPolicyEditor from './pages/JudgingPolicyEditor';
import { JudgingSubmission } from './pages/JudgingSubmission';
import { AuditLog } from './pages/AuditLog';
import { HackathonList } from './pages/HackathonList';
import { HackathonResults } from './pages/HackathonResults';
import { JudgeInvitations } from './pages/JudgeInvitations';
import ParticipantSubmissions from './pages/ParticipantSubmissions';
import Teams from './pages/Teams';

function JudgingRouter() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  if (selectedId) {
    return <JudgingPolicyEditor id={selectedId} onBack={() => setSelectedId(null)} />;
  }
  return <JudgingPolicies onSelect={setSelectedId} />;
}

import { AdminRoute } from './components/auth/AdminRoute';
import Settings from './pages/Settings';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/embed/gallery" element={<Gallery embed={true} />} />
          <Route path="/gallery/:id" element={<PublicSubmissionDetail />} />
          <Route path="/records/:id" element={<RecordView />} />
          <Route path="/keys" element={<KeysView />} />
          
          <Route element={<AuthenticatedLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/hackathons/:id/results" element={<HackathonResults />} />
            <Route path="/submissions" element={<ParticipantSubmissions />} />
            <Route path="/judging/invitations" element={<JudgeInvitations />} />
            <Route path="/judging/submissions/:id" element={<JudgingSubmission />} />
            
            <Route element={<AdminRoute />}>
              <Route path="/hackathons" element={<HackathonList />} />
              <Route path="/teams" element={<Teams />} />
              <Route path="/judging" element={<JudgingRouter />} />
              <Route path="/announcements" element={<PlaceholderModule title="Announcements" />} />
              <Route path="/audit" element={<AuditLog />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

