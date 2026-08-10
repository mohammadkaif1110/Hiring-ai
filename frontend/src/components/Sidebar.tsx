"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

function OrgSwitcher() {
  const { orgs, currentOrg, setCurrentOrg } = useAuth();
  const [open, setOpen] = useState(false);

  if (orgs.length === 0) return null;

  return (
    <div className="org-switcher">
      <button className="org-selector" onClick={() => setOpen(!open)}>
        <span style={{
          width: 24, height: 24, borderRadius: 6,
          background: 'var(--gradient-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0
        }}>
          {currentOrg?.organization.name?.[0]?.toUpperCase() || '?'}
        </span>
        <span className="truncate" style={{ flex: 1, textAlign: 'left' }}>
          {currentOrg?.organization.name || 'Select Org'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>▼</span>
      </button>

      {open && (
        <div className="org-dropdown">
          {orgs.map((membership) => (
            <div
              key={membership.id}
              className={`org-option ${currentOrg?.id === membership.id ? 'selected' : ''}`}
              onClick={() => { setCurrentOrg(membership); setOpen(false); }}
            >
              <span>{membership.organization.name}</span>
              <span className="badge" style={{
                fontSize: 10, padding: '2px 6px',
                background: 'var(--bg-tertiary)'
              }}>
                {membership.role}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user, signOut, currentOrg } = useAuth();

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: '📊' },
    { href: '/workflows/new', label: 'New Workflow', icon: '➕' },
    { href: '/settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span style={{ fontSize: 24 }}>⚡</span>
          FlowForge AI
        </div>
      </div>

      <div style={{ padding: '12px 16px' }}>
        <OrgSwitcher />
      </div>

      {currentOrg && (
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Quota Usage
          </div>
          <div className="quota-bar">
            <div
              className={`quota-fill ${(currentOrg.organization.quota_used / currentOrg.organization.quota_limit) > 0.8 ? 'warning' : ''}`}
              style={{ width: `${Math.min(100, (currentOrg.organization.quota_used / currentOrg.organization.quota_limit) * 100)}%` }}
            />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
            {currentOrg.organization.quota_used} / {currentOrg.organization.quota_limit} runs
          </div>
        </div>
      )}

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link ${pathname === item.href ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
          {user?.displayName || user?.email || 'User'}
        </div>
        <button className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={signOut}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
