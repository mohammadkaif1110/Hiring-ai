"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ClientLayout from '@/components/ClientLayout';
import { useAuth } from '@/components/AuthProvider';
import Sidebar from '@/components/Sidebar';

interface OrgMember {
  id: string;
  role: string;
  joined_at: string;
  user_id: string;
}

function SettingsContent() {
  const { isAuthenticated, isLoading, currentOrg, currentRole, graphqlRequest, user } = useAuth();
  const router = useRouter();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');

  const fetchMembers = useCallback(async () => {
    if (!currentOrg) return;
    try {
      const data = await graphqlRequest(
        `query GetOrgMembers($orgId: uuid!) {
          org_members(where: { org_id: { _eq: $orgId } }) {
            id
            role
            joined_at
            user_id
          }
        }`,
        { orgId: currentOrg.organization.id }
      );
      setMembers(data.org_members || []);
    } catch (err) {
      console.error('Failed to fetch members:', err);
    } finally {
      setLoading(false);
    }
  }, [currentOrg, graphqlRequest]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push('/auth/login');
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (currentOrg) {
      setLoading(true);
      fetchMembers();
    }
  }, [currentOrg, fetchMembers]);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim() || !newOrgSlug.trim()) return;
    setCreating(true);
    setMessage('');
    try {
      // Create the org first (as admin via a workaround — in production this would be a Hasura Action)
      const data = await graphqlRequest(
        `mutation CreateOrg($name: String!, $slug: String!) {
          insert_organizations_one(object: { name: $name, slug: $slug }) {
            id name slug
          }
        }`,
        { name: newOrgName.trim(), slug: newOrgSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') }
      );
      
      // Add current user as owner
      await graphqlRequest(
        `mutation AddMember($orgId: uuid!, $userId: uuid!) {
          insert_org_members_one(object: { org_id: $orgId, user_id: $userId, role: owner }) {
            id
          }
        }`,
        { orgId: data.insert_organizations_one.id, userId: user?.id }
      );

      setMessage('✅ Organization created! Refresh to see it in the org switcher.');
      setNewOrgName('');
      setNewOrgSlug('');
    } catch (err: any) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  if (isLoading) return <div className="auth-container"><div className="spinner spinner-lg" /></div>;
  if (!isAuthenticated) return null;

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Settings</h1>
            <p className="page-subtitle">Manage organization and members</p>
          </div>
        </div>

        {message && (
          <div className={message.startsWith('✅') ? 'success-message' : 'error-message'} style={{ marginBottom: 16 }}>
            {message}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Create org */}
          <div className="glass-card-static" style={{ padding: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Create Organization</h2>
            <form className="flex-col gap-sm" onSubmit={handleCreateOrg}>
              <div>
                <label className="input-label">Organization Name</label>
                <input
                  className="input-field"
                  placeholder="Acme Corp"
                  value={newOrgName}
                  onChange={(e) => { setNewOrgName(e.target.value); setNewOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-')); }}
                />
              </div>
              <div>
                <label className="input-label">Slug</label>
                <input
                  className="input-field"
                  placeholder="acme-corp"
                  value={newOrgSlug}
                  onChange={(e) => setNewOrgSlug(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? <span className="spinner" /> : null}
                Create Organization
              </button>
            </form>
          </div>

          {/* Members */}
          {currentOrg && (
            <div className="glass-card-static" style={{ padding: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
                Members — {currentOrg.organization.name}
              </h2>

              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
                  <div className="spinner" />
                </div>
              ) : (
                <div className="flex-col gap-sm">
                  {members.map((member) => (
                    <div key={member.id} className="step-card" style={{ cursor: 'default' }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'var(--gradient-accent)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 600, fontSize: 13, color: 'white', flexShrink: 0
                      }}>
                        👤
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>User ID</div>
                        <div className="text-xs text-muted font-mono">{member.user_id}</div>
                      </div>
                      <span className={`badge`} style={{
                        background: member.role === 'owner' ? 'rgba(139,92,246,0.15)' : member.role === 'editor' ? 'rgba(59,130,246,0.15)' : 'rgba(107,114,128,0.15)',
                        color: member.role === 'owner' ? '#a78bfa' : member.role === 'editor' ? '#60a5fa' : '#9ca3af',
                      }}>
                        {member.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Quota details */}
              <div style={{ marginTop: 20, padding: 16, background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Usage & Quota</h3>
                <div className="quota-bar" style={{ marginBottom: 8 }}>
                  <div
                    className={`quota-fill ${(currentOrg.organization.quota_used / currentOrg.organization.quota_limit) > 0.8 ? 'warning' : ''}`}
                    style={{ width: `${Math.min(100, (currentOrg.organization.quota_used / currentOrg.organization.quota_limit) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm text-muted">
                  <span>{currentOrg.organization.quota_used} used</span>
                  <span>{currentOrg.organization.quota_limit} limit</span>
                </div>
                <div className="text-xs text-muted mt-sm">
                  Resets: {new Date(currentOrg.organization.quota_reset_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ClientLayout>
      <SettingsContent />
    </ClientLayout>
  );
}
