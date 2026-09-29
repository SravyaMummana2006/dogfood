import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { Terminal, Heart, MessageSquare, AlertCircle, Loader2 } from 'lucide-react';

interface Comment {
  id: string;
  user_id: string;
  display_name: string;
  body: string;
  created_at: string;
}

interface GallerySubmission {
  id: string;
  title: string;
  team_name: string;
}

export function PublicSubmissionDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { user } = useAuth();
  
  const [submissionMetadata, setSubmissionMetadata] = useState<GallerySubmission | null>(
    location.state?.submission || null
  );
  const [voteCount, setVoteCount] = useState<number | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  
  const [loadingMetadata, setLoadingMetadata] = useState(!submissionMetadata);
  const [loadingVotes, setLoadingVotes] = useState(true);
  const [loadingComments, setLoadingComments] = useState(true);
  
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [voteSuccess, setVoteSuccess] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [submittingVote, setSubmittingVote] = useState(false);

  useEffect(() => {
    if (!id) return;

    const fetchMetadata = async () => {
      if (submissionMetadata) return; // Fast path via router state
      try {
        setLoadingMetadata(true);
        // Note: this just gets the gallery without a seed, which is fine since we just need the data, not the order.
        const data = await api.get<GallerySubmission[]>('/public/gallery');
        const found = data.find(s => s.id === id);
        if (found) {
          setSubmissionMetadata(found);
        } else {
          setMetadataError('Submission not found.');
        }
      } catch (err: any) {
        setMetadataError(err.message || 'Failed to fetch submission details');
      } finally {
        setLoadingMetadata(false);
      }
    };
    
    const fetchVotes = async () => {
      try {
        const data = await api.get<{ votes: number }>(`/public/submissions/${id}/votes`);
        setVoteCount(data.votes);
      } catch (err: any) {
        setVoteError(err.message || 'Failed to fetch votes');
      } finally {
        setLoadingVotes(false);
      }
    };

    const fetchComments = async () => {
      try {
        const data = await api.get<Comment[]>(`/public/submissions/${id}/comments`);
        setComments(data);
      } catch (err: any) {
        setCommentError(err.message || 'Failed to fetch comments');
      } finally {
        setLoadingComments(false);
      }
    };

    fetchMetadata();
    fetchVotes();
    fetchComments();
  }, [id, submissionMetadata]);

  const handleVote = async () => {
    if (!user) {
      setVoteError('Please log in to vote.');
      return;
    }
    
    try {
      setSubmittingVote(true);
      setVoteError(null);
      setVoteSuccess(false);
      await api.post(`/public/submissions/${id}/vote`);
      
      // Successfully voted, refresh count
      const data = await api.get<{ votes: number }>(`/public/submissions/${id}/votes`);
      setVoteCount(data.votes);
      setVoteSuccess(true);
    } catch (err: any) {
      let msg = err.message;
      const genericErrors = ['API Error', 'An unexpected error occurred', 'Internal server error'];
      
      if (!msg || genericErrors.includes(msg)) {
        if (err.status === 409) msg = 'You have already voted for this submission.';
        else if (err.status === 403) msg = 'Voting is closed for this event.';
        else if (err.status === 401) msg = 'Please log in to vote.';
        else msg = 'Failed to vote.';
      }

      // Map backend-specific strings to requested user-facing equivalents if needed
      if (err.status === 403 && msg === 'Participants cannot vote for their own team submission') {
        msg = 'You cannot vote for your own submission.';
      }

      setVoteError(msg);
    } finally {
      setSubmittingVote(false);
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !commentBody.trim()) return;
    
    try {
      setSubmittingComment(true);
      setCommentError(null);
      await api.post(`/public/submissions/${id}/comments`, { body: commentBody.trim() });
      setCommentBody('');
      
      // Refresh comments
      const data = await api.get<Comment[]>(`/public/submissions/${id}/comments`);
      setComments(data);
    } catch (err: any) {
      setCommentError(err.message || 'Failed to post comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy-900 bg-grid-pattern relative flex flex-col">
      <Header />
      
      <main className="flex-1 pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full">
        
        {/* Project Header */}
        <div className="bg-navy-800/80 border border-white/10 p-8 mb-8 backdrop-blur-sm">
          <div className="flex items-center space-x-2 text-pink-500 font-mono text-sm mb-4 uppercase tracking-widest">
            <Terminal className="w-4 h-4" />
            <span>Project Details</span>
          </div>
          
          {loadingMetadata ? (
            <div className="flex items-center space-x-2 text-cyan-400 font-mono text-sm animate-pulse mb-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading project details...</span>
            </div>
          ) : metadataError ? (
            <div className="text-red-400 font-mono text-sm flex items-center space-x-2 mb-4">
              <AlertCircle className="w-4 h-4" />
              <span>{metadataError}</span>
            </div>
          ) : submissionMetadata ? (
            <>
              <h1 className="text-3xl sm:text-4xl font-display font-bold text-white mb-4">
                {submissionMetadata.title}
              </h1>
              
              <div className="flex items-center space-x-4 text-gray-400 font-mono">
                <span className="text-cyan-400">Team:</span>
                <span>{submissionMetadata.team_name}</span>
                <span className="text-gray-600">|</span>
                <span className="text-cyan-400">ID:</span>
                <span>{id?.split('-')[0]}</span>
              </div>
            </>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Main Content Area: Comments */}
          <div className="md:col-span-2 space-y-8">
            <div className="bg-navy-800/50 border border-white/10 p-6">
              <h2 className="text-xl font-display font-bold text-white mb-6 flex items-center space-x-2">
                <MessageSquare className="w-5 h-5 text-cyan-400" />
                <span>COMMUNITY COMMENTS</span>
              </h2>
              
              {loadingComments ? (
                <div className="flex items-center space-x-2 text-cyan-400 font-mono text-sm animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading comments...</span>
                </div>
              ) : commentError && !submittingComment ? (
                <div className="text-red-400 font-mono text-sm flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>{commentError}</span>
                </div>
              ) : comments.length === 0 ? (
                <div className="text-gray-500 font-mono text-sm text-center py-8">
                  No comments yet. Be the first to share your thoughts!
                </div>
              ) : (
                <div className="space-y-6">
                  {comments.map(comment => (
                    <div key={comment.id} className="border-l-2 border-white/10 pl-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="text-cyan-400 font-bold text-sm">{comment.display_name}</span>
                        <span className="text-gray-600 font-mono text-xs">
                          {new Date(comment.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-gray-300 text-sm whitespace-pre-wrap">{comment.body}</p>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Comment Form */}
              <div className="mt-8 pt-6 border-t border-white/10">
                {!user ? (
                  <div className="bg-white/5 border border-white/10 p-4 text-center font-mono text-sm text-gray-400">
                    You must log in to post a comment.
                  </div>
                ) : (
                  <form onSubmit={handleComment}>
                    {commentError && (
                      <div className="mb-4 text-red-400 font-mono text-xs flex items-center space-x-2">
                        <AlertCircle className="w-4 h-4" />
                        <span>{commentError}</span>
                      </div>
                    )}
                    <textarea
                      value={commentBody}
                      onChange={e => setCommentBody(e.target.value)}
                      placeholder="Add a constructive comment..."
                      className="w-full bg-navy-900 border border-white/20 text-white placeholder-gray-600 px-4 py-3 font-mono text-sm focus:outline-none focus:border-cyan-400 transition-colors resize-y min-h-[100px] mb-4"
                      maxLength={2000}
                      disabled={submittingComment}
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-mono text-gray-600">
                        {commentBody.length} / 2000
                      </span>
                      <button
                        type="submit"
                        disabled={submittingComment || !commentBody.trim()}
                        className="bg-cyan-400/10 text-cyan-400 border border-cyan-400/30 px-6 py-2 font-mono text-sm tracking-wider uppercase hover:bg-cyan-400/20 disabled:opacity-50 transition-colors flex items-center space-x-2"
                      >
                        {submittingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                        <span>Submit</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar Area: Voting */}
          <div className="space-y-6">
            <div className="bg-navy-800/50 border border-white/10 p-6 text-center">
              <h2 className="text-sm font-mono text-gray-400 uppercase tracking-widest mb-6">
                Community Votes
              </h2>
              
              {loadingVotes ? (
                <div className="flex justify-center my-4 text-pink-500">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
              ) : (
                <div className="text-5xl font-display font-bold text-pink-500 mb-6 drop-shadow-[0_0_15px_rgba(236,72,153,0.3)]">
                  {voteCount !== null ? voteCount : '-'}
                </div>
              )}
              
              {!user ? (
                <div className="text-xs font-mono text-gray-500 bg-white/5 p-3 border border-white/10">
                  Log in to cast your vote
                </div>
              ) : (
                <div className="space-y-4">
                  <button
                    onClick={handleVote}
                    disabled={submittingVote || loadingVotes}
                    className="w-full bg-pink-500/10 text-pink-500 border border-pink-500/30 px-4 py-3 font-mono tracking-wider uppercase hover:bg-pink-500/20 disabled:opacity-50 transition-all flex items-center justify-center space-x-2"
                  >
                    {submittingVote ? <Loader2 className="w-5 h-5 animate-spin" /> : <Heart className="w-5 h-5" />}
                    <span>Vote for Project</span>
                  </button>
                  
                  {voteError && (
                    <div className="text-red-400 text-xs font-mono text-left bg-red-500/10 p-3 border border-red-500/20">
                      {voteError}
                    </div>
                  )}
                  {voteSuccess && !voteError && (
                    <div className="text-green-400 text-xs font-mono text-left bg-green-500/10 p-3 border border-green-500/20">
                      Vote recorded successfully.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
