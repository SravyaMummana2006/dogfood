import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { Terminal, LayoutGrid, Search } from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';

interface GallerySubmission {
  id: string;
  title: string;
  team_name: string;
}

export function Gallery({ embed = false }: { embed?: boolean }) {
  const [submissions, setSubmissions] = useState<GallerySubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 1. Generate or retrieve the stable session seed
    let seed = sessionStorage.getItem('gallery_seed');
    if (!seed) {
      seed = Math.random().toString(36).substring(2, 15);
      sessionStorage.setItem('gallery_seed', seed);
    }

    // 2. Fetch the randomized ballot using the seed
    const fetchGallery = async () => {
      try {
        setLoading(true);
        const data = await api.get<GallerySubmission[]>(`/public/gallery?seed=${seed}`);
        setSubmissions(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load gallery');
      } finally {
        setLoading(false);
      }
    };

    fetchGallery();
  }, []);

  return (
    <div className="min-h-screen bg-navy-900 bg-grid-pattern relative flex flex-col">
      {!embed && <Header />}
      
      <main className={`flex-1 ${embed ? "pt-4" : "pt-24"} pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full`}>
        
        {/* Header Section */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center space-x-2 px-3 py-1 bg-cyan-400/10 border border-cyan-400/20 rounded-full mb-4">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-mono text-cyan-400 tracking-widest uppercase">Public Gallery</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-white mb-4 text-shadow-layered uppercase">
            Project Submissions
          </h1>
          <p className="text-gray-400 max-w-2xl mx-auto font-mono text-sm">
            Browse all submissions for the current hackathon. Ballots are randomized per session to ensure fair visibility.
          </p>
        </div>

        {/* Content Area */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="animate-pulse flex items-center space-x-3 text-cyan-400 font-mono">
              <Terminal className="w-5 h-5" />
              <span>[ LOADING BALLOT ]</span>
            </div>
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/30 p-6 flex flex-col items-center justify-center text-center">
            <div className="text-red-400 font-mono text-sm mb-2">[ SYSTEM ERROR ]</div>
            <div className="text-white">{error}</div>
          </div>
        ) : submissions.length === 0 ? (
          <div className="border border-white/10 bg-navy-800/50 p-12 flex flex-col items-center justify-center text-center">
            <Search className="w-10 h-10 text-gray-500 mb-4" />
            <div className="text-gray-400 font-mono text-sm uppercase tracking-widest">
              No Submissions Found
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {submissions.map((sub) => (
              <Link 
                to={`/gallery/${sub.id}`}
                state={{ submission: sub }}
                key={sub.id}
                className="group relative bg-navy-800/50 border border-white/10 hover:border-cyan-400/50 transition-all duration-300 p-6 flex flex-col h-full block"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <div className="flex-1">
                  <h3 className="text-xl font-display font-bold text-white mb-2 line-clamp-2">
                    {sub.title}
                  </h3>
                  <div className="text-sm font-mono text-gray-400 flex items-center space-x-2">
                    <span className="text-pink-500">team //</span>
                    <span className="truncate">{sub.team_name}</span>
                  </div>
                </div>
                
                {/* Visual purely for aesthetics; public users don't see scores here per T3 embargo */}
                <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                  <div className="text-xs font-mono text-gray-600">ID: {sub.id.split('-')[0]}</div>
                  <LayoutGrid className="w-4 h-4 text-gray-500 group-hover:text-cyan-400 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      
      {!embed && <Footer />}
    </div>
  );
}
