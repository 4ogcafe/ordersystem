import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { toast } from 'react-hot-toast';
import { Calendar, Camera, Clock, Gift, Search, Stamp, X, Zap } from 'lucide-react';
import jsQR from 'jsqr';
import { apiFetch, errorMessage } from '../../lib/api';
import { formatMemberCode, yen } from '../../lib/format';
import { getScannerConfig, saveScannerConfig } from '../../lib/scanner';
import type { StampCardData } from '../account/types';

interface MemberView {
  member: { id: string; name: string; nameKana: string };
  card: StampCardData;
}

interface SearchMatch {
  name: string;
  nameKana: string;
  email: string;
  phone: string;
  memberCode: string;
}

// Same rules as the API (lib/stamps.ts): "adarsha:k7mp-2qxa" → "K7MP2QXA".
const MEMBER_CODE = /^[2-9A-HJKMNP-Z]{8}$/;
const normalizeCode = (value: string) => value.trim().toUpperCase().replace(/^(ADARSHA|KALPNA|KALPANA):/, '').replace(/[\s-]/g, '');

const SCAN_INTERVAL_MS = 250;
// Frames are scaled down before decoding: fast enough on a tablet, still sharp enough for a phone screen.
const SCAN_WIDTH = 640;

const timeLabel = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Tokyo', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Staff scan a member's QR (or type the code) to give an in-store stamp and hand over rewards. */
export default function StampCounter({ focus, initialCode }: { focus?: number; initialCode?: string }) {
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<MemberView | null>(null);
  const [scanning, setScanning] = useState(false);
  const [matches, setMatches] = useState<SearchMatch[] | null>(null);
  const [showCustomTime, setShowCustomTime] = useState(false);
  const [customTime, setCustomTime] = useState('');
  const codeRef = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const [autoStamp, setAutoStamp] = useState<boolean>(() => {
    try {
      return getScannerConfig().autoStampOnScan ?? true;
    } catch {
      return true;
    }
  });
  const [cooldownHours, setCooldownHours] = useState<number>(6);
  const lastScannedRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });

  useEffect(() => {
    apiFetch('/api/v1/settings')
      .then(res => res.json())
      .then(data => {
        if (typeof data?.stampCooldownHours === 'number') {
          setCooldownHours(data.stampCooldownHours);
        }
      })
      .catch(console.error);
  }, []);

  const handleUpdateCooldownHours = async (newHours: number) => {
    const val = Math.max(0, Math.min(720, newHours));
    setCooldownHours(val);
    try {
      const res = await apiFetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stampCooldownHours: val }),
      });
      if (res.ok) {
        toast.success(`Stamp gap timer set to ${val} hours`);
      }
    } catch {
      toast.error('Failed to update timer');
    }
  };

  // Quick Add → "Give a stamp": bring the counter into view, ready for a scan or a typed code.
  useEffect(() => {
    if (!focus) return;
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    codeRef.current?.focus({ preventScroll: true });
  }, [focus]);

  /** Automatically awards stamp directly when member QR is scanned at the counter */
  const autoAwardStamp = async (memberCode: string) => {
    const normalized = normalizeCode(memberCode);
    const now = Date.now();
    if (lastScannedRef.current.code === normalized && now - lastScannedRef.current.time < 2000) {
      return; // Ignore duplicate scan within 2s
    }
    lastScannedRef.current = { code: normalized, time: now };

    setCode(formatMemberCode(normalized));
    setBusy(true);
    try {
      const res = await apiFetch(`/api/v1/stamps/member/${encodeURIComponent(normalized)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(Number(amount) || 0),
          bypassCooldown: false, // Respect the timer gap!
        }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        const { result } = body;
        setView({ member: body.member, card: body.card });
        setMatches(null);
        setAmount('');
        if (result.cardCompleted) {
          toast.success(`🎉 GOAL reached! Stamp ${result.perCard}/${result.perCard} completed the card for ${body.member.name}! Card auto-reset for card #${body.card.completedCards + 1}.`, { duration: 7000 });
        } else {
          toast.success(`⚡ Auto-stamped! Stamp ${result.position}/${result.perCard} given to ${body.member.name}.`, { duration: 5000, icon: '🎯' });
        }
        for (const reward of result.rewards) {
          toast.success(`🎁 Reward earned: ${reward.titleJa}`, { duration: 6000 });
        }
      } else if (body?.error?.code === 'TOO_SOON') {
        // Within timer gap (e.g. 6 hours gap has not elapsed)
        await openMember(normalized);
        const nextTime = body.error.details?.nextAt ? timeLabel(body.error.details.nextAt) : '';
        toast(`⚠️ Already stamped recently — next stamp available from ${nextTime} (${cooldownHours}h gap rule).`, {
          icon: '⏳',
          duration: 7000,
        });
      } else {
        await openMember(normalized);
        if (body?.error?.message) {
          toast.error(body.error.message);
        }
      }
    } catch {
      await openMember(normalized);
      toast.error('Network error.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initialCode) {
      const normalized = normalizeCode(initialCode);
      setCode(formatMemberCode(normalized));
      if (autoStamp) {
        autoAwardStamp(normalized);
      } else {
        lookUp(initialCode);
      }
    }
  }, [initialCode]);

  // Hardware Scanner (NETUM NT-EM61 / USB-HID / Web Serial) listener
  useEffect(() => {
    const onScanned = (e: CustomEvent<{ raw: string; memberCode: string }>) => {
      const { memberCode } = e.detail;
      if (memberCode) {
        const normalized = normalizeCode(memberCode);
        setCode(formatMemberCode(normalized));
        if (autoStamp) {
          autoAwardStamp(normalized);
        } else {
          lookUp(memberCode);
        }
      }
    };
    window.addEventListener('adarsha:member-scanned' as any, onScanned as any);
    window.addEventListener('kalpana:member-scanned' as any, onScanned as any);
    return () => {
      window.removeEventListener('adarsha:member-scanned' as any, onScanned as any);
      window.removeEventListener('kalpana:member-scanned' as any, onScanned as any);
    };
  }, [autoStamp, amount]);

  /** Opens a member's card by their code. Returns false if no member has that code. */
  const openMember = async (memberCode: string) => {
    const res = await apiFetch(`/api/v1/stamps/member/${encodeURIComponent(memberCode)}`);
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(await errorMessage(res, 'Could not open the member.'));
    setView(await res.json());
    setMatches(null);
    setAmount('');
    setShowCustomTime(false);
    setCustomTime('');
    setTimeout(() => amountRef.current?.focus(), 0);
    return true;
  };

  /** A scanned or typed member code opens the card; anything else searches by name, kana, phone or email. */
  const lookUp = async (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    setBusy(true);
    setView(null);
    try {
      const memberCode = normalizeCode(value);
      if (MEMBER_CODE.test(memberCode) && (await openMember(memberCode))) return;

      const res = await apiFetch(`/api/v1/stamps/search?q=${encodeURIComponent(value)}`);
      if (!res.ok) throw new Error(await errorMessage(res, 'Search failed.'));
      const found: SearchMatch[] = await res.json();
      if (found.length === 1) await openMember(found[0].memberCode);
      else {
        setMatches(found);
        if (found.length === 0) toast.error('No member found. Try the member code, phone number, email or name.');
      }
    } catch (err) {
      toast.error(err instanceof Error && err.message !== 'Failed to fetch' ? err.message : 'Network error.');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    lookUp(code);
  };

  const giveStamp = async (e?: FormEvent, bypassCooldown = false) => {
    e?.preventDefault();
    if (!view || busy) return;
    const shouldBypass = bypassCooldown || Boolean(view.card.nextStampAt);
    setBusy(true);
    try {
      const res = await apiFetch(`/api/v1/stamps/member/${view.card.memberCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(Number(amount) || 0),
          bypassCooldown: shouldBypass,
        }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        const { result } = body;
        if (result.cardCompleted) {
          toast.success(`🎉 GOAL reached! Stamp ${result.perCard}/${result.perCard} completed the card for ${body.member.name}! Card auto-reset for card #${body.card.completedCards + 1}.`, { duration: 7000 });
        } else {
          toast.success(`Stamp ${result.position}/${result.perCard} given to ${body.member.name}.${shouldBypass ? ' (Cooldown overridden)' : ''}`);
        }
        for (const reward of result.rewards) toast.success(`🎁 Reward earned: ${reward.titleJa}`, { duration: 6000 });
        if (body.card && body.member) {
          setView({ member: body.member, card: body.card });
        } else {
          await openMember(view.card.memberCode);
        }
        setAmount('');
      } else if (body?.error?.code === 'TOO_SOON') {
        const nextTime = body.error.details?.nextAt ? timeLabel(body.error.details.nextAt) : '';
        toast(`⚠️ Already stamped recently — next stamp available from ${nextTime} (${cooldownHours}h gap rule).`, { icon: '⏳', duration: 7000 });
      } else {
        toast.error(body?.error?.message ?? 'Could not give the stamp.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setBusy(false);
    }
  };

  const setCustomCooldown = async () => {
    if (!view || busy || !customTime) return;
    const date = new Date(customTime);
    if (isNaN(date.getTime())) {
      toast.error('Please enter a valid date and time.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(`/api/v1/stamps/member/${view.card.memberCode}/reset-cooldown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextAt: date.toISOString() }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        setView({ member: body.member, card: body.card });
        setShowCustomTime(false);
        toast.success(`Next stamp time updated for ${body.member.name}.`);
      } else {
        toast.error(body?.error?.message ?? 'Could not update stamp time.');
      }
    } catch {
      toast.error('Network error.');
    } finally {
      setBusy(false);
    }
  };

  const redeemReward = async (rewardId: string, title: string) => {
    if (!view || !window.confirm(`Hand over "${title}" to ${view.member.name} now? It can't be used again.`)) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/v1/stamps/rewards/${rewardId}/use`, { method: 'POST' });
      if (res.ok) {
        toast.success('Reward marked as used.');
        await lookUp(view.card.memberCode);
      } else toast.error(await errorMessage(res, 'Could not use the reward.'));
    } catch {
      toast.error('Network error.');
    } finally {
      setBusy(false);
    }
  };

  const card = view?.card;
  const minAmount = card?.rules.minAmount ?? 0;

  return (
    <section ref={sectionRef} style={panelStyle} aria-labelledby="stamp-counter-heading">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h3 id="stamp-counter-heading" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Stamp size={18} /> Stamp card at the counter
          </h3>
          <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.85rem' }}>
            Scan the member's QR (My page → スタンプカード → 店頭で提示), or type their member code, phone number, email or name. Online orders are stamped automatically.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <label
            style={{
              padding: '4px 10px',
              borderRadius: '9999px',
              background: autoStamp ? '#ecfdf5' : '#f3f4f6',
              color: autoStamp ? '#047857' : '#4b5563',
              fontSize: '0.75rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              border: autoStamp ? '1px solid #a7f3d0' : '1px solid #d1d5db',
              cursor: 'pointer',
            }}
            title="When ON: scanning QR automatically gives the stamp without requiring manual button clicks or cooldown override"
          >
            <input
              type="checkbox"
              checked={autoStamp}
              onChange={(e) => {
                const nextVal = e.target.checked;
                setAutoStamp(nextVal);
                const cfg = getScannerConfig();
                saveScannerConfig({ ...cfg, autoStampOnScan: nextVal });
              }}
              style={{ accentColor: '#10b981', cursor: 'pointer' }}
            />
            ⚡ Auto-Stamp on Scan (自動押印)
          </label>
          <div
            style={{
              padding: '4px 10px',
              borderRadius: '9999px',
              background: '#f8fafc',
              color: '#334155',
              fontSize: '0.75rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              border: '1px solid #cbd5e1',
            }}
            title="Timer gap required between stamps for the same member"
          >
            <Clock size={13} style={{ color: '#d97706' }} />
            <span>Gap timer:</span>
            <input
              type="number"
              min={0}
              max={72}
              value={cooldownHours}
              onChange={(e) => handleUpdateCooldownHours(Number(e.target.value))}
              style={{
                width: '38px',
                padding: '2px 4px',
                borderRadius: '4px',
                border: '1px solid #94a3b8',
                fontSize: '0.75rem',
                fontWeight: 700,
                textAlign: 'center',
                backgroundColor: '#fff',
              }}
            />
            <span>hrs</span>
          </div>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '9999px',
              background: '#ecfdf5',
              color: '#047857',
              fontSize: '0.75rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              border: '1px solid #a7f3d0',
            }}
            title="NETUM NT-EM61 または各種USBスキャナーからのQRコード読取に対応しています"
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
            NETUM Scanner Ready
          </span>
        </div>
      </div>

      <form onSubmit={submitCode} className="stamp-counter-form" style={{ marginTop: '0.75rem' }}>
        <input
          ref={codeRef}
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="Code (K7MP-2QXA), phone, email or name"
          aria-label="Member code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          style={inputStyle}
        />
        <button type="submit" disabled={busy || !code.trim()} style={{ ...buttonStyle, backgroundColor: '#000', color: '#fff', border: 'none' }}><Search size={16} /> {busy ? 'Finding…' : 'Find'}</button>
        <button type="button" onClick={() => setScanning(value => !value)} aria-pressed={scanning} style={buttonStyle}><Camera size={16} /> {scanning ? 'Stop camera' : 'Scan QR with camera'}</button>
      </form>

      {scanning && (
        <CameraScanner
          onClose={() => setScanning(false)}
          onCode={value => {
            setScanning(false);
            const normalized = normalizeCode(value);
            setCode(formatMemberCode(normalized));
            if (autoStamp) {
              autoAwardStamp(normalized);
            } else {
              lookUp(value);
            }
          }}
        />
      )}

      {matches && matches.length > 1 && (
        <div style={{ marginTop: '0.75rem' }}>
          <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.4rem' }}>{matches.length} members found — choose one:</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.4rem' }}>
            {matches.map(match => (
              <li key={match.memberCode}>
                <button type="button" disabled={busy} onClick={() => { setBusy(true); openMember(match.memberCode).catch(() => toast.error('Could not open the member.')).finally(() => setBusy(false)); }} style={{ ...buttonStyle, width: '100%', justifyContent: 'space-between', textAlign: 'left', fontWeight: 500 }}>
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    <strong>{match.name}</strong>{match.nameKana && ` (${match.nameKana})`}
                    <span style={{ display: 'block', color: '#6b7280', fontSize: '0.8rem' }}>{[match.phone, match.email].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span style={{ color: '#6b7280', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{formatMemberCode(match.memberCode)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {view && card && (
        <div className="stamp-counter-member">
          <div style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{view.member.name}</div>
                <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>{[view.member.nameKana, formatMemberCode(card.memberCode)].filter(Boolean).join(' · ')}</div>
              </div>
              <button type="button" onClick={() => { setView(null); setCode(''); }} aria-label="Clear member" style={{ ...buttonStyle, padding: '0.35rem' }}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', margin: '0.75rem 0' }} aria-label={`${card.stamps} of ${card.perCard} stamps`}>
              {Array.from({ length: card.perCard }, (_, i) => {
                const pos = i + 1;
                const isGoal = pos === card.perCard;
                const isStamped = i < card.stamps;
                return (
                  <span
                    key={i}
                    title={isGoal ? `Stamp ${pos} (GOAL)` : `Stamp ${pos}`}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      background: isStamped ? '#b3261e' : (isGoal ? '#fef3c7' : '#f3f4f6'),
                      color: isStamped ? '#fff' : (isGoal ? '#b45309' : '#9ca3af'),
                      outline: isGoal ? '2px solid #d97706' : (card.milestones.some(m => m.at === pos) ? '2px solid #d97706' : 'none'),
                    }}
                  >
                    {isStamped ? pos : (isGoal ? '🏁' : pos)}
                  </span>
                );
              })}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#374151' }}>
              {card.stamps}/{card.perCard} stamps (Goal: {card.perCard}) · {card.completedCards} full card{card.completedCards === 1 ? '' : 's'} · {card.totalStamps} total
            </div>
            {!card.enabled ? (
              <p style={{ color: '#b91c1c', fontSize: '0.85rem' }}>The stamp card is switched off (Stamps, Offers &amp; Points tab).</p>
            ) : (
              <>
                {card.nextStampAt && (
                  <div style={{ margin: '0.75rem 0', padding: '0.75rem', borderRadius: '8px', background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={16} style={{ flexShrink: 0, color: '#d97706' }} />
                        <span>
                          Already stamped recently — next stamp from <strong>{timeLabel(card.nextStampAt)}</strong> ({card.rules.cooldownHours}h gap rule).
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => giveStamp(undefined, true)}
                          title="Override cooldown and award stamp now"
                          style={{ ...buttonStyle, padding: '0.3rem 0.6rem', fontSize: '0.8rem', background: '#d97706', color: '#fff', border: 'none', fontWeight: 600 }}
                        >
                          <Zap size={14} /> Override cooldown &amp; give stamp
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setShowCustomTime((v) => !v)}
                          title="Manually adjust the next stamp time"
                          style={{ ...buttonStyle, padding: '0.3rem 0.6rem', fontSize: '0.8rem', background: '#fff', border: '1px solid #d97706', color: '#92400e' }}
                        >
                          <Calendar size={14} /> {showCustomTime ? 'Cancel' : 'Set custom time'}
                        </button>
                      </div>
                    </div>

                    {showCustomTime && (
                      <div style={{ marginTop: '0.65rem', paddingTop: '0.65rem', borderTop: '1px dashed #fcd34d', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          Next stamp from:
                          <input
                            type="datetime-local"
                            value={customTime}
                            onChange={(e) => setCustomTime(e.target.value)}
                            style={{ ...inputStyle, padding: '0.25rem 0.5rem', fontSize: '0.8rem', width: 'auto' }}
                          />
                        </label>
                        <button
                          type="button"
                          disabled={busy || !customTime}
                          onClick={setCustomCooldown}
                          style={{ ...buttonStyle, padding: '0.3rem 0.65rem', fontSize: '0.8rem', background: '#d97706', color: '#fff', border: 'none' }}
                        >
                          Save time
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <form onSubmit={(e) => giveStamp(e, Boolean(card.nextStampAt))} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 500, flex: '1 1 140px' }}>
                    Bill amount (¥, optional)
                    <input ref={amountRef} type="number" inputMode="numeric" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={minAmount > 0 ? String(minAmount) : "0"} style={inputStyle} />
                  </label>
                  <button
                    type="submit"
                    disabled={busy}
                    style={{
                      ...buttonStyle,
                      backgroundColor: card.nextStampAt ? '#d97706' : '#b3261e',
                      color: '#fff',
                      border: 'none',
                      fontWeight: 600,
                    }}
                  >
                    {card.nextStampAt ? <Zap size={16} /> : <Stamp size={16} />} {card.nextStampAt ? 'Override cooldown & give stamp' : 'Give stamp'}
                  </button>
                </form>
              </>
            )}
          </div>

          <div style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '10px' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}><Gift size={16} /> Rewards to use</div>
            {card.rewards.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: 0 }}>None right now.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
                {card.rewards.map(reward => (
                  <li key={reward.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: '8px', background: '#fffbeb' }}>
                    <span style={{ minWidth: 0 }}>
                      <strong style={{ display: 'block' }}>{reward.titleJa}</strong>
                      <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                        {reward.kind === 'AMOUNT_OFF' ? `Take ${yen(reward.amount)} off the bill` : 'Give with the order'}
                        {reward.expiresAt && ` · until ${new Date(reward.expiresAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Tokyo' })}`}
                      </span>
                    </span>
                    <button type="button" disabled={busy} onClick={() => redeemReward(reward.id, reward.titleJa)} style={{ ...buttonStyle, whiteSpace: 'nowrap' }}>Use now</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Live camera view that reports the first member QR it sees. Decodes in JavaScript, so it works in
 * every browser (Chrome, Edge, Safari, Firefox; Windows, Mac, iPad, Android).
 */
function CameraScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState(() =>
    !window.isSecureContext || !navigator.mediaDevices?.getUserMedia
      ? 'The camera only works on https:// or localhost. Open the admin with https (or on this computer), use a USB QR scanner, or type the code.'
      : '',
  );
  const [ready, setReady] = useState(false);
  // Kept in a ref so a new callback from the parent doesn't restart the camera.
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let done = false;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const scan = () => {
      const video = videoRef.current;
      if (!video || !context || video.readyState < 2 || !video.videoWidth) return;
      const scale = Math.min(1, SCAN_WIDTH / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
      if (found && MEMBER_CODE.test(normalizeCode(found.data)) && !done) {
        done = true;
        navigator.vibrate?.(80);
        onCodeRef.current(found.data);
      }
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(media => {
        stream = media;
        const video = videoRef.current;
        if (!video || done) {
          media.getTracks().forEach(track => track.stop());
          return;
        }
        video.srcObject = media;
        video.play().catch(() => undefined);
        setReady(true);
        timer = setInterval(scan, SCAN_INTERVAL_MS);
      })
      .catch((err: DOMException) =>
        setProblem(
          err?.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow the camera for this site (the camera icon in the address bar), then try again.'
            : err?.name === 'NotFoundError'
              ? 'No camera found on this device. Use a USB QR scanner or type the code.'
              : 'The camera could not be started (it may be in use by another app). Type the code instead.',
        ),
      );

    return () => {
      done = true;
      clearInterval(timer);
      stream?.getTracks().forEach(track => track.stop());
    };
  }, []);

  return (
    <div style={{ marginTop: '0.75rem', maxWidth: '360px' }}>
      {problem ? (
        <p role="alert" style={{ color: '#b91c1c', fontSize: '0.85rem', margin: 0 }}>{problem}</p>
      ) : (
        <div style={{ position: 'relative' }}>
          <video ref={videoRef} muted playsInline style={{ width: '100%', minHeight: '180px', borderRadius: '10px', background: '#000', display: 'block' }} aria-label="Camera preview for scanning the member QR" />
          {/* Aiming frame */}
          <span aria-hidden="true" style={{ position: 'absolute', inset: '18%', border: '3px solid rgba(255,255,255,0.85)', borderRadius: '12px', boxShadow: '0 0 0 9999px rgba(0,0,0,0.25)' }} />
          <span style={{ position: 'absolute', left: 0, right: 0, bottom: '8px', textAlign: 'center', color: '#fff', fontSize: '0.8rem', textShadow: '0 1px 2px #000' }}>
            {ready ? 'Hold the member\'s QR inside the frame' : 'Starting camera…'}
          </span>
        </div>
      )}
      <button type="button" onClick={onClose} style={{ ...buttonStyle, marginTop: '0.5rem' }}><X size={16} /> Stop camera</button>
    </div>
  );
}

const panelStyle: CSSProperties = { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', padding: '1.25rem' };
const inputStyle: CSSProperties = { padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '1rem', boxSizing: 'border-box', width: '100%' };
const buttonStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0.6rem 1rem', border: '1px solid #d1d5db', borderRadius: '8px', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' };
