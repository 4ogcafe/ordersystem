import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import type { TabIntent } from './TopBar';
import { toast } from 'react-hot-toast';
import { ChefHat, Plus, ShieldCheck, UserCog, X } from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';

type Role = 'ADMIN' | 'STAFF' | 'KITCHEN';

interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

const ROLES: { value: Role; label: string; description: string }[] = [
  { value: 'ADMIN', label: 'Admin', description: 'Everything, including settings, members and staff accounts.' },
  { value: 'STAFF', label: 'Staff', description: 'Orders, the stamp counter, menu items and the kitchen display.' },
  { value: 'KITCHEN', label: 'Kitchen', description: 'Only the kitchen display (/kitchen). Best for the shared kitchen tablet.' },
];
const MIN_PASSWORD = 8;
const ROLE_ICON = { ADMIN: ShieldCheck, STAFF: UserCog, KITCHEN: ChefHat };

/** Staff accounts: who can sign in to the admin or the kitchen display, and with what access. */
export default function StaffUsersTab({ currentUserId, intent }: { currentUserId: string; intent?: TabIntent | null }) {
  const [users, setUsers] = useState<StaffUser[] | null>(null);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (intent?.action === 'add-user') setCreating(true);
  }, [intent]);

  const load = useCallback(() => {
    apiFetch('/api/v1/users')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(setUsers)
      .catch(() => toast.error('Could not load staff users.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>Give the kitchen tablet its own <strong>Kitchen</strong> account: it opens straight to the kitchen display and can't see anything else.</p>
        <button type="button" onClick={() => setCreating(true)} style={primaryButton}><Plus size={16} /> Add user</button>
      </div>

      <div style={panelStyle}>
        {!users ? (
          <p style={{ padding: '1.5rem', margin: 0 }}>Loading…</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  {['Name', 'Email', 'Role', 'Status', ''].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const Icon = ROLE_ICON[user.role] ?? UserCog;
                  return (
                    <tr key={user.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{user.name}{user.id === currentUserId && <span style={{ color: '#6b7280', fontWeight: 400 }}> (you)</span>}</td>
                      <td style={tdStyle}>{user.email}</td>
                      <td style={tdStyle}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Icon size={16} /> {ROLES.find(r => r.value === user.role)?.label ?? user.role}</span></td>
                      <td style={tdStyle}>
                        <span style={{ backgroundColor: user.isActive ? '#d1fae5' : '#f3f4f6', color: user.isActive ? '#059669' : '#6b7280', padding: '4px 10px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <button type="button" onClick={() => setEditing(user)} style={smallButton}>Edit</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && <UserForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {editing && <UserForm user={editing} isSelf={editing.id === currentUserId} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function UserForm({ user, isSelf = false, onClose, onSaved }: { user?: StaffUser; isSelf?: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: user?.name ?? '', email: user?.email ?? '', role: user?.role ?? ('KITCHEN' as Role), isActive: user?.isActive ?? true, password: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if ((!user || form.password) && form.password.length < MIN_PASSWORD) {
      toast.error(`The password needs at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setSaving(true);
    try {
      const res = user
        ? await apiFetch(`/api/v1/users/${user.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: form.role, isActive: form.isActive, ...(form.password ? { password: form.password } : {}) }),
          })
        : await apiFetch('/api/v1/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: form.name, email: form.email, role: form.role, password: form.password }),
          });
      if (res.ok) {
        toast.success(user ? 'User updated.' : `${form.name} can now sign in at /login.`);
        onSaved();
      } else toast.error(await errorMessage(res, 'Could not save the user.'));
    } catch {
      toast.error('Network error.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="user-form-title" style={overlayStyle} onClick={onClose}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()} style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '12px', width: '100%', maxWidth: '440px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 id="user-form-title" style={{ margin: 0, fontSize: '1.2rem' }}>{user ? 'Edit user' : 'Add user'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <label style={labelStyle}>
          Name
          <input required maxLength={100} disabled={Boolean(user)} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Kitchen tablet" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Email (used to sign in)
          <input required type="email" maxLength={254} disabled={Boolean(user)} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="kitchen@adarsha.example" autoComplete="off" style={inputStyle} />
        </label>
        <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <legend style={{ ...labelStyle, marginBottom: '0.5rem' }}>Access</legend>
          {ROLES.map(role => (
            <label key={role.value} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '0.6rem 0.75rem', border: `1px solid ${form.role === role.value ? '#111827' : '#e5e7eb'}`, borderRadius: '8px', cursor: isSelf ? 'not-allowed' : 'pointer', opacity: isSelf && role.value !== 'ADMIN' ? 0.5 : 1 }}>
              <input type="radio" name="role" value={role.value} checked={form.role === role.value} disabled={isSelf} onChange={() => setForm({ ...form, role: role.value })} style={{ marginTop: '3px' }} />
              <span><strong>{role.label}</strong><span style={{ display: 'block', color: '#6b7280', fontSize: '0.8rem' }}>{role.description}</span></span>
            </label>
          ))}
          {isSelf && <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>You can't change your own access.</span>}
        </fieldset>
        {user && (
          <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
            <input type="checkbox" checked={form.isActive} disabled={isSelf} onChange={e => setForm({ ...form, isActive: e.target.checked })} />
            Active (can sign in)
          </label>
        )}
        <label style={labelStyle}>
          {user ? 'New password (leave empty to keep the current one)' : 'Password'}
          <input type="password" required={!user} minLength={MIN_PASSWORD} maxLength={200} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} autoComplete="new-password" style={inputStyle} />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button type="button" onClick={onClose} style={smallButton}>Cancel</button>
          <button type="submit" disabled={saving} style={primaryButton}>{saving ? 'Saving…' : user ? 'Save' : 'Create user'}</button>
        </div>
      </form>
    </div>
  );
}

const panelStyle: CSSProperties = { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb' };
const thStyle: CSSProperties = { padding: '0.9rem 1.25rem', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280', fontWeight: 600, letterSpacing: '0.5px' };
const tdStyle: CSSProperties = { padding: '0.9rem 1.25rem', color: '#374151' };
const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' };
const inputStyle: CSSProperties = { width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '8px', backgroundColor: '#f9fafb', boxSizing: 'border-box', fontSize: '0.95rem' };
const smallButton: CSSProperties = { padding: '0.5rem 1rem', border: '1px solid #d1d5db', background: '#fff', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 };
const primaryButton: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0.6rem 1.1rem', background: '#000', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 };
const overlayStyle: CSSProperties = { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' };
