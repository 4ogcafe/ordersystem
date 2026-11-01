import { useState } from 'react';
import { BellOff, BellRing, CheckCircle2, Share } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { enableReadyAlerts, pushState, type PushTarget } from '../../lib/push';

/** 「準備ができたら通知を受け取る」: turns on the phone notification for this order (or table, or member). */
export default function ReadyAlertButton({ target, compact = false }: { target: PushTarget; compact?: boolean }) {
  const [state, setState] = useState(() => pushState(target));
  const [busy, setBusy] = useState(false);

  if (state === 'unsupported') return null;

  if (state === 'needs-install') {
    return (
      <p className="ra ra-note">
        <Share size={16} aria-hidden="true" />
        iPhoneで通知を受け取るには、共有ボタンから「ホーム画面に追加」してこのページを開いてください。
      </p>
    );
  }
  if (state === 'enabled') {
    return (
      <p className="ra ra-on" role="status">
        <CheckCircle2 size={18} aria-hidden="true" /> 準備ができたら、この端末にお知らせします
      </p>
    );
  }
  if (state === 'denied') {
    return (
      <p className="ra ra-note">
        <BellOff size={16} aria-hidden="true" /> 通知がブロックされています。ブラウザの設定でこのサイトの通知を許可してください。
      </p>
    );
  }

  const enable = async () => {
    setBusy(true);
    try {
      const next = await enableReadyAlerts(target);
      setState(next);
      if (next === 'enabled') toast.success('準備ができたら通知でお知らせします。');
    } catch {
      toast.error('通知を設定できませんでした。もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={`ra ra-btn${compact ? ' is-compact' : ''}`} onClick={enable} disabled={busy}>
      <BellRing size={18} aria-hidden="true" />
      {busy ? '設定中…' : '準備ができたら通知を受け取る'}
    </button>
  );
}
