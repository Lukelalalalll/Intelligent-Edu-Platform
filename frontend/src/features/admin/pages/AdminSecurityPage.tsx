import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import client from '@/shared/api/client';
import { useAuthStore } from '@/shared/store/useAuthStore';
import styles from '../styles/AdminSecurityPage.module.css';

type SecurityOverview = {
    windowHours: number;
    totals: {
        events: number;
        warnings: number;
        errors: number;
        loginFailures: number;
        activeLockouts: number;
        mfaEvents: number;
    };
};

type SecurityEvent = {
    id: string;
    level: string;
    requestId: string;
    userId: string;
    endpoint: string;
    action: string;
    detail: string;
    createdAt: string;
    extra?: Record<string, unknown>;
};

type LockoutEntry = {
    scopeKey: string;
    scope: string;
    attemptCount: number;
    lockedUntil: string | null;
    windowStartedAt: string | null;
    lastFailureAt: string | null;
    metadata?: Record<string, unknown>;
};

type SecurityUser = {
    id: string;
    username: string;
    email: string;
    role: string;
    status: 'active' | 'disabled' | 'suspended';
    mfaEnabled: boolean;
    lockedOut: boolean;
    lockedUntil: string | null;
    updatedAt: string | null;
    passwordChangedAt: string | null;
};

function formatDateTime(value: string | null): string {
    if (!value) return 'N/A';
    try {
        return new Date(value).toLocaleString();
    } catch {
        return value;
    }
}

function toneClass(level: string): string {
    if (level === 'error') return styles.badgeError;
    if (level === 'warning') return styles.badgeWarning;
    return styles.badgeInfo;
}

function userStatusClass(status: string): string {
    if (status === 'disabled') return styles.statusDisabled;
    if (status === 'suspended') return styles.statusSuspended;
    return styles.statusActive;
}

