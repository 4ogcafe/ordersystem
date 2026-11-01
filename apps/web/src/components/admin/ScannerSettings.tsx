import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  Barcode,
  BookOpen,
  Cpu,
  QrCode,
  Radio,
  RotateCcw,
  Settings2,
  Volume2,
  Zap,
} from 'lucide-react';
import {
  connectWebSerial,
  DEFAULT_SCANNER_CONFIG,
  disconnectWebSerial,
  getScannerConfig,
  isWebSerialSupported,
  playScanBeep,
  saveScannerConfig,
  type ScannerConfig,
} from '../../lib/scanner';
import { formatMemberCode } from '../../lib/format';

export default function ScannerSettings() {
  const [config, setConfig] = useState<ScannerConfig>(getScannerConfig);
  const [serialConnected, setSerialConnected] = useState(false);
  const [serialConnecting, setSerialConnecting] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const serialSupported = isWebSerialSupported();
  const [testResult, setTestResult] = useState<{
    raw: string;
    code: string;
    valid: boolean;
    timestamp: string;
  } | null>(null);

  useEffect(() => {
    saveScannerConfig(config);
  }, [config]);

  // Listen to member-scanned events to populate the test result live
  useEffect(() => {
    const onScanned = (e: CustomEvent<{ raw: string; memberCode: string; timestamp: number }>) => {
      const { raw, memberCode } = e.detail;
      const isValid = /^[2-9A-HJKMNP-Z]{8}$/.test(memberCode);
      setTestResult({
        raw,
        code: memberCode,
        valid: isValid,
        timestamp: new Date().toLocaleTimeString(),
      });
      toast.success(`スキャナー検知成功: ${memberCode}`, { icon: '🎯' });
    };

    window.addEventListener('adarsha:member-scanned' as any, onScanned as any);
    window.addEventListener('kalpana:member-scanned' as any, onScanned as any);
    return () => {
      window.removeEventListener('adarsha:member-scanned' as any, onScanned as any);
      window.removeEventListener('kalpana:member-scanned' as any, onScanned as any);
    };
  }, []);

  const handleConnectSerial = async () => {
    if (serialConnected) {
      await disconnectWebSerial();
      setSerialConnected(false);
      toast.success('シリアルポートを切断しました');
      return;
    }

    setSerialConnecting(true);
    const res = await connectWebSerial(config.baudRate);
    setSerialConnecting(false);

    if (res.success) {
      setSerialConnected(true);
      toast.success('NETUM NT-EM61 スキャナーに接続しました');
    } else {
      toast.error(res.error || 'シリアル接続に失敗しました');
    }
  };

  const handleTestBeep = () => {
    playScanBeep('success');
    toast('スキャン確認音（テスト再生）', { icon: '🔔' });
  };

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#fef3c7', color: '#b45309', display: 'grid', placeItems: 'center' }}>
              <QrCode size={16} />
            </span>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600', color: '#111827' }}>
              バーコード・QRスキャナー設定 (Counter QR Scanner)
            </h3>
          </div>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>
            店頭カウンター埋込型リーダー「NETUM NT-EM61 1D/2D モジュール」で会員QRコードを瞬時にスキャン・認識します。
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '9999px',
              background: config.enabled ? '#ecfdf5' : '#f3f4f6',
              color: config.enabled ? '#047857' : '#6b7280',
              fontWeight: 700,
              fontSize: '0.82rem',
            }}
          >
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: config.enabled ? '#10b981' : '#9ca3af' }}></span>
            {config.enabled ? 'スキャナー機能 有効' : '停止中'}
          </span>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('スキャナー設定を初期値に戻しますか？')) {
                setConfig({ ...DEFAULT_SCANNER_CONFIG });
                toast.success('スキャナー設定を初期状態にリセットしました');
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              background: '#fff',
              color: '#4b5563',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={14} /> 初期値に戻す
          </button>
          <button
            type="button"
            onClick={() => setShowGuide(prev => !prev)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              background: '#fff',
              color: '#374151',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <BookOpen size={14} /> {showGuide ? 'ガイドを閉じる' : 'NETUM NT-EM61 設置ガイド'}
          </button>
        </div>
      </div>

      {/* Device Specification Banner */}
      <div style={{ margin: '1.5rem', padding: '1rem 1.25rem', borderRadius: '10px', background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: '#0f172a', color: '#38bdf8', display: 'grid', placeItems: 'center' }}>
            <Cpu size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              NETUM NT-EM61 1D/2D Recessed Scanner Module USB/TTL
              <span style={{ fontSize: '0.72rem', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '9999px', fontWeight: 700 }}>
                開発キット・組込対応
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
              640×480 CMOS / 読取距離 30〜200mm / 広角FOV 水平68° 垂直51° / 白色LED照明 + 赤色照準
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={e => setConfig(prev => ({ ...prev, enabled: e.target.checked }))}
              style={{ width: '18px', height: '18px', accentColor: '#b5451b', cursor: 'pointer' }}
            />
            スキャナー入力を有効にする
          </label>
        </div>
      </div>

      {/* Main Settings Form */}
      <div style={{ padding: '0 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Interface Type Selection */}
        <div>
          <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: '#111827', marginBottom: '0.5rem' }}>
            接続インターフェース (Connection Interface)
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
            {/* Mode 1: USB HID (Keyboard Wedge) */}
            <div
              onClick={() => setConfig(prev => ({ ...prev, interfaceType: 'USB_HID' }))}
              style={{
                border: config.interfaceType === 'USB_HID' ? '2px solid #b5451b' : '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '16px',
                background: config.interfaceType === 'USB_HID' ? '#fdf8f6' : '#fff',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Zap size={16} style={{ color: '#b5451b' }} /> USB HID (キーボードウェッジ)
                </span>
                <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '9999px', fontWeight: 700 }}>
                  推奨・標準
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#6b7280', lineHeight: 1.5 }}>
                NETUM NT-EM61 のUSBケーブルをPC/POSに差し込むだけで動作します。ドライバー不要。QRコードを読み取ると自動でキー入力とEnterが送信されます。
              </p>
            </div>

            {/* Mode 2: Web Serial API */}
            <div
              onClick={() => setConfig(prev => ({ ...prev, interfaceType: 'WEB_SERIAL' }))}
              style={{
                border: config.interfaceType === 'WEB_SERIAL' ? '2px solid #b5451b' : '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '16px',
                background: config.interfaceType === 'WEB_SERIAL' ? '#fdf8f6' : '#fff',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Radio size={16} style={{ color: '#b5451b' }} /> Web Serial API (USB仮想COM / TTL)
                </span>
                <span style={{ fontSize: '0.72rem', background: '#e0e7ff', color: '#4338ca', padding: '2px 8px', borderRadius: '9999px', fontWeight: 700 }}>
                  シリアル直接通信
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#6b7280', lineHeight: 1.5 }}>
                Chrome / Edge のWeb Serial APIを使用して、NETUM NT-EM61の仮想COMポート/TTLシリアルから直接ストリーム受信します。
              </p>
              {!serialSupported && (
                <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#b91c1c', background: '#fee2e2', padding: '4px 8px', borderRadius: '6px' }}>
                  ⚠️ 現在のブラウザはWeb Serial APIに未対応です（Google Chrome または MS Edge を推奨）
                </div>
              )}
              {config.interfaceType === 'WEB_SERIAL' && (
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <select
                    value={config.baudRate}
                    onChange={e => setConfig(prev => ({ ...prev, baudRate: Number(e.target.value) }))}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.82rem' }}
                  >
                    <option value={9600}>9600 bps (NETUM初期値)</option>
                    <option value={19200}>19200 bps</option>
                    <option value={38400}>38400 bps</option>
                    <option value={115200}>115200 bps</option>
                  </select>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); handleConnectSerial(); }}
                    disabled={serialConnecting}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      background: serialConnected ? '#ef4444' : '#111827',
                      color: '#fff',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {serialConnected ? '切断' : serialConnecting ? '接続中…' : 'スキャナー接続'}
                  </button>
                  {serialConnected && (
                    <span style={{ fontSize: '0.78rem', color: '#059669', fontWeight: 700 }}>🟢 接続完了</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Behavior Options */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
          {/* Global Scan Interception */}
          <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '12px', border: '1px solid #f3f4f6' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.globalListening}
                onChange={e => setConfig(prev => ({ ...prev, globalListening: e.target.checked }))}
                style={{ width: '18px', height: '18px', accentColor: '#b5451b', marginTop: '2px', cursor: 'pointer' }}
              />
              <div>
                <span style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', color: '#111827' }}>
                  グローバル自動スキャン検知
                </span>
                <span style={{ display: 'block', fontSize: '0.8rem', color: '#6b7280', marginTop: '3px', lineHeight: 1.4 }}>
                  管理画面のどのページを開いていても、入力欄にフォーカスを当てずにQRをかざすだけで自動認識します。
                </span>
              </div>
            </label>
          </div>

          {/* Auto open stamp counter */}
          <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '12px', border: '1px solid #f3f4f6' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.autoOpenStampCounter}
                onChange={e => setConfig(prev => ({ ...prev, autoOpenStampCounter: e.target.checked }))}
                style={{ width: '18px', height: '18px', accentColor: '#b5451b', marginTop: '2px', cursor: 'pointer' }}
              />
              <div>
                <span style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', color: '#111827' }}>
                  スキャン時にスタンプ画面へ自動遷移
                </span>
                <span style={{ display: 'block', fontSize: '0.8rem', color: '#6b7280', marginTop: '3px', lineHeight: 1.4 }}>
                  スキャン検知時、自動的に「スタンプ・特典」タブへ移動し該当会員カードを即時オープンします。
                </span>
              </div>
            </label>
          </div>

          {/* Auto-Stamp on Scan with Gap Timer */}
          <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '12px', border: '1px solid #f3f4f6' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.autoStampOnScan}
                onChange={e => setConfig(prev => ({ ...prev, autoStampOnScan: e.target.checked }))}
                style={{ width: '18px', height: '18px', accentColor: '#b5451b', marginTop: '2px', cursor: 'pointer' }}
              />
              <div style={{ flex: 1 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', color: '#111827' }}>
                  スキャン時に自動でスタンプを押印 (Auto-Stamp)
                </span>
                <span style={{ display: 'block', fontSize: '0.8rem', color: '#6b7280', marginTop: '3px', lineHeight: 1.4 }}>
                  店頭カウンターで会員QRをスキャンした際、スタッフの手動操作なしで自動押印します。タイマー時間内の再スキャン時は通知を表示し、二重押印を防止します。
                </span>
                {config.autoStampOnScan && (
                  <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#374151' }}>
                    <label style={{ fontWeight: 600 }}>押印インターバル（タイマー）:</label>
                    <input
                      type="number"
                      min={0}
                      max={72}
                      value={config.autoStampGapHours ?? 6}
                      onChange={e => setConfig(prev => ({ ...prev, autoStampGapHours: Math.max(0, Number(e.target.value)) }))}
                      style={{ width: '60px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.82rem', fontWeight: 700 }}
                    />
                    <span>時間以上の間隔（初期値: 6時間）</span>
                  </div>
                )}
              </div>
            </label>
          </div>

          {/* Beep sound */}
          <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '12px', border: '1px solid #f3f4f6' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', flex: 1 }}>
                <input
                  type="checkbox"
                  checked={config.beepOnScan}
                  onChange={e => setConfig(prev => ({ ...prev, beepOnScan: e.target.checked }))}
                  style={{ width: '18px', height: '18px', accentColor: '#b5451b', marginTop: '2px', cursor: 'pointer' }}
                />
                <div>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', color: '#111827' }}>
                    スキャン確認チャイム音
                  </span>
                  <span style={{ display: 'block', fontSize: '0.8rem', color: '#6b7280', marginTop: '3px', lineHeight: 1.4 }}>
                    会員QRの読み取り成功時にPCスピーカーから「ピピッ」と確認音を鳴らします。
                  </span>
                </div>
              </label>
              <button
                type="button"
                onClick={handleTestBeep}
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', fontSize: '0.78rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <Volume2 size={13} /> テスト
              </button>
            </div>
          </div>
        </div>

        {/* Advanced Decoding Parameters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
              プレフィックス削除 (Prefix to Strip)
            </label>
            <input
              type="text"
              value={config.stripPrefix}
              onChange={e => setConfig(prev => ({ ...prev, stripPrefix: e.target.value }))}
              placeholder="ADARSHA:"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }}
            />
            <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>会員QRは「ADARSHA:コード」形式で発行されます</span>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
              スキャン終端コード (Terminator)
            </label>
            <select
              value={config.terminator}
              onChange={e => setConfig(prev => ({ ...prev, terminator: e.target.value as any }))}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box', background: '#fff' }}
            >
              <option value="ENTER">Enter (CR/LF) [NETUM初期設定]</option>
              <option value="TAB">Tab</option>
              <option value="NONE">終端なし (None)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
              打鍵速度閾値 (Typing Burst Filter)
            </label>
            <select
              value={config.speedThresholdMs}
              onChange={e => setConfig(prev => ({ ...prev, speedThresholdMs: Number(e.target.value) }))}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box', background: '#fff' }}
            >
              <option value={30}>30ms (超高速ハードウェア)</option>
              <option value={50}>50ms (NETUM NT-EM61 推奨)</option>
              <option value={80}>80ms (余裕を持った検知)</option>
              <option value={120}>120ms (低速端末向け)</option>
            </select>
            <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>人間の手入力を誤検知しないための速度フィルター</span>
          </div>
        </div>

        {/* Live Interactive Scanner Test Area */}
        <div style={{ background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1', padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Barcode size={18} style={{ color: '#b5451b' }} /> スキャナー動作テスト (Live Test Area)
            </span>
            {testResult && (
              <button
                type="button"
                onClick={() => setTestResult(null)}
                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.78rem', cursor: 'pointer' }}
              >
                クリア
              </button>
            )}
          </div>
          <p style={{ margin: '0 0 12px 0', fontSize: '0.82rem', color: '#64748b' }}>
            NETUM NT-EM61 を接続し、スマホの会員QRコード（または任意のバーコード）をかざしてください。リアルタイムに受信データがここに表示されます。
          </p>

          {testResult ? (
            <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>受信日時: {testResult.timestamp}</span>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: testResult.valid ? '#dcfce7' : '#fee2e2',
                    color: testResult.valid ? '#15803d' : '#b91c1c',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                  }}
                >
                  {testResult.valid ? '✓ 有効なアダルサ会員コード' : '⚠️ 不明なQRコード'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline', marginTop: '4px' }}>
                <span style={{ fontSize: '0.82rem', color: '#64748b' }}>抽出コード:</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>
                  {formatMemberCode(testResult.code)}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', overflowWrap: 'anywhere' }}>
                生データ (Raw): <code style={{ color: '#334155' }}>{testResult.raw}</code>
              </div>
            </div>
          ) : (
            <div style={{ padding: '16px', textAlign: 'center', background: '#fff', borderRadius: '8px', border: '1px solid #f1f5f9', color: '#94a3b8', fontSize: '0.85rem' }}>
              スキャナーで読み取ると、ここに結果が表示されます（待機中…）
            </div>
          )}
        </div>

        {/* Collapsible Hardware Setup Guide for NETUM NT-EM61 */}
        {showGuide && (
          <div style={{ background: '#faf5ff', borderRadius: '12px', border: '1px solid #e9d5ff', padding: '20px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '1.05rem', color: '#6b21a8', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Settings2 size={18} /> NETUM NT-EM61 1D/2D 埋め込み設置 &amp; ハードウェア設定マニュアル
            </h4>
            <div style={{ fontSize: '0.86rem', color: '#4c1d95', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <strong>1. カウンターへの埋め込み開口寸法</strong>
                <p style={{ margin: '4px 0 0', color: '#581c87' }}>
                  NETUM NT-EM61 の本体サイズは 約 49mm × 44mm × 25mm です。カウンター天板またはアクリルケースの窓開口寸法は
                  <strong> 50mm × 45mm</strong> を推奨します。スマートフォンの画面ガラスとの反射を防ぐため、受光窓を約 10度〜15度 傾けて設置すると読取精度が大幅に向上します。
                </p>
              </div>

              <div>
                <strong>2. USB / TTL 配線について</strong>
                <p style={{ margin: '4px 0 0', color: '#581c87' }}>
                  ・<strong>USB接続（標準）</strong>: 付属のMicro-USB/Type-CケーブルでPOS端末・PCのUSBポートに接続するだけで即座にキーボードウェッジとして認識されます。<br />
                  ・<strong>TTLシリアル接続</strong>: 4ピン（VCC 5V, GND, TXD, RXD）をマイコンまたはUSB-UART変換基板（FTDI / CH340）に接続し、Web Serial API で 9600 bps で通信します。
                </p>
              </div>

              <div>
                <strong>3. NETUM NT-EM61 の動作モード（自動検知・常時点灯）</strong>
                <p style={{ margin: '4px 0 0', color: '#581c87' }}>
                  付属のクイックユーザーガイドのバーコードを読み取らせることで、以下の動作を変更できます：<br />
                  ・<strong>Auto-Induction Mode (自動感知モード) [おすすめ]</strong>: お客様がスマホをかざした時だけ白色LEDが点灯してスキャンします。<br />
                  ・<strong>Continuous Mode (常時読み取りモード)</strong>: 常にLEDが点灯し、超高速スキャンが可能になります。<br />
                  ・<strong>Add Enter Suffix (終端Enter)</strong>: 工場出荷時で通常有効ですが、もし連続入力されない場合は「Add Enter」設定バーコードをスキャンしてください。
                </p>
              </div>

              <div style={{ background: '#fff', borderRadius: '8px', padding: '12px', border: '1px solid #d8b4fe', fontSize: '0.8rem', color: '#6b21a8' }}>
                💡 <strong>ヒント:</strong> 会員証QRコードには「ADARSHA:K7MP2QXA」というプレフィックスが含まれており、一般的な商品バーコードやクーポンの誤認を防ぐ安全設計になっています。
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
