"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ClientLayout from '@/components/ClientLayout';
import { useAuth } from '@/components/AuthProvider';

function LoginContent() {
  const { signIn, isAuthenticated } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  if (isAuthenticated) {
    return <div className="auth-container"><div className="spinner spinner-lg" /></div>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: signInError } = await signIn(email, password);
    if (signInError) {
      setError(signInError.message || 'Login failed');
      setLoading(false);
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div className="auth-container">
      <div className="glass-card-static auth-card">
        <h1 className="auth-title">FlowForge AI</h1>
        <p className="auth-subtitle">Sign in to your workflow builder</p>

        {error && <div className="error-message mb-md">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div>
            <label className="input-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              className="input-field"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="input-label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              className="input-field"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
            {loading ? <span className="spinner" /> : null}
            Sign In
          </button>
        </form>

        <p className="auth-footer">
          Don&apos;t have an account?{' '}
          <a href="/auth/register">Create one</a>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <ClientLayout>
      <LoginContent />
    </ClientLayout>
  );
}
