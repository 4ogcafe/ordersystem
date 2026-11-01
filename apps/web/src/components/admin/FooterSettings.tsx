import { useEffect, useState, type CSSProperties } from 'react';
import { toast } from 'react-hot-toast';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { apiFetch, assetUrl, errorMessage } from '../../lib/api';
import { DEFAULT_FOOTER_LINKS, DEFAULT_TAGLINE, type FooterLink } from '../../lib/footer';

interface Form {
  footerLogo: string;
  footerBrand: string;
  footerTaglineJa: string;
  footerCopyright: string;
  footerLinks: FooterLink[];
  footerShowHours: boolean;
  footerShowSocials: boolean;
}

interface Contact {
  name: string;
  addressJa: string;
  phone: string;
  email: string;
  hours: string;
}

const LINK_PATTERN = /^(\/|\/[^/].*|https:\/\/.+)$/;

/** Page Settings → Footer: everything shown in the site footer. Contact details come from Restaurant Settings. */
export default function FooterSettings({ onOpenRestaurantSettings }: { onOpenRestaurantSettings?: () => void }) {
  const [form, setForm] = useState<Form | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [year] = useState(() => new Date().getFullYear());

  useEffect(() => {
    apiFetch('/api/v1/settings')
      .then(res => res.json())
      .then(data => {
        setForm({
          footerLogo: data.footerLogo ?? '',
          footerBrand: data.footerBrand ?? '',
          footerTaglineJa: data.footerTaglineJa ?? DEFAULT_TAGLINE,
          footerCopyright: data.footerCopyright ?? '',
          footerLinks: data.footerLinks?.length ? data.footerLinks : DEFAULT_FOOTER_LINKS,
          footerShowHours: data.footerShowHours !== false,
          footerShowSocials: data.footerShowSocials !== false,
        });
        setContact({ name: data.name ?? '', addressJa: data.addressJa ?? '', phone: data.phone ?? '', email: data.email ?? '', hours: data.weeklyHours?.monday ?? '' });
      })
      .catch(() => toast.error('Could not load the footer settings.'));
  }, []);

  if (!form || !contact) return <div style={card}>Loading…</div>;
  const update = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const setLink = (index: number, patch: Partial<FooterLink>) => update({ footerLinks: form.footerLinks.map((link, i) => (i === index ? { ...link, ...patch } : link)) });
  const move = (index: number, by: -1 | 1) => {
    const links = [...form.footerLinks];
    const [link] = links.splice(index, 1);
    links.splice(index + by, 0, link);
    update({ footerLinks: links });
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append('image', file);
      const res = await apiFetch('/api/v1/upload', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.imageUrl) update({ footerLogo: data.imageUrl });
      else toast.error(data?.error?.message ?? 'Upload failed.');
    } catch {
      toast.error('Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const links = form.footerLinks.map(link => ({ label: link.label.trim(), url: link.url.trim() })).filter(link => link.label || link.url);
    const bad = links.find(link => !link.label || !LINK_PATTERN.test(link.url));
    if (bad) {
      toast.error(`Check the link "${bad.label || bad.url}": give it a name, and a page like /menu/grand or an https:// address.`);
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, footerLinks: links, footerBrand: form.footerBrand.trim(), footerTaglineJa: form.footerTaglineJa.trim(), footerCopyright: form.footerCopyright.trim() }),
      });
      if (res.ok) toast.success('Footer saved. It shows on the website now.');
      else toast.error(await errorMessage(res, 'Could not save the footer.'));
    } catch {
      toast.error('Network error.');
    } finally {
      setSaving(false);
    }
  };

  const copyrightPreview = (form.footerCopyright.trim() || `© {year} ${contact.name || 'Adarsha'}. All Rights Reserved.`).replace(/\{year\}/g, String(year));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={card}>
        <h3 style={h3}>Logo &amp; name</h3>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div style={{ width: '120px', height: '64px', borderRadius: '8px', background: '#2a2321', display: 'grid', placeItems: 'center', padding: '6px', boxSizing: 'border-box' }}>
            <img src={assetUrl(form.footerLogo) || '/adarsha-log.webp'} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '50%' }} />
          </div>
          <label style={{ ...btn, cursor: uploading ? 'wait' : 'pointer' }}>
            <Upload size={15} /> {uploading ? 'Uploading…' : 'Upload logo'}
            <input type="file" accept="image/*" hidden onChange={e => upload(e.target.files?.[0])} />
          </label>
          {form.footerLogo && <button type="button" style={btn} onClick={() => update({ footerLogo: '' })}><RotateCcw size={15} /> Use default logo</button>}
          <span style={muted}>A light/white logo looks best on the dark footer.</span>
        </div>
        <label style={label}>
          Name next to the logo
          <input value={form.footerBrand} onChange={e => update({ footerBrand: e.target.value })} maxLength={60} placeholder={contact.name || 'Adarsha'} style={input} />
          <span style={muted}>Leave empty to use the restaurant name ({contact.name || 'not set'}).</span>
        </label>
        <label style={{ ...label, marginTop: '1rem' }}>
          Description
          <textarea value={form.footerTaglineJa} onChange={e => update({ footerTaglineJa: e.target.value })} maxLength={500} rows={3} style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }} />
        </label>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <h3 style={{ ...h3, margin: 0 }}>Links (リンク)</h3>
          <button type="button" style={btn} onClick={() => update({ footerLinks: DEFAULT_FOOTER_LINKS })}><RotateCcw size={15} /> Reset to default</button>
        </div>
        <p style={{ ...muted, margin: '6px 0 12px' }}>A page on this site (e.g. <code>/menu/takeout</code>, <code>/account</code>) or a full <code>https://</code> address (opens in a new tab).</p>
        <div style={{ display: 'grid', gap: '8px' }}>
          {form.footerLinks.map((link, index) => (
            <div key={index} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={link.label} onChange={e => setLink(index, { label: e.target.value })} placeholder="Label, e.g. テイクアウト" maxLength={40} aria-label="Link label" style={{ ...input, flex: '1 1 160px' }} />
              <input value={link.url} onChange={e => setLink(index, { url: e.target.value })} placeholder="/menu/takeout" maxLength={300} aria-label="Link address" style={{ ...input, flex: '2 1 220px', borderColor: link.url && !LINK_PATTERN.test(link.url.trim()) ? '#f87171' : '#d1d5db' }} />
              <span style={{ display: 'inline-flex', gap: '4px' }}>
                <button type="button" style={iconBtn} disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move up"><ArrowUp size={15} /></button>
                <button type="button" style={iconBtn} disabled={index === form.footerLinks.length - 1} onClick={() => move(index, 1)} aria-label="Move down"><ArrowDown size={15} /></button>
                <button type="button" style={{ ...iconBtn, color: '#b91c1c' }} onClick={() => update({ footerLinks: form.footerLinks.filter((_, i) => i !== index) })} aria-label="Remove link"><Trash2 size={15} /></button>
              </span>
            </div>
          ))}
        </div>
        <button type="button" style={{ ...btn, marginTop: '10px' }} disabled={form.footerLinks.length >= 12} onClick={() => update({ footerLinks: [...form.footerLinks, { label: '', url: '' }] })}><Plus size={15} /> Add link</button>
      </div>

      <div style={card}>
        <h3 style={h3}>Store information (店舗情報)</h3>
        <p style={{ ...muted, marginTop: 0 }}>
          Name, address, phone, email, hours and social links come from <strong>Restaurant Settings</strong>, so they're the same everywhere on the site. Empty ones are simply not shown.
          {onOpenRestaurantSettings && <> <button type="button" onClick={onOpenRestaurantSettings} style={{ background: 'none', border: 'none', color: '#1d4ed8', fontWeight: 600, cursor: 'pointer', padding: 0 }}>Edit them →</button></>}
        </p>
        <ul style={{ margin: '0 0 12px', paddingLeft: '1.2rem', fontSize: '0.9rem', color: '#374151', lineHeight: 1.8 }}>
          <li>Name: {contact.name || <em>not set</em>}</li>
          <li>Address: {contact.addressJa || <em>not set</em>}</li>
          <li>Phone: {contact.phone || <em>not set</em>}</li>
          <li>Email: {contact.email || <em>not set</em>}</li>
          <li>Hours: {contact.hours || <em>not set</em>}</li>
        </ul>
        <label style={check}><input type="checkbox" checked={form.footerShowHours} onChange={e => update({ footerShowHours: e.target.checked })} /> Show opening hours</label>
        <label style={check}><input type="checkbox" checked={form.footerShowSocials} onChange={e => update({ footerShowSocials: e.target.checked })} /> Show social media icons (Instagram, X, Facebook, YouTube)</label>
      </div>

      <div style={card}>
        <h3 style={h3}>Copyright line</h3>
        <label style={label}>
          Text
          <input value={form.footerCopyright} onChange={e => update({ footerCopyright: e.target.value })} maxLength={200} placeholder="© {year} インド料理アダルサ. All Rights Reserved." style={input} />
          <span style={muted}>Write <code>{'{year}'}</code> for the current year. Preview: <strong>{copyrightPreview}</strong></span>
        </label>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={save} disabled={saving} style={{ padding: '0.75rem 1.5rem', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Save footer'}
        </button>
      </div>
    </div>
  );
}

const card: CSSProperties = { backgroundColor: '#fff', borderRadius: '12px', padding: '1.5rem 2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' };
const h3: CSSProperties = { margin: '0 0 1rem', fontSize: '1.15rem' };
const label: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' };
const input: CSSProperties = { width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', backgroundColor: '#f9fafb', boxSizing: 'border-box', fontSize: '0.95rem', minWidth: 0 };
const muted: CSSProperties = { color: '#6b7280', fontSize: '0.8rem', fontWeight: 400 };
const btn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0.5rem 0.85rem', border: '1px solid #d1d5db', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' };
const iconBtn: CSSProperties = { width: '34px', height: '34px', display: 'grid', placeItems: 'center', border: '1px solid #d1d5db', borderRadius: '8px', background: '#fff', cursor: 'pointer' };
const check: CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', marginTop: '6px', cursor: 'pointer' };
