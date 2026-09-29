import { useState, type FormEvent } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { api, ApiError } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { login, user } = useAuth();

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!email || !password) {
      setError('Please fill in all required fields.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await api.post<{ data: { token: string; user: any } }>('/auth/login', {
        email,
        password
      });
      
      login(response.data.token, response.data.user);
      navigate('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to connect to the server. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout title="System Access" subtitle="AUTHENTICATE_USER">
      <form className="space-y-6" onSubmit={handleSubmit}>
        
        {error && (
          <div className="bg-pink-500/10 border border-pink-500/50 p-4">
            <p className="text-sm font-mono text-pink-500 tracking-wide uppercase">
              ERROR: {error}
            </p>
          </div>
        )}

        <Input
          label="Email Address"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <div className="pt-2">
          <Button type="submit" className="w-full" isLoading={isLoading}>
            Initialize Session
          </Button>
        </div>

        <div className="text-center mt-6">
          <p className="text-sm font-sans text-gray-400">
            No active credentials?{' '}
            <Link to="/register" className="font-mono text-cyan-400 hover:text-cyan-300 tracking-wide uppercase">
              Request Access
            </Link>
          </p>
        </div>
      </form>
    </AuthLayout>
  );
}
