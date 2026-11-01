import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { apiFetch, errorMessage } from '../lib/api';
import OrdersTab from '../components/admin/OrdersTab';
import CashCounterTab from '../components/admin/CashCounterTab';
import './admin.css';
import OffersTab from '../components/admin/OffersTab';
import CustomersTab from '../components/admin/CustomersTab';
import StaffUsersTab from '../components/admin/StaffUsersTab';
import OverviewTab from '../components/admin/overview/OverviewTab';
import { GlobalSearch, NotificationBell, OrderingStatusToggle, QuickAdd, type Navigate, type TabIntent } from '../components/admin/TopBar';
import MenuManagementTab from '../components/admin/MenuManagementTab';
import PageSettingsTabComponent from '../components/admin/PageSettingsTab';
import PrinterSettings from '../components/admin/PrinterSettings';
import ScannerSettings from '../components/admin/ScannerSettings';
import MessagesTab from '../components/admin/MessagesTab';
import CareersTab from '../components/admin/CareersTab';
import BlogPostsTab from '../components/admin/BlogPostsTab';
import StoreLocationsManager from '../components/admin/StoreLocationsManager';
import { initScannerListener, getScannerConfig, type ScanEventDetail } from '../lib/scanner';
import { 
  LayoutDashboard, 
  Settings, 
  Menu as MenuIcon, 
  Image as ImageIcon, 
  ShoppingBag,
  Banknote,
  Gift,
  UserCircle,
  MessageSquare, 
  Users, 
  LogOut,
  ChefHat,
  Briefcase,
  BookOpen,
  MapPin,
  X
} from 'lucide-react';

// STAFF may edit menu items & operate the cash counter; everything else is admin-only.
const STAFF_TABS = ['Overview', 'Orders', 'Cash Counter', 'Menu Management'];
const STATS_POLL_MS = 30_000;

