import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { TabIntent } from './TopBar';
import { toast } from 'react-hot-toast';
import { apiFetch, errorMessage } from '../../lib/api';
import { yen } from '../../lib/format';
import CustomerDetails, { type MemberDetails } from './CustomerDetails';

type Customer = MemberDetails;

const MIN_PASSWORD = 8;

export default function CustomersTab({ intent }: { intent?: TabIntent | null }) {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [query, setQuery] = useState('');
  // A member chosen in the top-bar search opens this list filtered to them.
  useEffect(() => {
    if (intent?.action === 'search' && intent.value) setQuery(intent.value);
  }, [intent]);
  const [viewing, setViewing] = useState<Customer | null>(null);

  const load = useCallback(() => {
    apiFetch('/api/v1/customers')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(setCustomers)
      .catch(console.error);
  }, []);

  useEffect(load, [load]);

  const adjustPoints = async (customer: Customer) => {
    const amount = window.prompt(`Add or remove points for ${customer.name} (current: ${customer.points}pt).\nUse a negative number to remove, e.g. -100.`);
    if (amount === null) return;
    const points = Number(amount);
    if (!Number.isInteger(points) || points === 0) {
      toast.error('Enter a whole number other than 0.');
      return;
    }
    const note = window.prompt('Reason (shown in the customer\'s point history):', points > 0 ? 'サービスポイント' : '') ?? '';
    const res = await apiFetch(`/api/v1/customers/${customer.id}/points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points, note }),
    });
    if (res.ok) {
      toast.success('Points updated.');
      load();
    } else toast.error(await errorMessage(res, 'Could not update points.'));
  };

  const resetPassword = async (customer: Customer) => {
    const password = window.prompt(`Set a temporary password for ${customer.name} (${customer.email}).\nAt least ${MIN_PASSWORD} characters. Tell the customer in person or by phone, and ask them to change it on their My Page.`);
    if (password === null) return;
    if (password.length < MIN_PASSWORD) {
      toast.error(`The password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    const res = await apiFetch(`/api/v1/customers/${customer.id}/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) toast.success('Temporary password set.');
    else toast.error(await errorMessage(res, 'Could not reset the password.'));
  };

  const needle = query.trim().toLowerCase();
  const shown = (customers ?? []).filter(c => !needle || [c.name, c.email, c.phone].some(field => field?.toLowerCase().includes(needle)));

  return (
    <section style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Members</h3>
          <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>{customers ? `${customers.length} registered` : 'Loading…'}</p>
        </div>
        <input type="search" placeholder="Search name, email or phone" value={query} onChange={e => setQuery(e.target.value)} style={{ padding: '0.6rem 1rem', border: '1px solid #d1d5db', borderRadius: '9999px', minWidth: '240px' }} />
      </div>

      {customers && shown.length === 0 ? (
        <p style={{ color: '#6b7280' }}>{customers.length === 0 ? 'No members yet. Customers can sign up from the website.' : 'No members match your search.'}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7280' }}>
                {['Name', 'Contact', 'Joined', 'Orders', 'Spent', 'Points', 'Stamps', ''].map(h => <th key={h} style={cellStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {shown.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ ...cellStyle, fontWeight: 600 }}>
                    <button type="button" onClick={() => setViewing(c)} style={{ all: 'unset', cursor: 'pointer', color: '#1d4ed8', textDecoration: 'underline', whiteSpace: 'nowrap' }}>{c.name}</button>
                    {((c.preferences?.allergens?.length ?? 0) > 0 || c.preferences?.otherAllergies) && <span title="Has allergies" style={{ marginLeft: '6px' }}>⚠</span>}
                  </td>
                  <td style={cellStyle}>{c.email}<div style={{ color: '#6b7280' }}>{c.phone || '—'}</div></td>
                  <td style={cellStyle}>{new Date(c.createdAt).toLocaleDateString('ja-JP')}</td>
                  <td style={cellStyle}>{c.completedOrders}</td>
                  <td style={cellStyle}>{yen(c.totalSpent)}</td>
                  <td style={{ ...cellStyle, fontWeight: 600 }}>{c.points.toLocaleString('ja-JP')}pt</td>
                  <td style={cellStyle}>
                    {c.stamps}/{c.stampsPerCard}
                    {c.availableRewards > 0 && <div style={{ color: '#b45309', fontSize: '0.8rem' }}>🎁 {c.availableRewards}</div>}
                  </td>
                  <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                    <button type="button" onClick={() => setViewing(c)} style={smallButton}>Details</button>{' '}
                    <button type="button" onClick={() => adjustPoints(c)} style={smallButton}>Adjust points</button>{' '}
                    <button type="button" onClick={() => resetPassword(c)} style={smallButton}>Reset password</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {viewing && <CustomerDetails member={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}

const cellStyle: CSSProperties = { padding: '0.75rem 0.5rem', verticalAlign: 'top' };
const smallButton: CSSProperties = { padding: '0.4rem 0.8rem', backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 };
