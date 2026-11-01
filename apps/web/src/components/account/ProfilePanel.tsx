import { useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'react-hot-toast';
import { Cake, Flame, Home, Mail, ShieldAlert, UserRound } from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';
import { useCustomer, type Customer } from '../../lib/customer-context';
import { formatDate, toHalfWidth } from '../../lib/format';
import AccountSecurity from './AccountSecurity';
import { ALLERGENS, DIETS, PREFECTURES, SPICE_LABELS } from './profile-options';
import { inputStyle, labelStyle, mutedStyle } from './styles';

type Draft = Pick<Customer, 'name' | 'nameKana' | 'phone' | 'birthDate' | 'address' | 'preferences' | 'newsletterOptIn'>;

const draftFrom = (customer: Customer): Draft => ({
  name: customer.name,
  nameKana: customer.nameKana,
  phone: customer.phone,
  birthDate: customer.birthDate,
  address: { ...customer.address },
  preferences: { ...customer.preferences, allergens: [...customer.preferences.allergens], diets: [...customer.preferences.diets] },
  newsletterOptIn: customer.newsletterOptIn,
});

/** How much of the optional profile is filled in, for the progress bar. */
function completeness(customer: Customer): number {
  const checks = [
    customer.nameKana,
    customer.phone,
    customer.birthDate,
    customer.address.postalCode && customer.address.city && customer.address.line1,
    customer.preferences.allergens.length > 0 || customer.preferences.otherAllergies || customer.preferences.diets.length > 0 || customer.preferences.spiceLevel !== null,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

// Hiragana typed into the reading field is turned into katakana, which is what the API expects.
const toKatakana = (value: string) => value.replace(/[ぁ-ゖ]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60));

const today = () => new Date().toISOString().slice(0, 10);

export default function ProfilePanel({ customer }: { customer: Customer }) {
  const { refresh } = useCustomer();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(customer));
  const [saving, setSaving] = useState(false);
  const percent = completeness(customer);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(prev => ({ ...prev, [key]: value }));
  const setAddress = (patch: Partial<Draft['address']>) => setDraft(prev => ({ ...prev, address: { ...prev.address, ...patch } }));
  const setPreferences = (patch: Partial<Draft['preferences']>) => setDraft(prev => ({ ...prev, preferences: { ...prev.preferences, ...patch } }));
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter(item => item !== value) : [...list, value]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch('/api/v1/customers/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (res.ok) {
        toast.success('会員情報を保存しました。');
        await refresh();
      } else toast.error(await errorMessage(res, '保存できませんでした。入力内容をご確認ください。'));
    } catch {
      toast.error('通信エラーが発生しました。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <section className="acc-card prof-progress" aria-label="プロフィールの入力状況">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
          <strong>プロフィール {percent}% 完成</strong>
          <span style={mutedStyle}>会員登録日：{formatDate(customer.createdAt)}</span>
        </div>
        <div className="prof-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${percent}%` }} />
        </div>
        {percent < 100 && <p style={{ ...mutedStyle, margin: 0 }}>生年月日を登録すると、お誕生月に特典をお届けできるようになります。アレルギー情報はご注文時に厨房へ伝わります。</p>}
      </section>

      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <Section icon={<UserRound size={18} />} title="基本情報">
          <div className="prof-grid">
            <label style={labelStyle}>
              お名前 <Required />
              <input required maxLength={100} autoComplete="name" value={draft.name} onChange={e => set('name', e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              フリガナ
              <input maxLength={100} placeholder="ヤマダ ハナコ" value={draft.nameKana} onChange={e => set('nameKana', toKatakana(e.target.value))} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              電話番号
              <input type="tel" inputMode="tel" autoComplete="tel" placeholder="090-1234-5678" value={draft.phone} onChange={e => set('phone', toHalfWidth(e.target.value))} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              <span><Cake size={14} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> 生年月日</span>
              <input type="date" max={today()} min="1900-01-01" autoComplete="bday" value={draft.birthDate} onChange={e => set('birthDate', e.target.value)} style={inputStyle} />
            </label>
          </div>
          <p style={{ ...mutedStyle, margin: 0 }}>メールアドレス：{customer.email}（変更は下の「メールアドレスの変更」から）</p>
        </Section>

        <Section icon={<Home size={18} />} title="ご住所" hint="任意。ケータリングや今後の配達サービスのご案内に使います。">
          <div className="prof-grid">
            <label style={labelStyle}>
              郵便番号
              <input inputMode="numeric" autoComplete="postal-code" placeholder="360-0023" maxLength={8} value={draft.address.postalCode} onChange={e => setAddress({ postalCode: toHalfWidth(e.target.value) })} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              都道府県
              <select autoComplete="address-level1" value={draft.address.prefecture} onChange={e => setAddress({ prefecture: e.target.value })} style={inputStyle}>
                <option value="">選択してください</option>
                {PREFECTURES.map(prefecture => <option key={prefecture} value={prefecture}>{prefecture}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              市区町村
              <input maxLength={100} autoComplete="address-level2" placeholder="熊谷市" value={draft.address.city} onChange={e => setAddress({ city: e.target.value })} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              番地
              <input maxLength={200} autoComplete="address-line1" placeholder="鎌倉町1-2-3" value={draft.address.line1} onChange={e => setAddress({ line1: e.target.value })} style={inputStyle} />
            </label>
            <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
              建物名・部屋番号
              <input maxLength={200} autoComplete="address-line2" value={draft.address.building} onChange={e => setAddress({ building: e.target.value })} style={inputStyle} />
            </label>
          </div>
        </Section>

        <Section icon={<ShieldAlert size={18} />} title="アレルギー・食の好み" hint="ご注文時に店舗スタッフに表示され、調理の参考にします。">
          <fieldset className="prof-fieldset">
            <legend style={labelStyle}>アレルギー（該当するものを選択）</legend>
            <div className="prof-chips">
              {ALLERGENS.map(allergen => (
                <label key={allergen} className={`prof-chip${draft.preferences.allergens.includes(allergen) ? ' is-on' : ''}`}>
                  <input type="checkbox" checked={draft.preferences.allergens.includes(allergen)} onChange={() => setPreferences({ allergens: toggle(draft.preferences.allergens, allergen) })} />
                  {allergen}
                </label>
              ))}
            </div>
          </fieldset>
          <label style={labelStyle}>
            その他のアレルギー
            <input maxLength={200} placeholder="例：マンゴー" value={draft.preferences.otherAllergies} onChange={e => setPreferences({ otherAllergies: e.target.value })} style={inputStyle} />
          </label>
          <fieldset className="prof-fieldset">
            <legend style={labelStyle}>食事制限</legend>
            <div className="prof-chips">
              {DIETS.map(diet => (
                <label key={diet.value} className={`prof-chip${draft.preferences.diets.includes(diet.value) ? ' is-on' : ''}`}>
                  <input type="checkbox" checked={draft.preferences.diets.includes(diet.value)} onChange={() => setPreferences({ diets: toggle(draft.preferences.diets, diet.value) })} />
                  {diet.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="prof-fieldset">
            <legend style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: '4px' }}><Flame size={14} aria-hidden="true" style={{ color: 'var(--spice)' }} />お好みの辛さ</legend>
            <div className="prof-chips">
              {SPICE_LABELS.map((label, level) => (
                <label key={label} className={`prof-chip${draft.preferences.spiceLevel === level ? ' is-on' : ''}`}>
                  <input type="radio" name="spice" checked={draft.preferences.spiceLevel === level} onChange={() => setPreferences({ spiceLevel: level })} />
                  {label}
                </label>
              ))}
              {draft.preferences.spiceLevel !== null && (
                <button type="button" className="acc-link" onClick={() => setPreferences({ spiceLevel: null })}>指定しない</button>
              )}
            </div>
          </fieldset>
          <label style={labelStyle}>
            その他のご要望
            <textarea rows={2} maxLength={500} placeholder="例：パクチー抜きが好みです" value={draft.preferences.note} onChange={e => setPreferences({ note: e.target.value })} style={inputStyle} />
          </label>
        </Section>

        <Section icon={<Mail size={18} />} title="お知らせ">
          <label className="prof-toggle">
            <input type="checkbox" checked={draft.newsletterOptIn} onChange={e => set('newsletterOptIn', e.target.checked)} />
            <span>
              <strong>新メニュー・特典のお知らせをメールで受け取る</strong>
              <span style={{ ...mutedStyle, display: 'block' }}>いつでも停止できます。</span>
            </span>
          </label>
        </Section>

        <div className="prof-save">
          <button type="submit" className="acc-btn" disabled={saving}>{saving ? '保存中…' : '会員情報を保存する'}</button>
        </div>
      </form>

      <AccountSecurity customer={customer} />
    </div>
  );
}

function Section({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="acc-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span aria-hidden="true" style={{ color: 'var(--acc-accent)', display: 'flex' }}>{icon}</span>{title}
        </h2>
        {hint && <p style={{ ...mutedStyle, margin: '4px 0 0' }}>{hint}</p>}
      </div>
      {children}
    </section>
  );
}

const Required = () => <span style={{ color: 'var(--spice)' }} aria-label="必須">*</span>;