/** A short beep for new orders; browsers only allow it after the user has clicked on the page. */
function playOrderChime() {
  try {
    const audio = new AudioContext();
    const tone = audio.createOscillator();
    tone.frequency.value = 880;
    tone.connect(audio.destination);
    tone.start();
    tone.stop(audio.currentTime + 0.3);
    tone.onended = () => audio.close();
  } catch {
    // No audio available; the toast still shows.
  }
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Overview');
  // Phones and tablets: the sidebar slides in from the ☰ button.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [newOrdersCount, setNewOrdersCount] = useState(0);
  const lastNewOrders = useRef<number | null>(null);

  useEffect(() => {
    // The session lives in an httpOnly cookie; ask the API who is logged in.
    apiFetch('/api/v1/auth/me')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('Not logged in'))))
      .then(data => {
        // Kitchen accounts have no admin access; their screen is the kitchen display.
        if (data.user?.role === 'KITCHEN') navigate('/kitchen', { replace: true });
        else setUser(data.user);
      })
      .catch(() => navigate('/login'));

    // Poll for unread messages and new pickup orders; announce orders that arrived since the last check.
    const loadStats = () =>
      apiFetch('/api/v1/dashboard/stats')
        .then(res => res.json())
        .then(data => {
          if (data?.unreadMessagesCount !== undefined) setUnreadCount(data.unreadMessagesCount);
          if (typeof data?.newOrdersCount === 'number') {
            if (lastNewOrders.current !== null && data.newOrdersCount > lastNewOrders.current) {
              toast.success('New pickup order received!', { duration: 8000 });
              playOrderChime();
            }
            lastNewOrders.current = data.newOrdersCount;
            setNewOrdersCount(data.newOrdersCount);
          }
        })
        .catch(console.error);

    loadStats();
    const intervalId = setInterval(loadStats, STATS_POLL_MS);
    return () => clearInterval(intervalId);
  }, [navigate]);

  // Global Hardware QR Scanner Listener (NETUM NT-EM61 Recessed USB/TTL Scanner)
  useEffect(() => {
    const cleanupScanner = initScannerListener();

    const handleScannedMember = (e: CustomEvent<ScanEventDetail>) => {
      const cfg = getScannerConfig();
      const memberCode = e.detail?.memberCode;
      if (!memberCode) return;

      // Automatically jump to Stamp Counter if configured
      if (cfg.autoOpenStampCounter) {
        setActiveTab('Stamps, Offers & Points');
        setSidebarOpen(false);
        setIntent(prev => ({ action: 'stamp', value: memberCode, nonce: (prev?.nonce ?? 0) + 1 }));
      }
    };

    window.addEventListener('adarsha:member-scanned' as any, handleScannedMember as EventListener);
    window.addEventListener('kalpana:member-scanned' as any, handleScannedMember as EventListener);

    return () => {
      cleanupScanner();
      window.removeEventListener('adarsha:member-scanned' as any, handleScannedMember as EventListener);
      window.removeEventListener('kalpana:member-scanned' as any, handleScannedMember as EventListener);
    };
  }, []);

  // Top-bar search, notifications and Quick Add open a tab, optionally asking it to do something.
  const [intent, setIntent] = useState<TabIntent | null>(null);
  const navigateTo: Navigate = (tab, next) => {
    setActiveTab(tab);
    setSidebarOpen(false);
    setIntent(prev => (next ? { ...next, nonce: (prev?.nonce ?? 0) + 1 } : null));
  };

  const handleLogout = async () => {
    localStorage.removeItem('kalpana_session_token');
    localStorage.removeItem('kalpana_session_user');
    await apiFetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.assign('/login');
  };

  const tabs = [
    { name: 'Overview', icon: LayoutDashboard },
    { name: 'Orders', icon: ShoppingBag },
    { name: 'Menu Management', icon: MenuIcon },
    { name: 'Stamps, Offers & Points', icon: Gift },
    { name: 'Restaurant Settings', icon: Settings },
    { name: 'Store Locations', icon: MapPin },
    { name: 'Page Settings', icon: ImageIcon },
    { name: 'Contact Messages', icon: MessageSquare },
    { name: 'Staff Users', icon: Users },
    { name: 'Members', icon: UserCircle },
    { name: 'Blog Posts', icon: BookOpen },
    { name: 'Careers', icon: Briefcase },
  ].filter(tab => user?.role === 'ADMIN' || STAFF_TABS.includes(tab.name));

  if (!user) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading…</div>;
  }

  return (
    <div className="adm-root" style={{ display: 'flex', height: '100vh', backgroundColor: '#f3f4f6', fontFamily: "'Inter', sans-serif" }}>
      {sidebarOpen && <div className="adm-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}
      <title>Admin | Adarsha</title>
      <meta name="robots" content="noindex, nofollow" />
      
      {/* Sidebar */}
      <div id="admin-sidebar" className={`adm-sidebar${sidebarOpen ? ' is-open' : ''}`} style={{ 
        width: '280px', 
        backgroundColor: '#ffffff', 
        borderRight: '1px solid #e5e7eb',
        display: 'flex', 
        flexDirection: 'column',
        boxShadow: '4px 0 24px rgba(0,0,0,0.02)'
      }}>
        <div style={{ padding: '2rem 1.5rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/adarsha-log.webp" alt="Adarsha" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '50%' }} />
          </div>
          <span style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111827', letterSpacing: '-0.5px' }}>Adarsha Admin</span>
          <button type="button" className="adm-close-btn" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X size={22} aria-hidden="true" />
          </button>
        </div>

        <nav style={{ flex: 1, padding: '0 1rem', marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', paddingLeft: '0.5rem' }}>Management</div>
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.name;
            return (
              <div 
                key={tab.name} 
                role="button"
                tabIndex={0}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => navigateTo(tab.name)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigateTo(tab.name); } }}
                style={{ 
                  padding: '0.875rem 1rem', 
                  cursor: 'pointer',
                  backgroundColor: isActive ? '#f3f4f6' : 'transparent',
                  color: isActive ? '#000' : '#4b5563',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontWeight: isActive ? '600' : '500',
                  transition: 'all 0.2s ease'
                }}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} style={{ color: isActive ? '#000' : '#9ca3af' }} />
                {tab.name}
                {tab.name === 'Contact Messages' && unreadCount > 0 && (
                  <span style={{ marginLeft: 'auto', backgroundColor: '#6b7280', color: '#fff', borderRadius: '9999px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }} aria-label={`${unreadCount} unread`}>
                    {unreadCount}
                  </span>
                )}
                {tab.name === 'Orders' && newOrdersCount > 0 && (
                  <span style={{ marginLeft: 'auto', backgroundColor: '#ef4444', color: '#fff', borderRadius: '9999px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }}>
                    {newOrdersCount}
                  </span>
                )}
              </div>
            );
          })}
          <a
            href="/cash-counter"
            target="_blank"
            rel="noopener"
            style={{ marginTop: '8px', padding: '0.875rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 600, color: '#111827', textDecoration: 'none', border: '1px dashed #16a34a', backgroundColor: '#f0fdf4' }}
          >
            <Banknote size={20} style={{ color: '#16a34a' }} aria-hidden="true" />
            Cash counter ↗
          </a>
          <a
            href="/kitchen"
            target="_blank"
            rel="noopener"
            style={{ marginTop: '4px', padding: '0.875rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 600, color: '#111827', textDecoration: 'none', border: '1px dashed #d1d5db' }}
          >
            <ChefHat size={20} style={{ color: '#d97706' }} aria-hidden="true" />
            Kitchen display ↗
          </a>
        </nav>

        <div style={{ padding: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#4b5563' }}>
              {user?.name?.charAt(0) || 'A'}
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>{user?.name || 'Admin'}</div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{user?.email || 'admin@example.com'}</div>
            </div>
          </div>
          <button 
            onClick={handleLogout} 
            style={{ 
              width: '100%', padding: '0.75rem', backgroundColor: '#fff', color: '#ef4444', 
              border: '1px solid #fca5a5', borderRadius: '8px', cursor: 'pointer', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              fontWeight: '500', transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fff'}
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="adm-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* Topbar */}
        <div className="adm-topbar" style={{ height: '72px', backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0 2rem' }}>
          <button type="button" className="adm-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu" aria-expanded={sidebarOpen} aria-controls="admin-sidebar">
            <MenuIcon size={24} aria-hidden="true" />
          </button>
          <GlobalSearch isAdmin={user.role === 'ADMIN'} onNavigate={navigateTo} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <OrderingStatusToggle />
            <NotificationBell onNavigate={navigateTo} />
            <QuickAdd isAdmin={user.role === 'ADMIN'} onNavigate={navigateTo} />
          </div>
        </div>

        {/* Dynamic Content */}
        <div className="adm-content" style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
            <div>
              <h1 className="adm-title" style={{ fontSize: '2rem', fontWeight: '700', color: '#111827', margin: '0 0 0.5rem 0', letterSpacing: '-0.5px' }}>{activeTab}</h1>
              <p style={{ color: '#6b7280', margin: 0 }}>
                {activeTab === 'Overview'
                  ? user.role === 'ADMIN'
                    ? "What's happening now, and how the restaurant is doing."
                    : "What's happening in the restaurant right now."
                  : activeTab === 'Cash Counter'
                    ? "POS cash register, table bill settlements, quick walk-in sales, and cash drawer balancing."
                    : `Manage your restaurant's ${activeTab.toLowerCase()} data and settings.`}
              </p>
            </div>
          </div>

          {activeTab === 'Overview' && <OverviewTab isAdmin={user.role === 'ADMIN'} onNavigate={tab => navigateTo(tab)} />}
          {activeTab === 'Orders' && <OrdersTab isAdmin={user.role === 'ADMIN'} intent={intent} />}
          {activeTab === 'Cash Counter' && <CashCounterTab user={user} />}
          {activeTab === 'Menu Management' && <MenuManagementTab intent={intent} />}
          {activeTab === 'Stamps, Offers & Points' && <OffersTab intent={intent} />}
          {activeTab === 'Restaurant Settings' && <SettingsTab />}
          {activeTab === 'Store Locations' && <StoreLocationsManager />}
          {activeTab === 'Page Settings' && <PageSettingsTabComponent onOpenRestaurantSettings={() => navigateTo('Restaurant Settings')} />}
          {activeTab === 'Contact Messages' && <MessagesTab />}
          {activeTab === 'Staff Users' && <StaffUsersTab currentUserId={user.id} intent={intent} />}
          {activeTab === 'Members' && <CustomersTab intent={intent} />}
          {activeTab === 'Blog Posts' && <BlogPostsTab />}
          {activeTab === 'Careers' && <CareersTab />}

        </div>
      </div>
    </div>
  );
}

// --- SUB-COMPONENTS FOR EACH TAB ---

function SettingsTab() {
  const [settings, setSettings] = useState<any>({
    name: '',
    email: '',
    phone: '',
    addressEn: '',
    addressJa: '',
    mapUrl: '',
    weeklyHours: { monday: '' },
    holidays: { regular: '' },
    socials: { instagram: '', facebook: '', x: '', youtube: '' }
  });

  useEffect(() => {
    apiFetch('/api/v1/settings')
      .then(res => res.json())
      .then(data => {
        if (data && (data._id || data.id)) {
          setSettings({
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            addressEn: data.addressEn || '',
            addressJa: data.addressJa || '',
            mapUrl: data.mapUrl || '',
            aboutEn: data.aboutEn || '',
            aboutJa: data.aboutJa || '',
            aboutStoryLabelJa: data.aboutStoryLabelJa || '',
            aboutStoryTitleJa: data.aboutStoryTitleJa || '',
            aboutStoryJa: data.aboutStoryJa || '',
            aboutSpiceLabelJa: data.aboutSpiceLabelJa || '',
            aboutSpiceTitleJa: data.aboutSpiceTitleJa || '',
            aboutSpiceDescJa: data.aboutSpiceDescJa || '',
            aboutSpiceImage: data.aboutSpiceImage || '',
            aboutChefLabelJa: data.aboutChefLabelJa || '',
            aboutChefTitleJa: data.aboutChefTitleJa || '',
            aboutChefDescJa: data.aboutChefDescJa || '',
            aboutChefImage: data.aboutChefImage || '',
            aboutHeroImage: data.aboutHeroImage || '',
            contactHeroImage: data.contactHeroImage || '',
            menuGrandHeroImage: data.menuGrandHeroImage || '',
            menuLunchHeroImage: data.menuLunchHeroImage || '',
            menuTakeoutHeroImage: data.menuTakeoutHeroImage || '',
            welcomeTitleEn: data.welcomeTitleEn || '',
            welcomeTitleJa: data.welcomeTitleJa || '',
            welcomeTextJa: data.welcomeTextJa || '',
            weeklyHours: data.weeklyHours || { monday: '' },
            holidays: data.holidays || { regular: '' },
            socials: {
              instagram: data.socials?.instagram || '',
              facebook: data.socials?.facebook || '',
              x: data.socials?.x || '',
              youtube: data.socials?.youtube || ''
            }
          });
        }
      })
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    try {
      const res = await apiFetch('/api/v1/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        toast.success('Settings saved successfully!');
      } else {
        toast.error(await errorMessage(res, 'Failed to save settings.'));
      }
    } catch (err) {
      toast.error('Network error while saving settings.');
    }
  };

  const handleChange = (e: any) => {
    const { name, value } = e.target;
    
    let processedValue = value;
    // Auto-extract src from iframe if user pasted the full embed code
    if (name === 'mapUrl' && value.includes('<iframe')) {
      const match = value.match(/src="([^"]+)"/);
      if (match) {
        processedValue = match[1];
      }
    }

    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setSettings((prev: any) => ({
        ...prev,
        [parent]: {
          ...(prev as any)[parent],
          [child]: processedValue
        }
      }));
    } else {
      setSettings((prev: any) => ({ ...prev, [name]: processedValue }));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>General Information</h3>
          <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>Update your restaurant's core details and location.</p>
        </div>
        <div style={{ padding: '2rem' }}>
          <form style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Restaurant Name</label>
              <input name="name" type="text" value={settings.name} onChange={handleChange} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Email Address</label>
              <input name="email" type="email" value={settings.email} onChange={handleChange} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Phone Number</label>
              <input name="phone" type="text" value={settings.phone} onChange={handleChange} style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Address (EN)</label>
              <input name="addressEn" type="text" value={settings.addressEn} onChange={handleChange} style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Address (JA)</label>
              <input name="addressJa" type="text" value={settings.addressJa} onChange={handleChange} style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Google Maps Embed URL</label>
              <input name="mapUrl" type="text" placeholder="https://www.google.com/maps/embed?..." value={settings.mapUrl} onChange={handleChange} style={inputStyle} />
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
                On Google Maps, click "Share" -&gt; "Embed a map" -&gt; "Copy HTML". Paste it here, and the URL will automatically be extracted! (Do not use standard Google Maps links).
              </p>
            </div>
            <div style={{ gridColumn: '1 / -1', margin: '1rem 0 -0.5rem 0' }}>
              <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600', color: '#111827' }}>Business Details</h4>
              <div style={{ borderBottom: '1px solid #e5e7eb', marginTop: '0.5rem' }}></div>
            </div>
            <div>
              <label style={labelStyle}>Weekly Hours</label>
              <input name="weeklyHours.monday" type="text" placeholder="e.g. ランチ 11:30–15:00 / ディナー 17:00–22:00" value={settings.weeklyHours.monday} onChange={handleChange} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Regular Holiday</label>
              <input name="holidays.regular" type="text" placeholder="e.g. 火曜日 (Tuesday)" value={settings.holidays.regular} onChange={handleChange} style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1', margin: '1rem 0 -0.5rem 0' }}>
              <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600', color: '#111827' }}>Social Media Links</h4>
              <div style={{ borderBottom: '1px solid #e5e7eb', marginTop: '0.5rem' }}></div>
            </div>
            <div>
              <label style={labelStyle}>Instagram URL</label>
              <input name="socials.instagram" type="text" placeholder="https://instagram.com/..." value={settings.socials.instagram} onChange={handleChange} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Facebook URL</label>
              <input name="socials.facebook" type="text" placeholder="https://facebook.com/..." value={settings.socials.facebook} onChange={handleChange} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>X (Twitter) URL</label>
              <input name="socials.x" type="text" placeholder="https://x.com/..." value={settings.socials.x} onChange={handleChange} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>YouTube URL</label>
              <input name="socials.youtube" type="text" placeholder="https://youtube.com/..." value={settings.socials.youtube} onChange={handleChange} style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1', marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                onClick={handleSave}
                style={{ padding: '0.75rem 1.5rem', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '500', cursor: 'pointer' }}
              >
                Save Settings
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* NETUM NT-EM61 / Hardware QR Scanner Settings */}
      <ScannerSettings />

      {/* Printer & Receipt Settings */}
      <PrinterSettings storeName={settings.name} phone={settings.phone} addressJa={settings.addressJa} />

      {/* Store Locations & Branches Management */}
      <StoreLocationsManager />
    </div>
  );
}



// --- SHARED UI COMPONENTS ---

const labelStyle = { display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' };
const inputStyle = { width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', outline: 'none', transition: 'border-color 0.2s', backgroundColor: '#f9fafb' };