export default function AdminSecurityPage() {
    const storeUser = useAuthStore((s) => s.user);
    const isAdmin = storeUser?.role === 'admin';

    const [overview, setOverview] = useState<SecurityOverview | null>(null);
    const [events, setEvents] = useState<SecurityEvent[]>([]);
    const [lockouts, setLockouts] = useState<LockoutEntry[]>([]);
    const [users, setUsers] = useState<SecurityUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [eventLevel, setEventLevel] = useState('');
    const [eventAction, setEventAction] = useState('');
    const [userQuery, setUserQuery] = useState('');
    const [userStatusFilter, setUserStatusFilter] = useState('');
    const [busyLockoutKey, setBusyLockoutKey] = useState('');
    const [busyUserId, setBusyUserId] = useState('');
    const hasCompletedInitialLoad = useRef(false);

    const filteredEvents = useMemo(() => {
        return events.filter((event) => {
            if (eventLevel && event.level !== eventLevel) return false;
            if (eventAction && !event.action.toLowerCase().includes(eventAction.toLowerCase())) return false;
            return true;
        });
    }, [events, eventAction, eventLevel]);

    const loadPage = async (isRefresh = false) => {
        try {
            setErrorMsg('');
            if (isRefresh) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }
            const [overviewRes, eventsRes, lockoutsRes, usersRes] = await Promise.all([
                client.get('/admin/security/overview'),
                client.get('/admin/security/events', { params: { limit: 80 } }),
                client.get('/admin/security/lockouts', { params: { limit: 80 } }),
                client.get('/admin/security/users', {
                    params: {
                        limit: 120,
                        q: userQuery,
                        status: userStatusFilter,
                    },
                }),
            ]);
            setOverview(overviewRes.data);
            setEvents(eventsRes.data?.events || []);
            setLockouts(lockoutsRes.data?.lockouts || []);
            setUsers(usersRes.data?.users || []);
            hasCompletedInitialLoad.current = true;
        } catch (error: any) {
            setErrorMsg(error.response?.data?.detail || 'Failed to load security dashboard');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadPage(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!hasCompletedInitialLoad.current) {
            return undefined;
        }
        const timer = window.setTimeout(() => {
            if (!loading) {
                loadPage(true);
            }
        }, 250);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userQuery, userStatusFilter]);

    if (!isAdmin) {
        return <Navigate to="/" replace />;
    }

    const clearLockout = async (scopeKey: string) => {
        try {
            setBusyLockoutKey(scopeKey);
            await client.post('/admin/security/lockouts/clear', { scope_key: scopeKey });
            await loadPage(true);
        } catch (error: any) {
            setErrorMsg(error.response?.data?.detail || 'Failed to clear lockout');
        } finally {
            setBusyLockoutKey('');
        }
    };

    const updateUserStatus = async (userId: string, status: SecurityUser['status']) => {
        try {
            setBusyUserId(userId);
            await client.post(`/admin/security/users/${encodeURIComponent(userId)}/status`, { status });
            await loadPage(true);
        } catch (error: any) {
            setErrorMsg(error.response?.data?.detail || 'Failed to update user status');
        } finally {
            setBusyUserId('');
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <h1>Security Operations</h1>
                    <p>Audit authentication activity, review active lockouts, and control account status from one admin surface.</p>
                </div>
                <button className={styles.refreshButton} type="button" onClick={() => loadPage(true)} disabled={refreshing}>
                    <i className={`fas ${refreshing ? 'fa-circle-notch fa-spin' : 'fa-rotate-right'}`}></i>
                    <span>{refreshing ? 'Refreshing' : 'Refresh'}</span>
                </button>
            </div>

            {errorMsg ? <div className={styles.errorBanner}>{errorMsg}</div> : null}

            {loading ? (
                <div className={styles.loadingState}>Loading security dashboard...</div>
            ) : (
                <>
                    <section className={styles.metricsGrid}>
                        <article className={styles.metricCard}>
                            <span>Events ({overview?.windowHours ?? 24}h)</span>
                            <strong>{overview?.totals.events ?? 0}</strong>
                        </article>
                        <article className={styles.metricCard}>
                            <span>Warnings</span>
                            <strong>{overview?.totals.warnings ?? 0}</strong>
                        </article>
                        <article className={styles.metricCard}>
                            <span>Login Failures</span>
                            <strong>{overview?.totals.loginFailures ?? 0}</strong>
                        </article>
                        <article className={styles.metricCard}>
                            <span>Active Lockouts</span>
                            <strong>{overview?.totals.activeLockouts ?? 0}</strong>
                        </article>
                        <article className={styles.metricCard}>
                            <span>MFA Events</span>
                            <strong>{overview?.totals.mfaEvents ?? 0}</strong>
                        </article>
                        <article className={styles.metricCard}>
                            <span>Errors</span>
                            <strong>{overview?.totals.errors ?? 0}</strong>
                        </article>
                    </section>

                    <section className={styles.panelGrid}>
                        <section className={styles.panel}>
                            <div className={styles.panelHeader}>
                                <div>
                                    <h2>Recent Security Events</h2>
                                    <p>Latest persisted authentication and account-protection events.</p>
                                </div>
                                <div className={styles.inlineFilters}>
                                    <select value={eventLevel} onChange={(e) => setEventLevel(e.target.value)}>
                                        <option value="">All Levels</option>
                                        <option value="info">Info</option>
                                        <option value="warning">Warning</option>
                                        <option value="error">Error</option>
                                    </select>
                                    <input
                                        value={eventAction}
                                        onChange={(e) => setEventAction(e.target.value)}
                                        placeholder="Filter action"
                                    />
                                </div>
                            </div>
                            <div className={styles.tableWrap}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>When</th>
                                            <th>Level</th>
                                            <th>Action</th>
                                            <th>User</th>
                                            <th>Detail</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredEvents.length === 0 ? (
                                            <tr><td colSpan={5} className={styles.emptyRow}>No matching events.</td></tr>
                                        ) : filteredEvents.map((event) => (
                                            <tr key={event.id}>
                                                <td>{formatDateTime(event.createdAt)}</td>
                                                <td><span className={`${styles.badge} ${toneClass(event.level)}`}>{event.level}</span></td>
                                                <td>
                                                    <div className={styles.primaryText}>{event.action}</div>
                                                    <div className={styles.secondaryText}>{event.endpoint}</div>
                                                </td>
                                                <td>{event.userId}</td>
                                                <td>{event.detail}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <section className={styles.panel}>
                            <div className={styles.panelHeader}>
                                <div>
                                    <h2>Active Lockouts</h2>
                                    <p>Current counters that are still in a locked state.</p>
                                </div>
                            </div>
                            <div className={styles.lockoutList}>
                                {lockouts.length === 0 ? (
                                    <div className={styles.emptyState}>No active lockouts right now.</div>
                                ) : lockouts.map((lockout) => (
                                    <article key={lockout.scopeKey} className={styles.lockoutCard}>
                                        <div>
                                            <div className={styles.primaryText}>{lockout.scope}</div>
                                            <div className={styles.secondaryText}>{lockout.scopeKey}</div>
                                            <div className={styles.secondaryText}>
                                                {String(lockout.metadata?.ip_address || 'No IP captured')}
                                            </div>
                                        </div>
                                        <div className={styles.lockoutMeta}>
                                            <span>{lockout.attemptCount} attempts</span>
                                            <span>Until {formatDateTime(lockout.lockedUntil)}</span>
                                        </div>
                                        <button
                                            className={styles.inlineAction}
                                            type="button"
                                            disabled={busyLockoutKey === lockout.scopeKey}
                                            onClick={() => clearLockout(lockout.scopeKey)}
                                        >
                                            {busyLockoutKey === lockout.scopeKey ? 'Clearing...' : 'Clear Lockout'}
                                        </button>
                                    </article>
                                ))}
                            </div>
                        </section>
                    </section>

                    <section className={styles.panel}>
                        <div className={styles.panelHeader}>
                            <div>
                                <h2>User Security Controls</h2>
                                <p>Search accounts, inspect MFA posture, and enforce account status.</p>
                            </div>
                            <div className={styles.inlineFilters}>
                                <input
                                    value={userQuery}
                                    onChange={(e) => setUserQuery(e.target.value)}
                                    placeholder="Search username or email"
                                />
                                <select value={userStatusFilter} onChange={(e) => setUserStatusFilter(e.target.value)}>
                                    <option value="">All Statuses</option>
                                    <option value="active">Active</option>
                                    <option value="disabled">Disabled</option>
                                    <option value="suspended">Suspended</option>
                                </select>
                            </div>
                        </div>
                        <div className={styles.tableWrap}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>User</th>
                                        <th>Role</th>
                                        <th>MFA</th>
                                        <th>Lockout</th>
                                        <th>Status</th>
                                        <th>Updated</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.length === 0 ? (
                                        <tr><td colSpan={7} className={styles.emptyRow}>No users found.</td></tr>
                                    ) : users.map((user) => (
                                        <tr key={user.id}>
                                            <td>
                                                <div className={styles.primaryText}>{user.username}</div>
                                                <div className={styles.secondaryText}>{user.email}</div>
                                            </td>
                                            <td>{user.role}</td>
                                            <td>
                                                <span className={`${styles.badge} ${user.mfaEnabled ? styles.badgeInfo : styles.badgeNeutral}`}>
                                                    {user.mfaEnabled ? 'Enabled' : 'Disabled'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`${styles.badge} ${user.lockedOut ? styles.badgeWarning : styles.badgeNeutral}`}>
                                                    {user.lockedOut ? `Locked until ${formatDateTime(user.lockedUntil)}` : 'Clear'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`${styles.statusPill} ${userStatusClass(user.status)}`}>{user.status}</span>
                                            </td>
                                            <td>{formatDateTime(user.updatedAt)}</td>
                                            <td>
                                                <div className={styles.actionRow}>
                                                    <button
                                                        type="button"
                                                        className={styles.inlineAction}
                                                        disabled={busyUserId === user.id || user.status === 'active'}
                                                        onClick={() => updateUserStatus(user.id, 'active')}
                                                    >
                                                        Set Active
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={styles.inlineAction}
                                                        disabled={busyUserId === user.id || user.status === 'suspended'}
                                                        onClick={() => updateUserStatus(user.id, 'suspended')}
                                                    >
                                                        Suspend
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`${styles.inlineAction} ${styles.inlineDanger}`}
                                                        disabled={busyUserId === user.id || user.status === 'disabled'}
                                                        onClick={() => updateUserStatus(user.id, 'disabled')}
                                                    >
                                                        Disable
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
