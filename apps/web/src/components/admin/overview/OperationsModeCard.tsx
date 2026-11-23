import { useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  AlertTriangle,
  Bike,
  PauseCircle,
  PlayCircle,
  ShoppingBag,
  ShoppingCart,
  UtensilsCrossed,
  Wrench,
} from 'lucide-react';
import { apiFetch, errorMessage } from '../../../lib/api';

export type WorkingMode = 'OPEN' | 'BUSY' | 'CLOSED' | 'MAINTENANCE';

type Switches = {
  orderingEnabled: boolean;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  dineInEnabled: boolean;
};

type Props = {
  isAdmin: boolean;
  switches: Switches;
  pausedUntil: string | null;
  maintenanceMode: boolean;
  maintenanceMessageJa?: string;
  onChanged: () => void;
};

const MODES: {
  id: WorkingMode;
  label: string;
  hint: string;
  icon: typeof PlayCircle;
}[] = [
  { id: 'OPEN', label: 'Open', hint: 'Accepting orders', icon: PlayCircle },
  { id: 'BUSY', label: 'Busy', hint: 'Pause new orders', icon: PauseCircle },
  { id: 'CLOSED', label: 'Closed', hint: 'Hide order buttons', icon: AlertTriangle },
  { id: 'MAINTENANCE', label: 'Maintenance', hint: 'Show site banner', icon: Wrench },
];

function detectMode(sw: Switches, pausedUntil: string | null, maintenance: boolean): WorkingMode {
  if (maintenance) return 'MAINTENANCE';
  if (pausedUntil && new Date(pausedUntil) > new Date()) return 'BUSY';
  if (!sw.orderingEnabled) return 'CLOSED';
  return 'OPEN';
}

/**
 * Full-width working-mode strip for Overview — status, mode, pause, channels.
 */
