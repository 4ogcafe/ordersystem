import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { KeyRound, LogOut, Mail, Trash2 } from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';
import { useCustomer, type Customer } from '../../lib/customer-context';
import { inputStyle, labelStyle, mutedStyle } from './styles';

type Busy = 'email' | 'password' | 'delete' | null;

/** Email, password, sign-out and account deletion. Every change asks for the current password. */
export default function AccountSecurity({ customer }: { customer: Customer }) {
  const { refresh, signOut } = useCustomer();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<Busy>(null);
  const [emailForm, setEmailForm] = useState({ email: '', currentPassword: '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [deleting, setDeleting] = useState({ open: false, currentPassword: '' });

  const send = async (kind: Exclude<Busy, null>, path: string, method: string, body: unknown, success: string) => {
    setBusy(kind);
    try {
      const res = await apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        toast.error(await errorMessage(res, '処理できませんでした。'));
        return false;
      }
      toast.success(success);
      return true;
    } catch {
      toast.error('通信エラーが発生しました。');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const changeEmail = async (e: FormEvent) => {
    e.preventDefault();
    if (await send('email', '/api/v1/customers/me/email', 'PUT', emailForm, 'メールアドレスを変更しました。次回から新しいアドレスでログインしてください。')) {
      setEmailForm({ email: '', currentPassword: '' });
      await refresh();
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (await send('password', '/api/v1/customers/me/password', 'PUT', passwords, 'パスワードを変更しました。')) {
      setPasswords({ currentPassword: '', newPassword: '' });
    }
  };

  const deleteAccount = async (e: FormEvent) => {
    e.preventDefault();
    if (await send('delete', '/api/v1/customers/me', 'DELETE', { currentPassword: deleting.currentPassword }, '退会手続きが完了しました。ご利用ありがとうございました。')) {
      await refresh();
      navigate('/', { replace: true });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="acc-grid-2">
        <form onSubmit={changeEmail} className="acc-card" style={formStyle}>
          <h2 style={headingStyle}><Mail size={18} aria-hidden="true" color="var(--acc-accent)" />メールアドレスの変更</h2>
          <p style={{ ...mutedStyle, margin: 0 }}>現在：{customer.email}</p>
          <label style={labelStyle}>
            新しいメールアドレス
            <input type="email" required maxLength={254} autoComplete="email" value={emailForm.email} onChange={e => setEmailForm({ ...emailForm, email: e.target.value })} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            現在のパスワード
            <input type="password" required autoComplete="current-password" value={emailForm.currentPassword} onChange={e => setEmailForm({ ...emailForm, currentPassword: e.target.value })} style={inputStyle} />
          </label>
          <button type="submit" className="acc-btn acc-btn-ghost" disabled={busy !== null}>{busy === 'email' ? '変更中…' : 'メールアドレスを変更'}</button>
        </form>

        <form onSubmit={changePassword} className="acc-card" style={formStyle}>
          <h2 style={headingStyle}><KeyRound size={18} aria-hidden="true" color="var(--acc-accent)" />パスワードの変更</h2>
          <label style={labelStyle}>
            現在のパスワード
            <input type="password" required autoComplete="current-password" value={passwords.currentPassword} onChange={e => setPasswords({ ...passwords, currentPassword: e.target.value })} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            新しいパスワード（8文字以上）
            <input type="password" required minLength={8} maxLength={200} autoComplete="new-password" value={passwords.newPassword} onChange={e => setPasswords({ ...passwords, newPassword: e.target.value })} style={inputStyle} />
          </label>
          <button type="submit" className="acc-btn acc-btn-ghost" disabled={busy !== null}>{busy === 'password' ? '変更中…' : 'パスワードを変更'}</button>
        </form>
      </div>

      <section className="acc-card" style={{ ...formStyle, borderColor: '#f5d0c5' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button type="button" onClick={signOut} className="acc-btn acc-btn-ghost"><LogOut size={18} aria-hidden="true" />ログアウト</button>
          {!deleting.open && (
            <button type="button" className="acc-link" style={{ color: '#b42318' }} onClick={() => setDeleting({ open: true, currentPassword: '' })}>
              <Trash2 size={16} aria-hidden="true" />退会する
            </button>
          )}
        </div>
        {deleting.open && (
          <form onSubmit={deleteAccount} style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid #f5d0c5', paddingTop: '16px' }}>
            <h2 style={{ ...headingStyle, color: '#b42318' }}><Trash2 size={18} aria-hidden="true" />退会の手続き</h2>
            <ul style={{ margin: 0, paddingLeft: '1.2em', lineHeight: 1.8, fontSize: '0.9rem' }}>
              <li>お名前・連絡先・ご住所などの個人情報は削除され、元に戻せません。</li>
              <li>保有ポイント（{customer.points.toLocaleString('ja-JP')}pt）と未使用の特典は失効します。</li>
              <li>進行中のご注文がある場合は、お受け取り後に退会してください。</li>
            </ul>
            <label style={labelStyle}>
              確認のため現在のパスワードを入力
              <input type="password" required autoComplete="current-password" value={deleting.currentPassword} onChange={e => setDeleting({ ...deleting, currentPassword: e.target.value })} style={inputStyle} />
            </label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button type="submit" className="acc-btn" disabled={busy !== null} style={{ background: '#b42318' }}>{busy === 'delete' ? '処理中…' : '退会する'}</button>
              <button type="button" className="acc-btn acc-btn-ghost" onClick={() => setDeleting({ open: false, currentPassword: '' })}>やめる</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

const formStyle = { display: 'flex', flexDirection: 'column' as const, gap: '14px' };
const headingStyle = { margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' };
