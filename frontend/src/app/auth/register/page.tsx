"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ClientLayout from '@/components/ClientLayout';
import { useAuth } from '@/components/AuthProvider';

function RegisterContent() {
  const { signUp, isAuthenticated } = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    router.push('/dashboard');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    const { error: signUpError } = await signUp(email, password, displayName);
    if (signUpError) {
      setError(signUpError.message || 'Registration failed');
      setLoading(false);
    } else {
      setSuccess('Account created! You can now sign in.');
      setTimeout(() => router.push('/auth/login'), 2000);
    }
  };

  return (
    <div className="auth-container">
      <div className="glass-card-static auth-card">
        <h1 className="auth-title">Join FlowForge AI</h1>
        <p className="auth-subtitle">Create your account to start building workflows</p>

        {error && <div className="error-message mb-md">{error}</div>}
        {success && <div className="success-message mb-md">{success}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div>
            <label className="input-label" htmlFor="reg-name">Full Name</label>
            <input
              id="reg-name"
              type="text"
              className="input-field"
              placeholder="Jane Doe"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="input-label" htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
              type="email"
              className="input-field"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="input-label" htmlFor="reg-password">Password</label>
            <input
              id="reg-password"
              type="password"
              className="input-field"
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
            {loading ? <span className="spinner" /> : null}
            Create Account
          </button>
        </form>

        <p className="auth-footer">
          Already have an account?{' '}
          <a href="/auth/login">Sign in</a>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <ClientLayout>
      <RegisterContent />
    </ClientLayout>
  );
}