export default function OperationsModeCard({
  isAdmin,
  switches,
  pausedUntil,
  maintenanceMode,
  maintenanceMessageJa,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState(false);
  const mode = detectMode(switches, pausedUntil, maintenanceMode);
  const activeMeta = MODES.find(m => m.id === mode)!;
  const pauseActive = Boolean(pausedUntil && new Date(pausedUntil) > new Date());
  const pauseLabel = pauseActive
    ? `Paused until ${new Date(pausedUntil!).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
    : null;

  const patchSettings = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      const res = await apiFetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        toast.error(await errorMessage(res, '設定を更新できませんでした'));
        return;
      }
      toast.success(ok);
      onChanged();
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setBusy(false);
    }
  };

  const pauseKitchen = async (minutes: number) => {
    setBusy(true);
    try {
      const res = await apiFetch('/api/v1/orders/kitchen/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }),
      });
      if (!res.ok) {
        toast.error(await errorMessage(res, '一時停止に失敗しました'));
        return;
      }
      toast.success(minutes > 0 ? `${minutes}分 注文を一時停止しました` : '一時停止を解除しました');
      onChanged();
    } catch {
      toast.error('通信エラーが発生しました');
    } finally {
      setBusy(false);
    }
  };

  const applyMode = async (next: WorkingMode) => {
    if (!isAdmin && (next === 'CLOSED' || next === 'MAINTENANCE' || next === 'OPEN')) {
      if (next === 'BUSY') {
        await pauseKitchen(30);
        return;
      }
      toast.error('このモード変更は管理者のみ可能です');
      return;
    }

    if (next === 'BUSY') {
      await pauseKitchen(30);
      if (isAdmin && maintenanceMode) {
        await patchSettings({ maintenanceMode: false }, 'メンテナンスを解除しました');
      }
      return;
    }

    if (next === 'OPEN') {
      await pauseKitchen(0);
      await patchSettings(
        {
          orderingEnabled: true,
          maintenanceMode: false,
          ...(switches.pickupEnabled || switches.deliveryEnabled || switches.dineInEnabled
            ? {}
            : { pickupEnabled: true }),
        },
        '受付を開始しました（Open）',
      );
      return;
    }

    if (next === 'CLOSED') {
      await pauseKitchen(0);
      await patchSettings(
        { orderingEnabled: false, maintenanceMode: false },
        '注文受付を停止しました（Closed）',
      );
      return;
    }

    await patchSettings(
      {
        maintenanceMode: true,
        maintenanceMessageJa:
          maintenanceMessageJa?.trim() ||
          'ただいまメンテナンス中です。しばらくしてから再度アクセスしてください。',
        maintenanceMessageEn: 'We are currently undergoing maintenance. Please check back soon.',
      },
      'メンテナンスモードを有効にしました',
    );
  };

  const toggleChannel = async (key: keyof Switches) => {
    if (!isAdmin) {
      toast.error('チャネル切替は管理者のみ可能です');
      return;
    }
    const next = !switches[key];
    const body: Record<string, unknown> = { [key]: next };
    if (key !== 'orderingEnabled' && next) {
      if (key === 'pickupEnabled') body.pickupHours = '11:30-15:00, 17:00-22:00';
      if (key === 'deliveryEnabled') body.deliveryHours = '11:30-15:00, 17:00-22:00';
      if (key === 'dineInEnabled') body.dineInHours = '11:00-15:00, 17:00-22:30';
    }
    const labels: Record<keyof Switches, string> = {
      orderingEnabled: 'Master',
      pickupEnabled: 'Pickup',
      deliveryEnabled: 'Delivery',
      dineInEnabled: 'Dine-in',
    };
    await patchSettings(body, `${labels[key]} → ${next ? 'ON' : 'OFF'}`);
  };

  const channels: { key: keyof Switches; label: string; icon: typeof ShoppingCart }[] = [
    { key: 'orderingEnabled', label: 'Master', icon: ShoppingCart },
    { key: 'pickupEnabled', label: 'Pickup', icon: ShoppingBag },
    { key: 'deliveryEnabled', label: 'Delivery', icon: Bike },
    { key: 'dineInEnabled', label: 'Dine-in', icon: UtensilsCrossed },
  ];

  return (
    <div className={`ov-card ov-ops ov-ops-${mode.toLowerCase()}`}>
      <div className="ov-ops-top">
        <div className="ov-ops-status">
          <span className={`ov-ops-dot ov-ops-dot-${mode.toLowerCase()}`} aria-hidden />
          <div>
            <div className="ov-ops-title">
              Working mode
              <span className={`ov-mode-pill ov-mode-${mode.toLowerCase()}`}>{mode}</span>
            </div>
            <p className="ov-muted ov-ops-hint">{activeMeta.hint}{pauseLabel ? ` · ${pauseLabel}` : ''}</p>
          </div>
        </div>

        <div className="ov-ops-segments" role="group" aria-label="Working mode">
          {MODES.map(m => {
            const Icon = m.icon;
            const locked = !isAdmin && (m.id === 'CLOSED' || m.id === 'MAINTENANCE');
            return (
              <button
                key={m.id}
                type="button"
                disabled={busy || locked}
                aria-pressed={mode === m.id}
                title={locked ? 'Admin only' : m.hint}
                className={`ov-ops-seg ov-ops-seg-${m.id.toLowerCase()}${mode === m.id ? ' is-active' : ''}`}
                onClick={() => applyMode(m.id)}
              >
                <Icon size={15} aria-hidden />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="ov-ops-bottom">
        <div className="ov-ops-pause">
          <span className="ov-ops-label">Kitchen pause</span>
          <div className="ov-pause-btns">
            {[15, 30, 60].map(m => (
              <button
                key={m}
                type="button"
                className="ov-btn ov-btn-sm"
                disabled={busy}
                onClick={() => pauseKitchen(m)}
              >
                {m} min
              </button>
            ))}
            <button
              type="button"
              className="ov-btn ov-btn-sm"
              disabled={busy || !pauseActive}
              onClick={() => pauseKitchen(0)}
            >
              Resume
            </button>
          </div>
        </div>

        <div className="ov-ops-channels" role="group" aria-label="Order channels">
          {channels.map(ch => {
            const Icon = ch.icon;
            const on = switches[ch.key];
            return (
              <button
                key={ch.key}
                type="button"
                className={`ov-channel${on ? ' is-on' : ''}`}
                disabled={busy || !isAdmin}
                onClick={() => toggleChannel(ch.key)}
                title={isAdmin ? `Toggle ${ch.label}` : 'Admin only'}
                aria-pressed={on}
              >
                <Icon size={14} aria-hidden />
                <span>{ch.label}</span>
                <span className="ov-channel-state">{on ? 'On' : 'Off'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
