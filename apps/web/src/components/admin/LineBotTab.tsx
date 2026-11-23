import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { MessageCircle, Plus, Trash2, Eye, Save, Link2 } from 'lucide-react';
import { apiFetch, errorMessage } from '../../lib/api';

type Intent = 'text' | 'stores' | 'hours' | 'menu' | 'order' | 'reserve' | 'contact';

interface QuickReply {
  label: string;
  text: string;
}

interface KeywordReply {
  id: string;
  keywords: string[];
  intent: Intent;
  replyJa: string;
}

interface LineConfig {
  enabled: boolean;
  channelId: string;
  channelSecret: string;
  channelAccessToken: string;
  basicId: string;
  addFriendUrl: string;
  showFloatButton: boolean;
  floatButtonLabelJa: string;
  welcomeMessageJa: string;
  fallbackMessageJa: string;
  quickReplies: QuickReply[];
  keywordReplies: KeywordReply[];
  siteUrl: string;
  hasChannelSecret?: boolean;
  hasChannelAccessToken?: boolean;
  webhookPath?: string;
}

const INTENT_OPTIONS: { value: Intent; label: string }[] = [
  { value: 'text', label: '定型文（下の返信文）' },
  { value: 'menu', label: 'メニューリンク' },
  { value: 'stores', label: '店舗一覧＋電話' },
  { value: 'hours', label: '営業時間' },
  { value: 'order', label: 'オンライン注文リンク' },
  { value: 'reserve', label: '予約案内' },
  { value: 'contact', label: 'お問い合わせ' },
];

