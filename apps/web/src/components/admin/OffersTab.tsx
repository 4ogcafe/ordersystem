import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import type { TabIntent } from './TopBar';
import { toast } from 'react-hot-toast';
import { Plus, Edit2, Trash2, Tag, Gift, Award, Gamepad2, QrCode, RefreshCw, Eye, CheckCircle2 } from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';
import { offerLabel, yen } from '../../lib/format';
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

type SubSection = 'offers' | 'stamps' | 'loyalty' | 'game' | 'counter';

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

export default function OffersTab({
  intent,
  defaultSection = 'offers'
}: {
  intent?: TabIntent | null;
  defaultSection?: SubSection;
}) {
  const [section, setSection] = useState<SubSection>(defaultSection);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (intent?.action === 'stamp') {
      setSection('counter');
    } else if (intent?.action === 'new-offer') {
      setSection('offers');
      setDraft({ ...EMPTY_DRAFT });
    }
  }, [intent]);

  const load = useCallback(() => {
    setRefreshing(true);
    apiFetch('/api/v1/offers/all')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(data => {
        setOffers(Array.isArray(data) ? data : []);
      })
      .catch(console.error)
      .finally(() => setRefreshing(false));
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

  const applyTemplate = (preset: Partial<Draft>) => {
    setDraft(prev => ({
      ...(prev || EMPTY_DRAFT),
      ...preset,
    }));
  };

  const activeCount = offers ? offers.filter(o => o.isActive && (!o.endsAt || new Date(o.endsAt).getTime() >= Date.now())).length : 0;
  const totalUses = offers ? offers.reduce((sum, o) => sum + (o.uses || 0), 0) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* ── SUB-NAVIGATION TABS (Offers & Loyalty Sub-system) ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        backgroundColor: '#ffffff',
        padding: '6px',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        overflowX: 'auto',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <button
          type="button"
          onClick={() => setSection('offers')}
          style={{
            ...subTabBtn,
            backgroundColor: section === 'offers' ? '#b45309' : 'transparent',
            color: section === 'offers' ? '#ffffff' : '#4b5563',
            fontWeight: section === 'offers' ? 700 : 500,
          }}
        >
          <Tag size={16} /> 割引オファー・クーポン管理
        </button>
        <button
          type="button"
          onClick={() => setSection('stamps')}
          style={{
            ...subTabBtn,
            backgroundColor: section === 'stamps' ? '#b45309' : 'transparent',
            color: section === 'stamps' ? '#ffffff' : '#4b5563',
            fontWeight: section === 'stamps' ? 700 : 500,
          }}
        >
          <Gift size={16} /> スタンプカード設定
        </button>
        <button
          type="button"
          onClick={() => setSection('loyalty')}
          style={{
            ...subTabBtn,
            backgroundColor: section === 'loyalty' ? '#b45309' : 'transparent',
            color: section === 'loyalty' ? '#ffffff' : '#4b5563',
            fontWeight: section === 'loyalty' ? 700 : 500,
          }}
        >
          <Award size={16} /> ポイント制度設定
        </button>
        <button
          type="button"
          onClick={() => setSection('game')}
          style={{
            ...subTabBtn,
            backgroundColor: section === 'game' ? '#b45309' : 'transparent',
            color: section === 'game' ? '#ffffff' : '#4b5563',
            fontWeight: section === 'game' ? 700 : 500,
          }}
        >
          <Gamepad2 size={16} /> ガチャ・ゲーム設定
        </button>
        <button
          type="button"
          onClick={() => setSection('counter')}
          style={{
            ...subTabBtn,
            backgroundColor: section === 'counter' ? '#b45309' : 'transparent',
            color: section === 'counter' ? '#ffffff' : '#4b5563',
            fontWeight: section === 'counter' ? 700 : 500,
          }}
        >
          <QrCode size={16} /> QRスタンプ付与
        </button>
      </div>

      {/* ── SECTION: OFFERS & COUPONS ── */}
      {section === 'offers' && (
        <>
          {/* Quick Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div style={statCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#6b7280', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>登録クーポン総数</span>
                <Tag size={18} color="#b45309" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#111827' }}>
                {offers ? offers.length : '—'} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#6b7280' }}>種</span>
              </div>
            </div>

            <div style={statCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#6b7280', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>公開中・即時有効</span>
                <CheckCircle2 size={18} color="#10b981" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981' }}>
                {offers ? activeCount : '—'} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#6b7280' }}>件</span>
              </div>
            </div>

            <div style={statCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#6b7280', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>注文での累計利用</span>
                <Award size={18} color="#4f46e5" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#4f46e5' }}>
                {offers ? totalUses : '—'} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#6b7280' }}>回</span>
              </div>
            </div>
          </div>

          <section style={panelStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Tag size={20} color="#b45309" />
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1f2937' }}>
                    割引オファー・クーポン一覧
                  </h3>
                </div>
                <p style={{ margin: '0.35rem 0 0', color: '#6b7280', fontSize: '0.875rem', lineHeight: 1.5 }}>
                  ホームページの特典バナー、メニュー画面、注文お会計画面（テイクアウト・モバイルオーダー）に完全連動します。
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={load} disabled={refreshing} style={smallButton} title="最新データを再取得">
                  <RefreshCw size={14} className={refreshing ? 'spin' : ''} /> 更新
                </button>
                <button type="button" onClick={() => setDraft({ ...EMPTY_DRAFT })} style={primaryButton}>
                  <Plus size={16} /> 新規クーポン作成
                </button>
              </div>
            </div>

            {!offers ? (
              <p style={{ color: '#6b7280', padding: '1rem' }}>読み込み中…</p>
            ) : offers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px dashed #d1d5db' }}>
                <Tag size={36} color="#9ca3af" style={{ margin: '0 auto 0.75rem', display: 'block' }} />
                <p style={{ color: '#4b5563', fontWeight: 600, margin: '0 0 0.5rem' }}>登録済みのクーポンはありません</p>
                <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0 0 1rem' }}>
                  「新規クーポン作成」または下のテンプレートからすぐに追加できます。
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => applyTemplate({ titleJa: '初回限定 10%OFF', discountType: 'PERCENT', discountValue: 10, oncePerCustomer: true })}
                    style={templateBtn}
                  >
                    ⚡ 初回限定 10%OFF
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate({ titleJa: 'テイクアウト ¥500引き', discountType: 'AMOUNT', discountValue: 500, minSubtotal: 3000 })}
                    style={templateBtn}
                  >
                    ⚡ ¥500引き (¥3,000以上)
                  </button>
                </div>
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
                            <span style={{ display: 'inline-block', fontWeight: 700, color: '#b45309', backgroundColor: '#fef3c7', padding: '3px 10px', borderRadius: '6px' }}>
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
        </>
      )}

      {/* ── SECTION: STAMP CARD SETTINGS ── */}
      {section === 'stamps' && <StampCardSettings />}

      {/* ── SECTION: LOYALTY SETTINGS ── */}
      {section === 'loyalty' && <LoyaltySettings />}

      {/* ── SECTION: GAME SETTINGS ── */}
      {section === 'game' && <GameSettings />}

      {/* ── SECTION: STAMP SCANNER COUNTER ── */}
      {section === 'counter' && (
        <StampCounter
          focus={intent?.action === 'stamp' ? intent.nonce : undefined}
          initialCode={intent?.action === 'stamp' ? intent.value : undefined}
        />
      )}

      {/* ── CREATE / EDIT DRAFT MODAL WITH LIVE PREVIEW ── */}
      {draft && (
        <div role="dialog" aria-modal="true" aria-labelledby="offer-dialog-title" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <form onSubmit={save} style={{ ...panelStyle, width: '100%', maxWidth: '640px', maxHeight: '92vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <div style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: '0.75rem' }}>
              <h2 id="offer-dialog-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
                {draft.id ? '割引クーポンの編集' : '新規クーポンの作成'}
              </h2>
              <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.85rem' }}>
                お客様が注文時にお会計画面で選択できる割引特典です。保存すると即座にお客様画面に反映されます。
              </p>
            </div>

            {/* Quick Presets */}
            <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', padding: '10px 14px', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#92400e', marginBottom: '6px' }}>
                ⚡ クイック入力テンプレート（クリックで反映）:
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => applyTemplate({ titleJa: '初回限定 10%OFF', discountType: 'PERCENT', discountValue: 10, oncePerCustomer: true })}
                  style={templatePill}
                >
                  初回 10%OFF
                </button>
                <button
                  type="button"
                  onClick={() => applyTemplate({ titleJa: '特別優待 20%OFF', discountType: 'PERCENT', discountValue: 20 })}
                  style={templatePill}
                >
                  特別 20%OFF
                </button>
                <button
                  type="button"
                  onClick={() => applyTemplate({ titleJa: '¥500引きクーポン', discountType: 'AMOUNT', discountValue: 500, minSubtotal: 3000 })}
                  style={templatePill}
                >
                  ¥500引き (¥3,000〜)
                </button>
                <button
                  type="button"
                  onClick={() => applyTemplate({ titleJa: '¥1,000引き感謝クーポン', discountType: 'AMOUNT', discountValue: 1000, minSubtotal: 5000 })}
                  style={templatePill}
                >
                  ¥1,000引き (¥5,000〜)
                </button>
              </div>
            </div>

            {/* Live Visual Preview Card */}
            <div style={{ backgroundColor: '#f9fafb', border: '1.5px dashed #d1d5db', borderRadius: '10px', padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, color: '#4b5563', marginBottom: '8px' }}>
                <Eye size={15} color="#b45309" /> お客様画面での表示プレビュー:
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', backgroundColor: '#ffffff', border: '1.5px solid #fed7aa', borderRadius: '10px', padding: '10px 14px' }}>
                <div style={{
                  backgroundColor: '#fef3c7',
                  color: '#b45309',
                  fontWeight: 900,
                  fontSize: '1.1rem',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #fde68a',
                  whiteSpace: 'nowrap',
                }}>
                  {draft.discountType === 'PERCENT' ? `${draft.discountValue}%OFF` : `${yen(draft.discountValue)}引き`}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, color: '#111827', fontSize: '0.98rem' }}>
                    {draft.titleJa || '（クーポン名未入力）'}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '2px' }}>
                    {draft.minSubtotal > 0 ? `¥${draft.minSubtotal.toLocaleString()}以上で利用可` : '最低金額なし'}
                    {draft.oncePerCustomer ? ' ・ お一人様1回限り' : ''}
                    {draft.endsAt ? ` ・ ${draft.endsAt}まで` : ' ・ 有効期限なし'}
                  </div>
                </div>
              </div>
            </div>

            <label style={labelStyle}>
              クーポン名（お客様向け表示）*
              <input
                required
                maxLength={100}
                placeholder="例: 初回限定 10%OFF、秋の感謝 ¥500引き"
                value={draft.titleJa}
                onChange={e => setDraft({ ...draft, titleJa: e.target.value })}
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              説明文（任意）
              <textarea
                rows={2}
                maxLength={1000}
                placeholder="例: お会計時に自動で適用されます。他クーポンとの併用も可能です。"
                value={draft.descriptionJa}
                onChange={e => setDraft({ ...draft, descriptionJa: e.target.value })}
                style={inputStyle}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <label style={labelStyle}>
                割引タイプ
                <select
                  value={draft.discountType}
                  onChange={e => setDraft({ ...draft, discountType: e.target.value as Draft['discountType'] })}
                  style={inputStyle}
                >
                  <option value="PERCENT">パーセント割引 (%)</option>
                  <option value="AMOUNT">金額割引 (円)</option>
                </select>
              </label>

              <label style={labelStyle}>
                {draft.discountType === 'PERCENT' ? '割引率 (1〜100 %)' : '割引額 (円)'}
                <input
                  type="number"
                  required
                  min={1}
                  max={draft.discountType === 'PERCENT' ? 100 : 1000000}
                  value={draft.discountValue}
                  onChange={e => setDraft({ ...draft, discountValue: Number(e.target.value) })}
                  style={inputStyle}
                />
              </label>
            </div>

            <label style={labelStyle}>
              最低注文金額 (円、0 = 条件なし)
              <input
                type="number"
                min={0}
                value={draft.minSubtotal}
                onChange={e => setDraft({ ...draft, minSubtotal: Number(e.target.value) })}
                style={inputStyle}
                placeholder="0"
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <label style={labelStyle}>
                開始日 (任意)
                <input
                  type="date"
                  value={draft.startsAt}
                  onChange={e => setDraft({ ...draft, startsAt: e.target.value })}
                  style={inputStyle}
                />
              </label>

              <label style={labelStyle}>
                終了日 (任意・当日23:59まで有効)
                <input
                  type="date"
                  value={draft.endsAt}
                  onChange={e => setDraft({ ...draft, endsAt: e.target.value })}
                  style={inputStyle}
                />
              </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', backgroundColor: '#f9fafb', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <label style={checkboxLabel}>
                <input
                  type="checkbox"
                  checked={draft.oncePerCustomer}
                  onChange={e => setDraft({ ...draft, oncePerCustomer: e.target.checked })}
                  style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
                />
                <span><strong>お一人様1回限り</strong>（同じ会員の重複利用を防ぐ）</span>
              </label>
              <label style={checkboxLabel}>
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={e => setDraft({ ...draft, isActive: e.target.checked })}
                  style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
                />
                <span><strong>今すぐ公開する（有効）</strong>（チェックを外すと一時停止になります）</span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setDraft(null)} style={smallButton}>
                キャンセル
              </button>
              <button type="submit" disabled={saving} style={primaryButton}>
                {saving ? '保存中…' : draft.id ? 'クーポンを更新する' : 'クーポンを作成して公開'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const panelStyle: CSSProperties = { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', padding: '1.5rem' };
const statCard: CSSProperties = { backgroundColor: '#fff', borderRadius: '12px', padding: '1.25rem', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' };
const subTabBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.86rem', whiteSpace: 'nowrap', transition: 'all 0.15s ease' };
const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.875rem', fontWeight: 600, color: '#374151' };
const checkboxLabel: CSSProperties = { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.88rem', fontWeight: 500, color: '#1f2937', cursor: 'pointer' };
const inputStyle: CSSProperties = { width: '100%', padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '8px', backgroundColor: '#f9fafb', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '0.95rem' };
const cellHeader: CSSProperties = { padding: '0.75rem 0.65rem', fontWeight: 600, fontSize: '0.82rem' };
const cellStyle: CSSProperties = { padding: '0.85rem 0.65rem', verticalAlign: 'middle' };
const primaryButton: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0.65rem 1.25rem', backgroundColor: '#b45309', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.88rem', boxShadow: '0 2px 6px rgba(180, 83, 9, 0.25)' };
const smallButton: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0.45rem 0.85rem', backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontWeight: 500, fontSize: '0.82rem', color: '#374151' };
const templateBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '6px 12px', backgroundColor: '#ffffff', border: '1px solid #d97706', color: '#b45309', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' };
const templatePill: CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '4px 10px', backgroundColor: '#ffffff', border: '1px solid #f59e0b', color: '#b45309', borderRadius: '9999px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' };
