import { useEffect, useState, type CSSProperties } from 'react';
import { toast } from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';
import StampCard from '../account/StampCard';
import type { StampCardData, StampRewardKind } from '../account/types';
import '../../pages/account.css';

interface RewardRow {
  at: number;
  titleJa: string;
  kind: StampRewardKind;
  amount: number;
}

interface StampForm {
  stampCardEnabled: boolean;
  stampsPerCard: number;
  stampMinAmount: number;
  stampCooldownHours: number;
  stampRewardValidDays: number;
  stampRewards: RewardRow[];
}

// Same defaults as the API (lib/stamps.ts).
const DEFAULTS: StampForm = {
  stampCardEnabled: true,
  stampsPerCard: 10,
  stampMinAmount: 1000,
  stampCooldownHours: 6,
  stampRewardValidDays: 0,
  stampRewards: [
    { at: 5, titleJa: '次回セットのナングレードアップ無料', kind: 'PERK', amount: 0 },
    { at: 10, titleJa: '次回1グループ 1,000円引き', kind: 'AMOUNT_OFF', amount: 1000 },
  ],
};
const MIN_STAMPS = 2;
const MAX_STAMPS = 30;
const PREVIEW_STAMPS = 3;

export default function StampCardSettings() {
  const [form, setForm] = useState<StampForm | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/api/v1/settings')
      .then(res => res.json())
      .then(data =>
        setForm({
          stampCardEnabled: data.stampCardEnabled !== false,
          stampsPerCard: data.stampsPerCard ?? DEFAULTS.stampsPerCard,
          stampMinAmount: data.stampMinAmount ?? DEFAULTS.stampMinAmount,
          stampCooldownHours: data.stampCooldownHours ?? DEFAULTS.stampCooldownHours,
          stampRewardValidDays: data.stampRewardValidDays ?? DEFAULTS.stampRewardValidDays,
          stampRewards: (data.stampRewards ?? DEFAULTS.stampRewards).map((reward: RewardRow) => ({ ...reward, amount: reward.amount ?? 0 })),
        }),
      )
      .catch(console.error);
  }, []);

  if (!form) return null;
  const update = (patch: Partial<StampForm>) => setForm({ ...form, ...patch });
  const updateReward = (index: number, patch: Partial<RewardRow>) =>
    update({ stampRewards: form.stampRewards.map((reward, i) => (i === index ? { ...reward, ...patch } : reward)) });
  const freeStamp = () => {
    const taken = new Set(form.stampRewards.map(reward => reward.at));
    for (let at = form.stampsPerCard; at >= 1; at -= 1) if (!taken.has(at)) return at;
    for (let at = form.stampsPerCard + 1; at <= MAX_STAMPS; at += 1) if (!taken.has(at)) return at;
    return null;
  };

  const problems = rewardProblems(form);

  const save = async () => {
    if (problems.length > 0) {
      toast.error(problems[0]);
      return;
    }
    setSaving(true);
    try {
      const body = { ...form, stampRewards: [...form.stampRewards].sort((a, b) => a.at - b.at).map(reward => ({ ...reward, titleJa: reward.titleJa.trim() })) };
      const res = await apiFetch('/api/v1/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) toast.success('Stamp card settings saved.');
      else toast.error(await errorMessage(res, 'Failed to save stamp card settings.'));
    } catch {
      toast.error('Network error.');
    } finally {
      setSaving(false);
    }
  };

  const preview: StampCardData = {
    enabled: true,
    memberCode: 'PREVIEW0',
    perCard: form.stampsPerCard,
    stamps: Math.min(PREVIEW_STAMPS, form.stampsPerCard),
    totalStamps: 0,
    completedCards: 0,
    lastStampAt: null,
    nextStampAt: null,
    rules: { minAmount: form.stampMinAmount, cooldownHours: form.stampCooldownHours, rewardValidDays: form.stampRewardValidDays },
    milestones: [...form.stampRewards].filter(reward => reward.at <= form.stampsPerCard && reward.titleJa.trim()).sort((a, b) => a.at - b.at),
    rewards: [],
    pastRewards: [],
    history: [],
  };

  return (
    <section style={cardStyle}>
      <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Stamp Card</h3>
      <p style={{ margin: '0.25rem 0 1.25rem', color: '#6b7280', fontSize: '0.875rem' }}>
        Members get one stamp when an online order is completed, or when staff scan their member QR at the counter (Stamps, Offers &amp; Points tab → Stamp card at the counter).
        Rewards are given automatically when a member reaches that stamp. Reaching the Goal (stamp {form.stampsPerCard}) completes and auto-resets the card for the next round. Each reward can be used only once.
      </p>

      <div className="stamp-admin-layout">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 }}>
          <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center' }}>
            <input type="checkbox" checked={form.stampCardEnabled} onChange={e => update({ stampCardEnabled: e.target.checked })} style={{ width: '18px', height: '18px' }} />
            Stamp card on (when off, members keep their stamps and rewards but no new stamps are given)
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: '1rem' }}>
            <label style={labelStyle}>
              Stamps per card (Goal = stamp {form.stampsPerCard})
              <input type="number" min={MIN_STAMPS} max={MAX_STAMPS} value={form.stampsPerCard} onChange={e => update({ stampsPerCard: clamp(Number(e.target.value), MIN_STAMPS, MAX_STAMPS) })} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Minimum order (¥, tax incl.)
              <input type="number" min={0} step={100} value={form.stampMinAmount} onChange={e => update({ stampMinAmount: Math.max(0, Number(e.target.value)) })} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Hours between stamps (0 = no wait)
              <input type="number" min={0} max={720} value={form.stampCooldownHours} onChange={e => update({ stampCooldownHours: clamp(Number(e.target.value), 0, 720) })} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Reward valid for (days, 0 = no limit)
              <input type="number" min={0} max={3650} value={form.stampRewardValidDays} onChange={e => update({ stampRewardValidDays: clamp(Number(e.target.value), 0, 3650) })} style={inputStyle} />
            </label>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
              <strong style={{ fontSize: '0.95rem' }}>Rewards</strong>
              <button
                type="button"
                onClick={() => {
                  const at = freeStamp();
                  if (at) {
                    update({
                      stampsPerCard: Math.max(form.stampsPerCard, at),
                      stampRewards: [...form.stampRewards, { at, titleJa: '', kind: 'PERK', amount: 0 }],
                    });
                  }
                }}
                disabled={freeStamp() === null}
                style={smallButton}
              >
                <Plus size={14} /> Add reward
              </button>
            </div>
            {form.stampRewards.length === 0 && <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>No rewards yet. Members still collect stamps.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {form.stampRewards.map((reward, index) => (
                <div key={index} className="stamp-reward-row">
                  <label style={labelStyle}>
                    At stamp
                    <select
                      value={reward.at}
                      onChange={e => {
                        const newAt = Number(e.target.value);
                        update({
                          stampsPerCard: Math.max(form.stampsPerCard, newAt),
                          stampRewards: form.stampRewards.map((r, i) => (i === index ? { ...r, at: newAt } : r)),
                        });
                      }}
                      style={inputStyle}
                    >
                      {Array.from({ length: MAX_STAMPS }, (_, i) => i + 1).map(n => (
                        <option key={n} value={n}>
                          {n}{n === form.stampsPerCard ? ' 🏁 (Goal)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ ...labelStyle, minWidth: 0 }}>
                    Reward (Japanese, shown on the card)
                    <input maxLength={100} value={reward.titleJa} placeholder="例：次回ドリンク1杯無料" onChange={e => updateReward(index, { titleJa: e.target.value })} style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    Type
                    <select value={reward.kind} onChange={e => updateReward(index, { kind: e.target.value as StampRewardKind })} style={inputStyle}>
                      <option value="PERK">Gift / upgrade (staff hand over)</option>
                      <option value="AMOUNT_OFF">¥ off the bill</option>
                    </select>
                  </label>
                  <label style={labelStyle}>
                    ¥ off
                    <input type="number" min={0} step={100} disabled={reward.kind !== 'AMOUNT_OFF'} value={reward.kind === 'AMOUNT_OFF' ? reward.amount : ''} onChange={e => updateReward(index, { amount: Math.max(0, Number(e.target.value)) })} style={inputStyle} />
                  </label>
                  <button type="button" aria-label={`Remove reward at stamp ${reward.at}`} onClick={() => update({ stampRewards: form.stampRewards.filter((_, i) => i !== index) })} style={{ ...smallButton, alignSelf: 'end', color: '#b91c1c' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            {problems.length > 0 && <p role="alert" style={{ color: '#b91c1c', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>{problems[0]}</p>}
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preview (member with {preview.stamps} stamps)</div>
          <StampCard card={preview} memberName="" preview />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
        <button type="button" onClick={save} disabled={saving} style={{ padding: '0.65rem 1.25rem', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Save Stamp Card'}
        </button>
      </div>
    </section>
  );
}

function rewardProblems(form: StampForm): string[] {
  const problems: string[] = [];
  const seen = new Set<number>();
  for (const reward of form.stampRewards) {
    if (!reward.titleJa.trim()) problems.push(`Enter the reward text for stamp ${reward.at}.`);
    if (reward.at > form.stampsPerCard) problems.push(`Stamp ${reward.at} is beyond the card length (${form.stampsPerCard}).`);
    if (seen.has(reward.at)) problems.push(`Stamp ${reward.at} has two rewards; use one per stamp.`);
    if (reward.kind === 'AMOUNT_OFF' && reward.amount <= 0) problems.push(`Enter the ¥ amount for the discount at stamp ${reward.at}.`);
    seen.add(reward.at);
  }
  return problems;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : min));

const cardStyle: CSSProperties = { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', padding: '1.5rem' };
const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' };
const inputStyle: CSSProperties = { width: '100%', padding: '0.6rem', border: '1px solid #d1d5db', borderRadius: '8px', backgroundColor: '#f9fafb', boxSizing: 'border-box', fontSize: '0.95rem' };
const smallButton: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', background: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 };
