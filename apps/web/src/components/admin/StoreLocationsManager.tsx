import React, { useEffect, useState, type CSSProperties } from 'react';
import { toast } from 'react-hot-toast';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, RotateCcw, X, MapPin, LocateFixed, Save, Clock, Sun, Moon } from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';

export interface StoreLocation {
  id: string;
  number: string;
  name: string;
  area: string;
  badge: string;
  address: string;
  access: string;
  hours: string;
  holiday: string;
  phone: string;
  rating: number;
  reviewCount: number;
  mapEmbedUrl: string;
  /** Coordinates for the nearest-store feature. Strings while editing; blank = geocode on save. */
  latitude?: number | string | null;
  longitude?: number | string | null;
  /** Set by the API when the coordinates are only the built-in station-level fallback. */
  coordsApproximate?: boolean;
}

const emptyStore: Omit<StoreLocation, 'id' | 'number'> = {
  name: '',
  area: '',
  badge: '🍛 インド料理',
  address: '',
  access: '',
  hours: 'ランチ 11:00–16:30 / ディナー 16:30–23:00',
  holiday: '年中無休',
  phone: '',
  rating: 4.4,
  reviewCount: 100,
  mapEmbedUrl: '',
  latitude: '',
  longitude: '',
};

export default function StoreLocationsManager() {
  const [stores, setStores] = useState<StoreLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingStore, setEditingStore] = useState<StoreLocation | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [formData, setFormData] = useState<Omit<StoreLocation, 'id' | 'number'>>(emptyStore);
  const [submitting, setSubmitting] = useState(false);

  // Geolocation & Auto-Select settings
  const [geoSettings, setGeoSettings] = useState({
    geolocationEnabled: true,
    geolocationAutoSelect: true,
    geolocationMaxDistanceKm: 10,
    lunchOrderEnabled: true,
    lunchOrderHours: '11:00-16:30',
    dinnerOrderEnabled: true,
    dinnerOrderHours: '16:30-23:00',
    enforceOrderTimeWindow: true,
  });
  const [savingGeo, setSavingGeo] = useState(false);

  const fetchStores = async () => {
    try {
      setLoading(true);
      const [resStores, resSettings] = await Promise.all([
        apiFetch('/api/v1/stores'),
        apiFetch('/api/v1/settings'),
      ]);
      if (resStores.ok) {
        const data = await resStores.json();
        setStores(data);
      }
      if (resSettings.ok) {
        const s = await resSettings.json();
        setGeoSettings({
          geolocationEnabled: s.geolocationEnabled !== false,
          geolocationAutoSelect: s.geolocationAutoSelect !== false,
          geolocationMaxDistanceKm: typeof s.geolocationMaxDistanceKm === 'number' ? s.geolocationMaxDistanceKm : 10,
          lunchOrderEnabled: s.lunchOrderEnabled !== false,
          lunchOrderHours: s.lunchOrderHours || '11:00-16:30',
          dinnerOrderEnabled: s.dinnerOrderEnabled !== false,
          dinnerOrderHours: s.dinnerOrderHours || '16:30-23:00',
          enforceOrderTimeWindow: s.enforceOrderTimeWindow !== false,
        });
      }
    } catch (err) {
      console.error('Failed to load stores or settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGeoSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingGeo(true);
    try {
      const res = await apiFetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geoSettings),
      });
      if (res.ok) {
        toast.success('位置情報と注文受付時間設定を保存しました');
      } else {
        toast.error(await errorMessage(res, '設定の保存に失敗しました'));
      }
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setSavingGeo(false);
    }
  };

  useEffect(() => {
    fetchStores();
  }, []);

  const openAddModal = () => {
    setIsNew(true);
    setEditingStore(null);
    setFormData({ ...emptyStore });
  };

  const openEditModal = (store: StoreLocation) => {
    setIsNew(false);
    setEditingStore(store);
    setFormData({
      name: store.name,
      area: store.area,
      badge: store.badge,
      address: store.address,
      access: store.access,
      hours: store.hours,
      holiday: store.holiday,
      phone: store.phone,
      rating: store.rating,
      reviewCount: store.reviewCount,
      mapEmbedUrl: store.mapEmbedUrl,
      // Leave approximate fallback coordinates blank so saving geocodes the real address instead.
      latitude: store.coordsApproximate ? '' : (store.latitude ?? ''),
      longitude: store.coordsApproximate ? '' : (store.longitude ?? ''),
    });
  };

  const closeModal = () => {
    setEditingStore(null);
    setIsNew(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.address.trim()) {
      toast.error('店舗名と住所は必須です');
      return;
    }
    setSubmitting(true);
    try {
      if (isNew) {
        const res = await apiFetch('/api/v1/stores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        if (res.ok) {
          toast.success('店舗を追加しました');
          closeModal();
          fetchStores();
        } else {
          toast.error(await errorMessage(res, '店舗の追加に失敗しました'));
        }
      } else if (editingStore) {
        const res = await apiFetch(`/api/v1/stores/${editingStore.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        if (res.ok) {
          toast.success('店舗情報を更新しました');
          closeModal();
          fetchStores();
        } else {
          toast.error(await errorMessage(res, '更新に失敗しました'));
        }
      }
    } catch (err) {
      toast.error('通信エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (store: StoreLocation) => {
    if (!window.confirm(`「${store.name}」を削除してもよろしいですか？`)) return;
    try {
      const res = await apiFetch(`/api/v1/stores/${store.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(`「${store.name}」を削除しました`);
        fetchStores();
      } else {
        toast.error(await errorMessage(res, '削除に失敗しました'));
      }
    } catch {
      toast.error('通信エラーが発生しました');
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= stores.length) return;

    const newStores = [...stores];
    const [moved] = newStores.splice(index, 1);
    newStores.splice(targetIndex, 0, moved);

    setStores(newStores);
    try {
      const res = await apiFetch('/api/v1/stores/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: newStores.map(s => s.id) }),
      });
      if (!res.ok) {
        toast.error('順序の保存に失敗しました');
        fetchStores();
      }
    } catch {
      toast.error('通信エラーが発生しました');
      fetchStores();
    }
  };

  const handleReset = async () => {
    if (!window.confirm('全店舗データを初期設定（10店舗）にリセットしますか？')) return;
    try {
      const res = await apiFetch('/api/v1/stores/reset', { method: 'POST' });
      if (res.ok) {
        toast.success('店舗データを初期設定にリセットしました');
        fetchStores();
      } else {
        toast.error('リセットに失敗しました');
      }
    } catch {
      toast.error('通信エラーが発生しました');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.5rem' }}>
      {/* Geolocation & Nearest Store Auto-Selection Settings */}
      <div style={{ background: '#fff', borderRadius: '12px', padding: '1.5rem 2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #fed7aa' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #ea580c, #c2410c)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <LocateFixed size={20} />
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#111827' }}>
                位置情報（Geolocation）＆ 最寄り店舗の自動選択設定
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#6b7280' }}>
                お客様のGPS現在地または郵便番号・住所から最寄りの店舗を自動判定・提案する機能を設定します。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleSaveGeoSettings()}
            disabled={savingGeo}
            style={{
              padding: '0.55rem 1.25rem',
              backgroundColor: '#ea580c',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.88rem',
              cursor: savingGeo ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(234, 88, 12, 0.25)',
              opacity: savingGeo ? 0.7 : 1,
            }}
          >
            {savingGeo ? '保存中…' : <><Save size={15} /> 設定を保存</>}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', background: '#fffaf5', padding: '16px 20px', borderRadius: '10px', border: '1px solid #ffedd5' }}>
          {/* Toggle: Enable Geolocation Feature */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={geoSettings.geolocationEnabled}
              onChange={e => setGeoSettings({ ...geoSettings, geolocationEnabled: e.target.checked })}
              style={{ marginTop: '3px', width: '18px', height: '18px', accentColor: '#ea580c' }}
            />
            <div>
              <strong style={{ fontSize: '0.92rem', color: '#1f2937' }}>最寄り店舗検索機能を有効にする</strong>
              <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: '#4b5563', lineHeight: 1.4 }}>
                注文ページ・カート内に「現在地から最寄り店舗を選ぶ」ボタンと郵便番号・住所検索を表示します。
              </p>
            </div>
          </label>

          {/* Toggle: Automatic Nearest Branch Selection on Page Load */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: geoSettings.geolocationEnabled ? 'pointer' : 'not-allowed', opacity: geoSettings.geolocationEnabled ? 1 : 0.6 }}>
            <input
              type="checkbox"
              disabled={!geoSettings.geolocationEnabled}
              checked={geoSettings.geolocationAutoSelect && geoSettings.geolocationEnabled}
              onChange={e => setGeoSettings({ ...geoSettings, geolocationAutoSelect: e.target.checked })}
              style={{ marginTop: '3px', width: '18px', height: '18px', accentColor: '#ea580c' }}
            />
            <div>
              <strong style={{ fontSize: '0.92rem', color: '#1f2937' }}>ページ読み込み時の自動選択</strong>
              <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: '#4b5563', lineHeight: 1.4 }}>
                お客様が来店時、自動的にGPSから最寄り店舗を選択します（お客様が手動で選んだ履歴がある場合は上書きしません）。
              </p>
            </div>
          </label>

          {/* Max Distance Threshold */}
          <div style={{ opacity: geoSettings.geolocationEnabled ? 1 : 0.6 }}>
            <label style={{ display: 'block', fontSize: '0.92rem', fontWeight: 600, color: '#1f2937', marginBottom: '4px' }}>
              自動選択を許可する最大距離（km）
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                disabled={!geoSettings.geolocationEnabled}
                value={geoSettings.geolocationMaxDistanceKm}
                onChange={e => setGeoSettings({ ...geoSettings, geolocationMaxDistanceKm: Math.max(1, parseInt(e.target.value, 10) || 10) })}
                style={{
                  width: '90px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  backgroundColor: '#fff',
                }}
              />
              <span style={{ fontSize: '0.85rem', color: '#4b5563' }}>km 以内</span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
              最寄りの店舗がこの距離を超える場合は自動選択せず、「お近くに店舗がありません」と案内します。
            </p>
          </div>
        </div>

        {/* Global Lunch & Dinner Takeout Order Windows */}
        <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px dashed #fed7aa', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={16} style={{ color: '#ea580c' }} />
            <strong style={{ fontSize: '0.9rem', color: '#1f2937' }}>
              オンライン注文・テイクアウト受付時間（ディナー・ランチ共通設定）
            </strong>
          </div>
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280' }}>
            受付時間外にお客様が注文しようとした際、指定された受付時間（例:【16:30〜23:00】）が案内メッセージとして自動表示されます。
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            {/* Lunch Order Hours */}
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.82rem', fontWeight: 700, color: '#92400e' }}>
                  <Sun size={15} /> ランチ受付時間
                </span>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600, color: '#92400e', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={geoSettings.lunchOrderEnabled}
                    onChange={e => setGeoSettings({ ...geoSettings, lunchOrderEnabled: e.target.checked })}
                  />
                  有効
                </label>
              </div>
              <input
                type="text"
                value={geoSettings.lunchOrderHours}
                onChange={e => setGeoSettings({ ...geoSettings, lunchOrderHours: e.target.value })}
                placeholder="11:00-16:30"
                style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #fcd34d', fontSize: '0.85rem', fontWeight: 600, backgroundColor: '#fff' }}
              />
              <span style={{ fontSize: '0.72rem', color: '#b45309', display: 'block', marginTop: '4px' }}>
                形式: 11:00-16:30（半角または全角）
              </span>
            </div>

            {/* Dinner Order Hours */}
            <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.82rem', fontWeight: 700, color: '#5b21b6' }}>
                  <Moon size={15} /> ディナー受付時間 (グランドメニュー)
                </span>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600, color: '#5b21b6', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={geoSettings.dinnerOrderEnabled}
                    onChange={e => setGeoSettings({ ...geoSettings, dinnerOrderEnabled: e.target.checked })}
                  />
                  有効
                </label>
              </div>
              <input
                type="text"
                value={geoSettings.dinnerOrderHours}
                onChange={e => setGeoSettings({ ...geoSettings, dinnerOrderHours: e.target.value })}
                placeholder="16:30-23:00"
                style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #c4b5fd', fontSize: '0.85rem', fontWeight: 600, backgroundColor: '#fff' }}
              />
              <span style={{ fontSize: '0.72rem', color: '#6d28d9', display: 'block', marginTop: '4px' }}>
                形式: 16:30-23:00（時間外通知メッセージの基準になります）
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Store Locations List Card */}
      <div style={{ background: '#fff', borderRadius: '12px', padding: '1.75rem 2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '1.5rem', borderBottom: '1px solid #f3f4f6', paddingBottom: '1rem' }}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: '1.2rem', fontWeight: 700, color: '#111827' }}>
            店舗一覧・管理（全{stores.length}店舗）
          </h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>
            ホームページの「私たちの店舗」タブとカード情報にリアルタイムで反映されます。
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={openAddModal}
            style={{
              padding: '0.55rem 1rem',
              backgroundColor: '#b3471c',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.88rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(179, 71, 28, 0.25)',
            }}
          >
            <Plus size={16} /> 店舗を追加
          </button>
          <button
            type="button"
            onClick={handleReset}
            title="10店舗の初期設定に戻す"
            style={{
              padding: '0.55rem 0.9rem',
              backgroundColor: '#fff',
              color: '#6b7280',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontWeight: 500,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <RotateCcw size={14} /> 初期データに戻す
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>店舗データを読み込み中…</div>
      ) : stores.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280', background: '#f9fafb', borderRadius: '8px' }}>
          登録されている店舗がありません。「店舗を追加」ボタンから登録してください。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {stores.map((store, index) => (
            <div
              key={store.id}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                backgroundColor: index === 0 ? '#fffdfb' : '#ffffff',
                borderLeft: index === 0 ? '4px solid #b3471c' : '1px solid #e5e7eb',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: '1 1 320px', minWidth: 0 }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#b3471c', fontFamily: 'serif', width: '28px', textAlign: 'center' }}>
                  {store.number}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
                    <strong style={{ fontSize: '1rem', color: '#111827' }}>{store.name}</strong>
                    <span style={{ fontSize: '0.78rem', backgroundColor: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '9999px', fontWeight: 600 }}>
                      {store.badge}
                    </span>
                    {store.area && <span style={{ fontSize: '0.8rem', color: '#9c542a', fontWeight: 600 }}>{store.area}</span>}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#4b5563', lineHeight: 1.4 }}>
                    📍 {store.address} {store.access && <span style={{ color: '#6b7280' }}>({store.access})</span>}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 600, marginTop: '2px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <span>🕒 {store.hours} {store.holiday && <span>・ {store.holiday}</span>}</span>
                    {store.phone && <span style={{ color: '#374151' }}>📞 {store.phone}</span>}
                    <span style={{ color: '#d97706' }}>★ {store.rating} ({store.reviewCount}件)</span>
                    {store.latitude != null && store.longitude != null && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#2563eb', backgroundColor: '#eff6ff', padding: '1px 6px', borderRadius: '4px', fontSize: '0.72rem' }}>
                        <MapPin size={11} /> 座標設定済 ({Number(store.latitude).toFixed(4)}, {Number(store.longitude).toFixed(4)})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => handleMove(index, 'up')}
                  disabled={index === 0}
                  title="上へ移動"
                  style={{
                    padding: '6px',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                    background: index === 0 ? '#f9fafb' : '#fff',
                    color: index === 0 ? '#d1d5db' : '#374151',
                    cursor: index === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(index, 'down')}
                  disabled={index === stores.length - 1}
                  title="下へ移動"
                  style={{
                    padding: '6px',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                    background: index === stores.length - 1 ? '#f9fafb' : '#fff',
                    color: index === stores.length - 1 ? '#d1d5db' : '#374151',
                    cursor: index === stores.length - 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <ArrowDown size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => openEditModal(store)}
                  title="編集"
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    background: '#fff',
                    color: '#1f2937',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Pencil size={14} /> 編集
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(store)}
                  title="削除"
                  style={{
                    padding: '6px',
                    borderRadius: '6px',
                    border: '1px solid #fecaca',
                    background: '#fff',
                    color: '#dc2626',
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Dialog for Add / Edit */}
      {(isNew || editingStore) && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={closeModal}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '14px',
              maxWidth: '680px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
              padding: '24px 28px',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid #f3f4f6', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#111827' }}>
                {isNew ? '新しい店舗を追加' : `店舗情報を編集: ${editingStore?.name}`}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                <label style={modalLbl}>
                  店舗名 (必須)
                  <input
                    style={modalInp}
                    required
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="例: アダルサ 武蔵境店"
                  />
                </label>
                <label style={modalLbl}>
                  エリア・地域
                  <input
                    style={modalInp}
                    type="text"
                    value={formData.area}
                    onChange={e => setFormData({ ...formData, area: e.target.value })}
                    placeholder="例: 武蔵境・東京都武蔵野市"
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                <label style={modalLbl}>
                  業態バッジ
                  <input
                    style={modalInp}
                    type="text"
                    value={formData.badge}
                    onChange={e => setFormData({ ...formData, badge: e.target.value })}
                    placeholder="例: 🍛 インド料理"
                  />
                </label>
                <label style={modalLbl}>
                  電話番号
                  <input
                    style={modalInp}
                    type="text"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="例: 0422-36-2210"
                  />
                </label>
              </div>

              <label style={modalLbl}>
                住所 (必須)
                <input
                  style={modalInp}
                  required
                  type="text"
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  placeholder="例: 〒180-0022 東京都武蔵野市境2-14-10 クレール武蔵野1F"
                />
              </label>

              <label style={modalLbl}>
                最寄り駅・アクセス案内
                <input
                  style={modalInp}
                  type="text"
                  value={formData.access}
                  onChange={e => setFormData({ ...formData, access: e.target.value })}
                  placeholder="例: 武蔵境駅 nonowa口から徒歩1分"
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                <label style={modalLbl}>
                  営業時間
                  <input
                    style={modalInp}
                    type="text"
                    value={formData.hours}
                    onChange={e => setFormData({ ...formData, hours: e.target.value })}
                    placeholder="例: ランチ 11:00–16:30 / ディナー 16:30–23:00"
                  />
                </label>
                <label style={modalLbl}>
                  定休日・特記事項
                  <input
                    style={modalInp}
                    type="text"
                    value={formData.holiday}
                    onChange={e => setFormData({ ...formData, holiday: e.target.value })}
                    placeholder="例: 年中無休 または 定休日: 火曜日"
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={modalLbl}>
                  Google評価点数 (0.0〜5.0)
                  <input
                    style={modalInp}
                    type="number"
                    step="0.1"
                    min="0"
                    max="5"
                    value={formData.rating}
                    onChange={e => setFormData({ ...formData, rating: parseFloat(e.target.value) || 0 })}
                    placeholder="4.4"
                  />
                </label>
                <label style={modalLbl}>
                  Google口コミ件数
                  <input
                    style={modalInp}
                    type="number"
                    min="0"
                    value={formData.reviewCount}
                    onChange={e => setFormData({ ...formData, reviewCount: parseInt(e.target.value, 10) || 0 })}
                    placeholder="325"
                  />
                </label>
              </div>

              <label style={modalLbl}>
                Google マップ 埋め込みURL（任意：空欄時は住所から自動生成されます）
                <input
                  style={modalInp}
                  type="text"
                  value={formData.mapEmbedUrl}
                  onChange={e => setFormData({ ...formData, mapEmbedUrl: e.target.value })}
                  placeholder="https://maps.google.com/maps?q=...&output=embed"
                />
              </label>

              {/* Used by "現在地から最寄り店舗を選ぶ" on the order page. */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={modalLbl}>
                  緯度（任意：空欄時は住所から自動取得）
                  <input
                    style={modalInp}
                    type="number"
                    step="any"
                    min="-90"
                    max="90"
                    value={formData.latitude ?? ''}
                    onChange={e => setFormData({ ...formData, latitude: e.target.value })}
                    placeholder="35.7021"
                  />
                </label>
                <label style={modalLbl}>
                  経度（任意：Googleマップで右クリック→座標をコピー）
                  <input
                    style={modalInp}
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                    value={formData.longitude ?? ''}
                    onChange={e => setFormData({ ...formData, longitude: e.target.value })}
                    placeholder="139.5434"
                  />
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px', borderTop: '1px solid #f3f4f6', paddingTop: '16px' }}>
                <button
                  type="button"
                  onClick={closeModal}
                  style={{
                    padding: '0.6rem 1.2rem',
                    backgroundColor: '#fff',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '0.6rem 1.5rem',
                    backgroundColor: '#b3471c',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(179, 71, 28, 0.3)',
                  }}
                >
                  {submitting ? '保存中…' : isNew ? '店舗を追加する' : '変更を保存する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

const modalLbl: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  fontSize: '0.85rem',
  fontWeight: 600,
  color: '#374151',
};

const modalInp: CSSProperties = {
  padding: '0.6rem 0.75rem',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '0.9rem',
  outline: 'none',
};
