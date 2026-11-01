import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import type { TabIntent } from './TopBar';
import { toast } from 'react-hot-toast';
import { Plus, Edit2, Trash2, Tag } from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';
import { offerLabel } from '../../lib/format';
import LoyaltySettings from './LoyaltySettings';
import StampCardSettings from './StampCardSettings';
import StampCounter from './StampCounter';
import GameSettings from './GameSettings';

interface Offer {
  id: string;
  titleJa: string;
  descriptionJa: string | null;
  imageUrl: string | null;
  discountType: 'PERCENT' | 'AMOUNT';
  discountValue: number;
  minSubtotal: number;
  startsAt: string | null;
  endsAt: string | null;
  oncePerCustomer: boolean;
  isActive: boolean;
  uses: number;
}

type Draft = Omit<Offer, 'id' | 'uses' | 'descriptionJa' | 'imageUrl' | 'startsAt' | 'endsAt'> & {
  id?: string;
  descriptionJa: string;
  imageUrl: string;
  startsAt: string;
  endsAt: string;
};

const EMPTY_DRAFT: Draft = {
  titleJa: '',
  descriptionJa: '',
  imageUrl: '',
  discountType: 'PERCENT',
  discountValue: 10,
  minSubtotal: 0,
  startsAt: '',
  endsAt: '',
  oncePerCustomer: false,
  isActive: true,
};

// <input type="date"> works in YYYY-MM-DD; offers end at the very end of their last day (Japan time).
const toDateInput = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }) : '');
const startOfDay = (date: string) => (date ? `${date}T00:00:00+09:00` : null);
const endOfDay = (date: string) => (date ? `${date}T23:59:59+09:00` : null);

