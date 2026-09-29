import { useState, type FormEvent } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { api, ApiError } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function Register() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!email || !password || !displayName) {
      setError('Please fill in all required fields.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setIsLoading(true);

    try {
      await api.post('/auth/register', {
        email,
        password,
        display_name: displayName
      });
      
      // Navigate to login with success state (handled simply here)
      navigate('/login', { state: { message: 'Registration successful. Please authenticate.' } });
    } catch (err) {
      if (err instanceof ApiError) {
        // Form field errors from Zod backend validation
        if (err.details && Array.isArray(err.details)) {
          const messages = err.details.map((d: any) => d.message).join(' | ');
          setError(messages);
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to connect to the server. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout title="New Credential" subtitle="REGISTER_USER">
      <form className="space-y-6" onSubmit={handleSubmit}>
        
        {error && (
          <div className="bg-pink-500/10 border border-pink-500/50 p-4">
            <p className="text-sm font-mono text-pink-500 tracking-wide uppercase">
              ERROR: {error}
            </p>
          </div>
        )}

        <Input
          label="Display Name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />

        <Input
          label="Email Address"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <Input
          label="Password (Min 8)"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <div className="pt-2">
          <Button type="submit" className="w-full" isLoading={isLoading}>
            Generate Identity
          </Button>
        </div>

        <div className="text-center mt-6">
          <p className="text-sm font-sans text-gray-400">
            Already registered?{' '}
            <Link to="/login" className="font-mono text-cyan-400 hover:text-cyan-300 tracking-wide uppercase">
              Return to Login
            </Link>
          </p>
        </div>
      </form>
    </AuthLayout>
  );
}
