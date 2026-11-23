import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { MessageCircle, MessageSquare } from 'lucide-react';
import type { TabIntent } from './TopBar';
import MessagesTab from './MessagesTab';
import LineBotTab from './LineBotTab';

export type InboxSection = 'messages' | 'line';

type Props = {
  intent?: TabIntent | null;
  unreadCount?: number;
  initialSection?: InboxSection;
};

function resolveSection(intent: TabIntent | null | undefined, fallback: InboxSection): InboxSection {
  if (intent?.section === 'messages' || intent?.section === 'line') return intent.section;
  return fallback;
}

/**
 * Single admin page for contact inbox + LINE bot settings.
 */
export default function MessagesAndLineBotTab({ intent, unreadCount = 0, initialSection = 'messages' }: Props) {
  const [section, setSection] = useState<InboxSection>(() => resolveSection(intent, initialSection));

  useEffect(() => {
    setSection(resolveSection(intent, initialSection));
  }, [intent, initialSection]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div
        role="tablist"
        aria-label="Messages and LINE bot"
        style={{
          display: 'inline-flex',
          flexWrap: 'wrap',
          gap: 6,
          padding: 4,
          background: '#f3f0eb',
          borderRadius: 12,
          border: '1px solid #e8e4df',
          alignSelf: 'flex-start',
        }}
      >
        <SectionTab
          active={section === 'messages'}
          icon={<MessageSquare size={16} />}
          label="Contact messages"
          badge={unreadCount > 0 ? unreadCount : undefined}
          onSelect={() => setSection('messages')}
        />
        <SectionTab
          active={section === 'line'}
          icon={<MessageCircle size={16} />}
          label="LINE Bot"
          onSelect={() => setSection('line')}
        />
      </div>

      <div role="tabpanel">
        {section === 'messages' ? <MessagesTab /> : <LineBotTab />}
      </div>
    </div>
  );
}

function SectionTab({
  active,
  icon,
  label,
  badge,
  onSelect,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  badge?: number;
  onSelect: () => void;
}) {
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '0.55rem 1rem',
    borderRadius: 9,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '0.86rem',
    background: active ? '#1f1612' : 'transparent',
    color: active ? '#fff' : '#4b443c',
    boxShadow: active ? '0 1px 2px rgba(15, 23, 42, 0.12)' : 'none',
  };
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onSelect} style={style}>
      {icon}
      {label}
      {typeof badge === 'number' && (
        <span
          style={{
            marginLeft: 2,
            backgroundColor: active ? 'rgba(255,255,255,0.2)' : '#6b7280',
            color: '#fff',
            borderRadius: 9999,
            padding: '1px 7px',
            fontSize: '0.7rem',
            fontWeight: 800,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