function getStatus(offer: Offer): { label: string; bg: string; color: string; border: string } {
  const now = Date.now();
  if (!offer.isActive) return { label: '一時停止中', bg: '#f3f4f6', color: '#4b5563', border: '#e5e7eb' };
  if (offer.startsAt && new Date(offer.startsAt).getTime() > now) return { label: '開始前（予定）', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
  if (offer.endsAt && new Date(offer.endsAt).getTime() < now) return { label: '期間終了', bg: '#fef2f2', color: '#991b1b', border: '#fecaca' };
  return { label: '公開中（有効）', bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' };
}

export default function OffersTab({ intent }: { intent?: TabIntent | null }) {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Quick Add → "Offer" opens a blank offer.
  useEffect(() => {
    if (intent?.action === 'new-offer') setDraft({ ...EMPTY_DRAFT });
  }, [intent]);

  const load = useCallback(() => {
    apiFetch('/api/v1/offers/all')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(setOffers)
      .catch(console.error);
  }, []);

  useEffect(load, [load]);

  const toggleActive = async (offer: Offer) => {
    if (togglingId) return;
    const nextActive = !offer.isActive;
    setTogglingId(offer.id);
    // Optimistic update
    setOffers(prev => prev ? prev.map(o => o.id === offer.id ? { ...o, isActive: nextActive } : o) : null);
    try {
      const res = await apiFetch(`/api/v1/offers/${offer.id}/toggle`, { method: 'PATCH' });
      if (res.ok) {
        toast.success(nextActive ? `「${offer.titleJa}」を公開（有効）にしました` : `「${offer.titleJa}」を一時停止にしました`);
      } else {
        toast.error('公開状態の変更に失敗しました');
        load();
      }
    } catch {
      toast.error('通信エラーが発生しました');
      load();
    } finally {
      setTogglingId(null);
    }
  };

  const edit = (offer: Offer) =>
    setDraft({
      id: offer.id,
      titleJa: offer.titleJa,
      descriptionJa: offer.descriptionJa ?? '',
      imageUrl: offer.imageUrl ?? '',
      discountType: offer.discountType,
      discountValue: offer.discountValue,
      minSubtotal: offer.minSubtotal,
      startsAt: toDateInput(offer.startsAt),
      endsAt: toDateInput(offer.endsAt),
      oncePerCustomer: offer.oncePerCustomer,
      isActive: offer.isActive,
    });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    const { id, ...fields } = draft;
    try {
      const res = await apiFetch(id ? `/api/v1/offers/${id}` : '/api/v1/offers', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, startsAt: startOfDay(fields.startsAt), endsAt: endOfDay(fields.endsAt) }),
      });
      if (res.ok) {
        toast.success(id ? 'クーポンを更新しました。' : 'クーポンを作成しました。お会計時に利用可能です。');
        setDraft(null);
        load();
      } else {
        toast.error(await errorMessage(res, 'クーポンの保存に失敗しました。'));
      }
    } catch {
      toast.error('通信エラーが発生しました。');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (offer: Offer) => {
    if (!window.confirm(`「${offer.titleJa}」を削除してもよろしいですか？\n\n※過去の注文履歴の割引データは保持されます。\n※一時的に停止したい場合は「一時停止」に切り替えることも可能です。`)) {
      return;
    }
    const res = await apiFetch(`/api/v1/offers/${offer.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('クーポンを削除しました。');
      load();
    } else {
      toast.error(await errorMessage(res, '削除できませんでした。'));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <StampCounter
        focus={intent?.action === 'stamp' ? intent.nonce : undefined}
        initialCode={intent?.action === 'stamp' ? intent.value : undefined}
      />
      <StampCardSettings />
      <LoyaltySettings />
      <GameSettings />

      <section style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Tag size={20} color="#d97706" />
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1f2937' }}>割引オファー・クーポン設定</h3>
            </div>
            <p style={{ margin: '0.35rem 0 0', color: '#6b7280', fontSize: '0.875rem', lineHeight: 1.5 }}>
              お客様がお会計時に利用できる割引クーポンです。複数クーポンの併用も可能です。
            </p>
          </div>
          <button type="button" onClick={() => setDraft({ ...EMPTY_DRAFT })} style={primaryButton}>
            <Plus size={16} /> 新規クーポン作成
          </button>
        </div>

        {!offers ? (
          <p style={{ color: '#6b7280' }}>読み込み中…</p>
        ) : offers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px dashed #d1d5db' }}>
            <Tag size={36} color="#9ca3af" style={{ margin: '0 auto 0.75rem', display: 'block' }} />
            <p style={{ color: '#4b5563', fontWeight: 600, margin: '0 0 0.5rem' }}>登録済みのクーポンはありません</p>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0 0 1rem' }}>オンライン注文で使えるお得な割引クーポンを作成しましょう。</p>
            <button type="button" onClick={() => setDraft({ ...EMPTY_DRAFT })} style={primaryButton}>
              <Plus size={16} /> はじめてのクーポンを作成
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#4b5563', borderBottom: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                  <th style={cellHeader}>クーポン名</th>
                  <th style={cellHeader}>割引内容</th>
                  <th style={cellHeader}>適用条件</th>
                  <th style={cellHeader}>有効期間</th>
                  <th style={cellHeader}>利用回数</th>
                  <th style={cellHeader}>状態</th>
                  <th style={cellHeader}>公開切替</th>
                  <th style={{ ...cellHeader, textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {offers.map(offer => {
                  const state = getStatus(offer);
                  return (
                    <tr key={offer.id} style={{ borderBottom: '1px solid #f3f4f6', transition: 'background-color 0.15s' }}>
                      <td style={{ ...cellStyle, fontWeight: 600, color: '#111827' }}>
                        <div>{offer.titleJa}</div>
                        {offer.descriptionJa && (
                          <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 400, marginTop: '2px' }}>{offer.descriptionJa}</div>
                        )}
                      </td>
                      <td style={cellStyle}>
                        <span style={{ display: 'inline-block', fontWeight: 700, color: '#b45309', backgroundColor: '#fef3c7', padding: '2px 8px', borderRadius: '6px' }}>
                          {offerLabel(offer)}
                        </span>
                      </td>
                      <td style={cellStyle}>
                        <div style={{ color: '#374151' }}>
                          {offer.minSubtotal > 0 ? `¥${offer.minSubtotal.toLocaleString('ja-JP')}以上` : '条件なし'}
                        </div>
                        {offer.oncePerCustomer && (
                          <span style={{ display: 'inline-block', fontSize: '0.75rem', color: '#4f46e5', backgroundColor: '#eef2ff', padding: '1px 6px', borderRadius: '4px', marginTop: '3px' }}>
                            お一人様1回
                          </span>
                        )}
                      </td>
                      <td style={{ ...cellStyle, color: '#4b5563', fontSize: '0.85rem' }}>
                        {toDateInput(offer.startsAt) || '即時'} → {toDateInput(offer.endsAt) || '無期限'}
                      </td>
                      <td style={cellStyle}>
                        <span style={{ fontWeight: 600, color: '#1f2937' }}>{offer.uses}</span>
                        <span style={{ fontSize: '0.8rem', color: '#6b7280', marginLeft: '3px' }}>回</span>
                      </td>
                      <td style={cellStyle}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: '9999px',
                          backgroundColor: state.bg,
                          color: state.color,
                          border: `1px solid ${state.border}`,
                        }}>
                          {state.label}
                        </span>
                      </td>
                      <td style={cellStyle}>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={offer.isActive}
                          aria-label={`「${offer.titleJa}」の公開を切り替える`}
                          onClick={() => toggleActive(offer)}
                          disabled={togglingId === offer.id}
                          style={{
                            width: '42px',
                            height: '24px',
                            backgroundColor: offer.isActive ? '#10b981' : '#d1d5db',
                            borderRadius: '9999px',
                            border: 'none',
                            position: 'relative',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s ease',
                            padding: 0,
                            outline: 'none',
                            display: 'inline-block',
                          }}
                        >
                          <span style={{
                            display: 'block',
                            width: '20px',
                            height: '20px',
                            backgroundColor: '#ffffff',
                            borderRadius: '50%',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                            position: 'absolute',
                            top: '2px',
                            left: offer.isActive ? '20px' : '2px',
                            transition: 'left 0.2s ease',
                          }} />
                        </button>
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button type="button" onClick={() => edit(offer)} style={smallButton} title="編集">
                          <Edit2 size={14} /> 編集
                        </button>{' '}
                        <button type="button" onClick={() => remove(offer)} style={{ ...smallButton, color: '#b91c1c', borderColor: '#fca5a5' }} title="削除">
                          <Trash2 size={14} /> 削除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {draft && (
        <div role="dialog" aria-modal="true" aria-labelledby="offer-dialog-title" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <form onSubmit={save} style={{ ...panelStyle, width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.1rem' }}>
            <div style={{ gridColumn: '1 / -1', borderBottom: '1px solid #f3f4f6', paddingBottom: '0.75rem' }}>
              <h2 id="offer-dialog-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
                {draft.id ? '割引クーポンの編集' : '新規クーポンの作成'}
              </h2>
              <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.85rem' }}>
                お客様が注文時にお会計画面で選択できる割引特典です。
              </p>
            </div>

            <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
              クーポン名（お客様向け表示）*
              <input required maxLength={100} placeholder="例: 初回限定 10%OFF、秋の感謝 ¥500引き" value={draft.titleJa} onChange={e => setDraft({ ...draft, titleJa: e.target.value })} style={inputStyle} />
            </label>

            <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
              説明文（任意）
              <textarea rows={2} maxLength={1000} placeholder="例: お会計時に自動で適用されます。他クーポンとの併用も可能です。" value={draft.descriptionJa} onChange={e => setDraft({ ...draft, descriptionJa: e.target.value })} style={inputStyle} />
            </label>

            <label style={labelStyle}>
              割引タイプ
              <select value={draft.discountType} onChange={e => setDraft({ ...draft, discountType: e.target.value as Draft['discountType'] })} style={inputStyle}>
                <option value="PERCENT">パーセント割引 (%)</option>
                <option value="AMOUNT">金額割引 (円)</option>
              </select>
            </label>

            <label style={labelStyle}>
              {draft.discountType === 'PERCENT' ? '割引率 (1〜100 %)' : '割引額 (円)'}
              <input type="number" required min={1} max={draft.discountType === 'PERCENT' ? 100 : 1000000} value={draft.discountValue} onChange={e => setDraft({ ...draft, discountValue: Number(e.target.value) })} style={inputStyle} />
            </label>

            <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
              最低注文金額 (円、0 = 条件なし)
              <input type="number" min={0} value={draft.minSubtotal} onChange={e => setDraft({ ...draft, minSubtotal: Number(e.target.value) })} style={inputStyle} placeholder="0" />
            </label>

            <label style={labelStyle}>
              開始日 (任意)
              <input type="date" value={draft.startsAt} onChange={e => setDraft({ ...draft, startsAt: e.target.value })} style={inputStyle} />
            </label>

            <label style={labelStyle}>
              終了日 (任意・当日23:59まで有効)
              <input type="date" value={draft.endsAt} onChange={e => setDraft({ ...draft, endsAt: e.target.value })} style={inputStyle} />
            </label>

            <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '0.75rem', backgroundColor: '#f9fafb', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <label style={checkboxLabel}>
                <input type="checkbox" checked={draft.oncePerCustomer} onChange={e => setDraft({ ...draft, oncePerCustomer: e.target.checked })} style={{ width: '16px', height: '16px', accentColor: '#10b981' }} />
                <span><strong>お一人様1回限り</strong>（同じ会員の重複利用を防ぐ）</span>
              </label>
              <label style={checkboxLabel}>
                <input type="checkbox" checked={draft.isActive} onChange={e => setDraft({ ...draft, isActive: e.target.checked })} style={{ width: '16px', height: '16px', accentColor: '#10b981' }} />
                <span><strong>今すぐ公開する（有効）</strong>（チェックを外すと一時停止になります）</span>
              </label>
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setDraft(null)} style={smallButton}>キャンセル</button>
              <button type="submit" disabled={saving} style={primaryButton}>{saving ? '保存中…' : '保存する'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const panelStyle: CSSProperties = { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', padding: '1.5rem' };
const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.875rem', fontWeight: 600, color: '#374151' };
const checkboxLabel: CSSProperties = { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.88rem', fontWeight: 500, color: '#1f2937', cursor: 'pointer' };
const inputStyle: CSSProperties = { width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '8px', backgroundColor: '#f9fafb', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '0.95rem' };
const cellHeader: CSSProperties = { padding: '0.75rem 0.65rem', fontWeight: 600, fontSize: '0.82rem' };
const cellStyle: CSSProperties = { padding: '0.85rem 0.65rem', verticalAlign: 'middle' };
const primaryButton: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0.65rem 1.25rem', backgroundColor: '#111827', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.88rem' };
const smallButton: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0.4rem 0.8rem', backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, fontSize: '0.82rem', color: '#374151' };
