"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { nhost } from '@/lib/nhost';

interface User {
  id: string;
  email: string;
  displayName: string;
}

interface OrgMembership {
  id: string;
  role: 'owner' | 'editor' | 'viewer';
  organization: {
    id: string;
    name: string;
    slug: string;
    quota_limit: number;
    quota_used: number;
    quota_reset_at: string;
  };
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  orgs: OrgMembership[];
  currentOrg: OrgMembership | null;
  currentRole: 'owner' | 'editor' | 'viewer' | null;
  setCurrentOrg: (org: OrgMembership) => void;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshOrgs: () => Promise<void>;
  graphqlRequest: (query: string, variables?: any) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [orgs, setOrgs] = useState<OrgMembership[]>([]);
  const [currentOrg, setCurrentOrg] = useState<OrgMembership | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const refreshTokenRef = useRef<string | null>(null);

  const refreshAccessToken = useCallback(async () => {
    if (!refreshTokenRef.current) return null;
    try {
      const result = await nhost.auth.refreshToken({ refreshToken: refreshTokenRef.current });
      if (result.body?.accessToken) {
        accessTokenRef.current = result.body.accessToken;
        refreshTokenRef.current = result.body.refreshToken;
        const stored = localStorage.getItem('nhost_session');
        if (stored) {
          const session = JSON.parse(stored);
          session.accessToken = result.body.accessToken;
          session.refreshToken = result.body.refreshToken;
          localStorage.setItem('nhost_session', JSON.stringify(session));
        }
        return result.body.accessToken;
      }
    } catch (e) {
      console.error('Token refresh failed:', e);
    }
    return null;
  }, []);

  const graphqlRequest = useCallback(async (query: string, variables?: any, isRetry = false): Promise<any> => {
    let token = accessTokenRef.current;
    let graphqlUrl = process.env.NEXT_PUBLIC_NHOST_GRAPHQL_URL || 'http://localhost:1337/v1/graphql';
    if (graphqlUrl.endsWith('/v1')) {
      graphqlUrl += '/graphql';
    }
    
    const response = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });

    const result = await response.json();
    if (result.errors) {
      const msg = result.errors[0]?.message || '';
      // If token expired or field not found (role degraded), attempt single refresh & retry
      if (!isRetry && (msg.includes('not found') || msg.includes('JWT') || msg.includes('unauthorized') || msg.includes('Could not verify'))) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          return graphqlRequest(query, variables, true);
        }
      }
      throw new Error(msg || 'GraphQL Error');
    }
    return result.data;
  }, [refreshAccessToken]);

  const fetchOrgs = useCallback(async () => {
    if (!user) return;
    try {
      const data = await graphqlRequest(
        `query GetUserOrgs($userId: uuid!) {
          org_members(where: { user_id: { _eq: $userId } }) {
            id
            role
            organization {
              id
              name
              slug
              quota_limit
              quota_used
              quota_reset_at
            }
          }
        }`,
        { userId: user.id }
      );
      const memberships = data.org_members || [];
      setOrgs(memberships);
      
      if (memberships.length > 0 && !currentOrg) {
        setCurrentOrg(memberships[0]);
      }
    } catch (err) {
      console.error('Failed to fetch orgs:', err);
    }
  }, [user, graphqlRequest, currentOrg]);

  // Check for stored session on mount & refresh token if present
  useEffect(() => {
    const initSession = async () => {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('nhost_session') : null;
      if (stored) {
        try {
          const session = JSON.parse(stored);
          accessTokenRef.current = session.accessToken;
          refreshTokenRef.current = session.refreshToken;
          setUser(session.user);

          // Proactively refresh token on app load
          if (session.refreshToken) {
            const freshToken = await nhost.auth.refreshToken({ refreshToken: session.refreshToken }).catch(() => null);
            if (freshToken?.body?.accessToken) {
              accessTokenRef.current = freshToken.body.accessToken;
              refreshTokenRef.current = freshToken.body.refreshToken;
              session.accessToken = freshToken.body.accessToken;
              session.refreshToken = freshToken.body.refreshToken;
              localStorage.setItem('nhost_session', JSON.stringify(session));
            }
          }
        } catch {
          localStorage.removeItem('nhost_session');
        }
      }
      setIsLoading(false);
    };
    initSession();
  }, []);

  // Fetch orgs when user changes
  useEffect(() => {
    if (user) {
      fetchOrgs();
    }
  }, [user, fetchOrgs]);

  // Token refresh timer
  useEffect(() => {
    if (!refreshTokenRef.current) return;
    
    const refreshInterval = setInterval(async () => {
      try {
        const result = await nhost.auth.refreshToken({ refreshToken: refreshTokenRef.current! });
        if (result.body) {
          accessTokenRef.current = result.body.accessToken;
          refreshTokenRef.current = result.body.refreshToken;
          const stored = localStorage.getItem('nhost_session');
          if (stored) {
            const session = JSON.parse(stored);
            session.accessToken = result.body.accessToken;
            session.refreshToken = result.body.refreshToken;
            localStorage.setItem('nhost_session', JSON.stringify(session));
          }
        }
      } catch {
        // Token refresh failed — will be handled on next API call
      }
    }, 4 * 60 * 1000); // Refresh every 4 minutes (tokens expire in 15 min)

    return () => clearInterval(refreshInterval);
  }, [user]);

  const signIn = async (email: string, password: string) => {
    try {
      const result = await nhost.auth.signInEmailPassword({ email, password });

      if (result.body?.session) {
        const session = result.body.session;
        accessTokenRef.current = session.accessToken;
        refreshTokenRef.current = session.refreshToken;
        
        const userData: User = {
          id: session.user?.id || '',
          email: session.user?.email || email,
          displayName: session.user?.displayName || session.user?.email || email,
        };
        
        setUser(userData);
        
        // Store session
        localStorage.setItem('nhost_session', JSON.stringify({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          user: userData,
        }));

        return { error: null };
      }
      
      return { error: { message: 'Sign in failed — no session returned' } };
    } catch (err: any) {
      return { error: { message: err.message || 'Sign in failed' } };
    }
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    try {
      const result = await nhost.auth.signUpEmailPassword({
        email,
        password,
        options: { displayName },
      });

      // If session is returned (no email verification required), auto-login
      if (result.body?.session) {
        const session = result.body.session;
        accessTokenRef.current = session.accessToken;
        refreshTokenRef.current = session.refreshToken;
        
        const userData: User = {
          id: session.user?.id || '',
          email: session.user?.email || email,
          displayName: session.user?.displayName || displayName,
        };
        
        setUser(userData);
        localStorage.setItem('nhost_session', JSON.stringify({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          user: userData,
        }));
      }

      return { error: null };
    } catch (err: any) {
      return { error: { message: err.message || 'Registration failed' } };
    }
  };

  const signOut = async () => {
    try {
      if (refreshTokenRef.current) {
        await nhost.auth.signOut({ refreshToken: refreshTokenRef.current }).catch(() => {});
      }
    } finally {
      accessTokenRef.current = null;
      refreshTokenRef.current = null;
      setUser(null);
      setOrgs([]);
      setCurrentOrg(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('nhost_session');
        window.location.href = '/auth/login';
      }
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    orgs,
    currentOrg,
    currentRole: currentOrg?.role || null,
    setCurrentOrg,
    signIn,
    signUp,
    signOut,
    refreshOrgs: fetchOrgs,
    graphqlRequest,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