const empty: LineConfig = {
  enabled: false,
  channelId: '',
  channelSecret: '',
  channelAccessToken: '',
  basicId: '',
  addFriendUrl: '',
  showFloatButton: true,
  floatButtonLabelJa: 'LINEで相談',
  welcomeMessageJa: '',
  fallbackMessageJa: '',
  quickReplies: [],
  keywordReplies: [],
  siteUrl: 'https://adarsha.jp',
};

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: '1.5rem',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  marginBottom: '1.25rem',
};
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 12 };
const input: React.CSSProperties = { padding: '0.65rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 8, background: '#f9fafb', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box', fontWeight: 400 };
const btnPrimary: React.CSSProperties = { padding: '0.65rem 1.25rem', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 };
const btnGhost: React.CSSProperties = { padding: '0.5rem 0.9rem', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' };

export default function LineBotTab() {
  const [config, setConfig] = useState<LineConfig>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewText, setPreviewText] = useState('メニュー');
  const [previewResult, setPreviewResult] = useState('');
  const [webhookBase, setWebhookBase] = useState('');

  useEffect(() => {
    setWebhookBase(window.location.origin);
    apiFetch('/api/v1/line/config')
      .then(async (res) => {
        if (!res.ok) throw new Error(await errorMessage(res, '設定を取得できませんでした'));
        setConfig({ ...empty, ...(await res.json()) });
      })
      .catch((err) => toast.error(err.message || '読み込みエラー'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/v1/line/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(await errorMessage(res, '保存に失敗しました'));
      setConfig({ ...empty, ...(await res.json()) });
      toast.success('LINEボット設定を保存しました');
    } catch (err: any) {
      toast.error(err.message || '保存エラー');
    } finally {
      setSaving(false);
    }
  };

  const runPreview = async () => {
    try {
      const res = await apiFetch('/api/v1/line/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: previewText }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, 'プレビュー失敗'));
      const data = await res.json();
      const texts = (data.messages || []).map((m: { text?: string }) => m.text).filter(Boolean);
      setPreviewResult(texts.join('\n\n') || '(empty)');
    } catch (err: any) {
      toast.error(err.message || 'プレビューエラー');
    }
  };

  const updateKeyword = (index: number, patch: Partial<KeywordReply>) => {
    setConfig((prev) => {
      const next = [...prev.keywordReplies];
      next[index] = { ...next[index], ...patch };
      return { ...prev, keywordReplies: next };
    });
  };

  if (loading) return <div style={{ padding: 24 }}>Loading LINE bot…</div>;

  const webhookUrl = `${webhookBase.replace(/\/$/, '')}${config.webhookPath || '/api/v1/line/webhook'}`;

  return (
    <div style={{ maxWidth: 920 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: 10 }}>
            <MessageCircle size={22} color="#06C755" /> LINE チャットボット
          </h2>
          <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: '0.9rem', lineHeight: 1.5 }}>
            LINE公式アカウントの Messaging API と連携し、友だち追加・キーワード応答・店舗案内を自動化します。
          </p>
        </div>
        <button type="button" style={btnPrimary} onClick={save} disabled={saving}>
          <Save size={16} /> {saving ? '保存中…' : '設定を保存'}
        </button>
      </div>

      <section style={card}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem' }}>接続・公開</h3>
        <label style={{ ...label, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
          />
          ボットを有効にする（Webhook 応答）
        </label>
        <label style={{ ...label, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            checked={config.showFloatButton}
            onChange={(e) => setConfig({ ...config, showFloatButton: e.target.checked })}
          />
          サイトに LINE フローティングボタンを表示
        </label>
        <label style={label}>
          ボタン文言
          <input style={input} value={config.floatButtonLabelJa} onChange={(e) => setConfig({ ...config, floatButtonLabelJa: e.target.value })} />
        </label>
        <label style={label}>
          友だち追加 URL（https://line.me/… または https://lin.ee/…）
          <input style={input} value={config.addFriendUrl} onChange={(e) => setConfig({ ...config, addFriendUrl: e.target.value })} placeholder="https://lin.ee/xxxx" />
        </label>
        <label style={label}>
          LINE Basic ID（例: @adarsha）
          <input style={input} value={config.basicId} onChange={(e) => setConfig({ ...config, basicId: e.target.value })} placeholder="@your_bot" />
        </label>
        <label style={label}>
          サイト URL（メニュー・注文リンク用）
          <input style={input} value={config.siteUrl} onChange={(e) => setConfig({ ...config, siteUrl: e.target.value })} />
        </label>
      </section>

      <section style={card}>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>Messaging API 認証</h3>
        <p style={{ margin: '0 0 1rem', color: '#6b7280', fontSize: '0.82rem' }}>
          LINE Developers Console → Channel → Messaging API。シークレット／トークンは保存済みの場合マスク表示されます。変更時のみ新しい値を入力してください。
        </p>
        <label style={label}>
          Channel ID
          <input style={input} value={config.channelId} onChange={(e) => setConfig({ ...config, channelId: e.target.value })} autoComplete="off" />
        </label>
        <label style={label}>
          Channel secret {config.hasChannelSecret ? <span style={{ color: '#059669', fontWeight: 500 }}>（設定済み）</span> : null}
          <input
            style={input}
            type="password"
            value={config.channelSecret}
            onChange={(e) => setConfig({ ...config, channelSecret: e.target.value })}
            placeholder={config.hasChannelSecret ? '変更する場合のみ入力' : 'Channel secret'}
            autoComplete="new-password"
          />
        </label>
        <label style={label}>
          Channel access token {config.hasChannelAccessToken ? <span style={{ color: '#059669', fontWeight: 500 }}>（設定済み）</span> : null}
          <input
            style={input}
            type="password"
            value={config.channelAccessToken}
            onChange={(e) => setConfig({ ...config, channelAccessToken: e.target.value })}
            placeholder={config.hasChannelAccessToken ? '変更する場合のみ入力' : 'Long-lived channel access token'}
            autoComplete="new-password"
          />
        </label>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 14px', fontSize: '0.85rem' }}>
          <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Link2 size={15} /> Webhook URL（LINE Console に登録）
          </div>
          <code style={{ wordBreak: 'break-all', color: '#166534' }}>{webhookUrl}</code>
          <div style={{ marginTop: 8, color: '#4b5563' }}>Webhook を Use / オンにし、Verify で成功することを確認してください。</div>
        </div>
      </section>

      <section style={card}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem' }}>あいさつ・不明時メッセージ</h3>
        <label style={label}>
          友だち追加時（welcome）
          <textarea style={{ ...input, minHeight: 90, resize: 'vertical' }} value={config.welcomeMessageJa} onChange={(e) => setConfig({ ...config, welcomeMessageJa: e.target.value })} />
        </label>
        <label style={label}>
          キーワード不一致時（fallback）
          <textarea style={{ ...input, minHeight: 90, resize: 'vertical' }} value={config.fallbackMessageJa} onChange={(e) => setConfig({ ...config, fallbackMessageJa: e.target.value })} />
        </label>
      </section>

      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>クイックリプライボタン</h3>
          <button
            type="button"
            style={btnGhost}
            onClick={() =>
              setConfig({
                ...config,
                quickReplies: [...config.quickReplies, { label: '新しいボタン', text: 'こんにちは' }].slice(0, 13),
              })
            }
          >
            <Plus size={14} /> 追加
          </button>
        </div>
        {config.quickReplies.map((q, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr auto', gap: 8, marginBottom: 8 }}>
            <input style={input} value={q.label} placeholder="表示名" onChange={(e) => {
              const next = [...config.quickReplies];
              next[i] = { ...q, label: e.target.value };
              setConfig({ ...config, quickReplies: next });
            }} />
            <input style={input} value={q.text} placeholder="送信テキスト" onChange={(e) => {
              const next = [...config.quickReplies];
              next[i] = { ...q, text: e.target.value };
              setConfig({ ...config, quickReplies: next });
            }} />
            <button type="button" style={btnGhost} onClick={() => setConfig({ ...config, quickReplies: config.quickReplies.filter((_, j) => j !== i) })} aria-label="削除">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </section>

      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>キーワード応答</h3>
          <button
            type="button"
            style={btnGhost}
            onClick={() =>
              setConfig({
                ...config,
                keywordReplies: [
                  ...config.keywordReplies,
                  { id: `kw-${Date.now()}`, keywords: ['キーワード'], intent: 'text', replyJa: '返信文を入力' },
                ],
              })
            }
          >
            <Plus size={14} /> 追加
          </button>
        </div>
        {config.keywordReplies.map((rule, i) => (
          <div key={rule.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr auto', gap: 8 }}>
              <input
                style={input}
                value={rule.keywords.join(', ')}
                placeholder="キーワード（カンマ区切り）"
                onChange={(e) =>
                  updateKeyword(i, {
                    keywords: e.target.value.split(/[,、]/).map((s) => s.trim()).filter(Boolean),
                  })
                }
              />
              <select style={input} value={rule.intent} onChange={(e) => updateKeyword(i, { intent: e.target.value as Intent })}>
                {INTENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button type="button" style={btnGhost} onClick={() => setConfig({ ...config, keywordReplies: config.keywordReplies.filter((_, j) => j !== i) })}>
                <Trash2 size={14} />
              </button>
            </div>
            {rule.intent === 'text' && (
              <textarea
                style={{ ...input, minHeight: 70, marginTop: 8, resize: 'vertical' }}
                value={rule.replyJa}
                onChange={(e) => updateKeyword(i, { replyJa: e.target.value })}
                placeholder="定型返信文"
              />
            )}
          </div>
        ))}
      </section>

      <section style={card}>
        <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem' }}>応答プレビュー（LINE には送信しません）</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <input style={{ ...input, flex: 1, minWidth: 180, marginBottom: 0 }} value={previewText} onChange={(e) => setPreviewText(e.target.value)} />
          <button type="button" style={btnGhost} onClick={runPreview}><Eye size={14} /> プレビュー</button>
        </div>
        {previewResult && (
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, fontSize: '0.88rem', lineHeight: 1.55 }}>{previewResult}</pre>
        )}
      </section>
    </div>
  );
}
