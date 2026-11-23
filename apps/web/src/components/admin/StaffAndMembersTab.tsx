import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { UserCircle, Users } from 'lucide-react';
import type { TabIntent } from './TopBar';
import StaffUsersTab from './StaffUsersTab';
import CustomersTab from './CustomersTab';

export type PeopleSection = 'staff' | 'members';

type Props = {
  currentUserId: string;
  intent?: TabIntent | null;
  /** Initial section when opened from the sidebar (default staff). */
  initialSection?: PeopleSection;
};

function resolveSection(intent: TabIntent | null | undefined, fallback: PeopleSection): PeopleSection {
  if (intent?.section === 'staff' || intent?.section === 'members') return intent.section;
  if (intent?.action === 'add-user') return 'staff';
  if (intent?.action === 'search') return 'members';
  return fallback;
}

/**
 * Single admin page for staff accounts and customer members.
 * Sub-tabs keep each manager intact; deep-links from search / Quick Add still work.
 */
export default function StaffAndMembersTab({ currentUserId, intent, initialSection = 'staff' }: Props) {
  const [section, setSection] = useState<PeopleSection>(() => resolveSection(intent, initialSection));

  useEffect(() => {
    setSection(resolveSection(intent, initialSection));
  }, [intent, initialSection]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div
        role="tablist"
        aria-label="Staff and members"
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
          active={section === 'staff'}
          icon={<Users size={16} />}
          label="Staff users"
          onSelect={() => setSection('staff')}
        />
        <SectionTab
          active={section === 'members'}
          icon={<UserCircle size={16} />}
          label="Members"
          onSelect={() => setSection('members')}
        />
      </div>

      <div role="tabpanel">
        {section === 'staff' ? (
          <StaffUsersTab currentUserId={currentUserId} intent={intent} />
        ) : (
          <CustomersTab intent={intent} />
        )}
      </div>
    </div>
  );
}

function SectionTab({
  active,
  icon,
  label,
  onSelect,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
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
    </button>
  );
}
