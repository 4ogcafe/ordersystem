import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCustomer } from '../lib/customer-context';
import { useCart } from '../lib/cart-context';
import { Menu, ShoppingBag, ShoppingCart, UserRound, X } from 'lucide-react';
import BrandMark from './BrandMark';
import ReservationModal from './ReservationModal';
import { useBodyScrollLock } from '../lib/useBodyScrollLock';

const NAV_LINKS = [
  { to: '/', label: 'ホーム' },
  { to: '/about', label: '私たちについて' },
  { to: '/menu/lunch', label: 'ランチメニュー' },
  { to: '/menu/takeout', label: 'テイクアウト' },
  { to: '/menu/grand', label: 'グランドメニュー' },
  { to: '/order', label: 'オンライン注文' },
  { to: '/contact', label: 'お問い合わせ' },
];

export default function Navbar() {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [popupStoreId, setPopupStoreId] = useState<string | undefined>(undefined);
  const location = useLocation();
  const { customer } = useCustomer();
  const cart = useCart();

  const handleOpen = (storeId?: string) => {
    setPopupStoreId(typeof storeId === 'string' ? storeId : undefined);
    setIsPopupOpen(true);
  };
  const handleClose = () => {
    setIsPopupOpen(false);
  };

  // Support global open reservation event from any page or store card
  useEffect(() => {
    const handleGlobalOpen = (e: any) => {
      const storeId = e.detail?.storeId;
      if (storeId) setPopupStoreId(storeId);
      setIsPopupOpen(true);
    };
    window.addEventListener('adarsha:open-reservation', handleGlobalOpen);
    return () => window.removeEventListener('adarsha:open-reservation', handleGlobalOpen);
  }, []);

  // Small screens: the links live in a menu opened from the ☰ button.
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [location.pathname]);
  useBodyScrollLock(menuOpen);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <>
      <nav className="navbar">
        <div className="nav-inner">
          <Link className="nav-logo" to="/" aria-label="アダルサ ホーム">
            <BrandMark alt="Adarsha" size={40} className="nav-brand-mark" />
            <div>
              <div className="nav-logo-text">アダルサ<span>.</span></div>
              <span className="nav-logo-sub">本格インド料理店</span>
            </div>
          </Link>

          <ul className="nav-links">
            {NAV_LINKS.map(link => (
              <li key={link.to}><Link to={link.to} className={isActive(link.to) ? 'active' : ''}>{link.label}</Link></li>
            ))}
          </ul>

          <div className="nav-actions">
            <Link to={customer ? '/account' : '/account/login'} className="nav-account" aria-label={customer ? 'マイページ' : 'ログイン・会員登録'}>
              <UserRound size={22} aria-hidden="true" />
              <span className="nav-account-label">{customer ? 'マイページ' : 'ログイン'}</span>
            </Link>
            <button type="button" onClick={cart.openCart} aria-label={`カートを開く（${cart.count}点）`} className="nav-icon-btn">
              <ShoppingCart size={24} aria-hidden="true" />
              {cart.count > 0 && <span aria-hidden="true" className="nav-cart-badge">{cart.count}</span>}
            </button>
            <button className="nav-cta" onClick={() => handleOpen()}>席を予約する</button>
            <button
              type="button"
              className="nav-icon-btn nav-menu-toggle"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? 'メニューを閉じる' : 'メニューを開く'}
              onClick={() => setMenuOpen(open => !open)}
            >
              {menuOpen ? <X size={26} aria-hidden="true" /> : <Menu size={26} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <>
            <div className="nav-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />
            <div id="mobile-menu" className="nav-mobile">
              <div className="nav-mobile-head">
                <BrandMark alt="" size={36} aria-hidden="true" />
                <div>
                  <div className="nav-mobile-head-title">アダルサ</div>
                  <div className="nav-mobile-head-sub">メニューを選んでお進みください</div>
                </div>
              </div>
              <ul>
                {NAV_LINKS.map(link => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className={isActive(link.to) ? 'active' : ''}
                      aria-current={isActive(link.to) ? 'page' : undefined}
                    >
                      {link.label}
                      {link.to === '/order' && <ShoppingBag size={16} aria-hidden="true" />}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="nav-mobile-actions">
                <Link to={customer ? '/account' : '/account/login'} className="order-btn order-btn-outline order-btn-lg no-underline">
                  <UserRound size={18} aria-hidden="true" />{customer ? 'マイページ' : 'ログイン・会員登録'}
                </Link>
                <button type="button" className="order-btn order-btn-solid order-btn-lg" onClick={() => { setMenuOpen(false); handleOpen(); }}>席を予約する</button>
              </div>
            </div>
          </>
        )}
      </nav>

      {/* Multi-Store Reservation Modal */}
      <ReservationModal
        isOpen={isPopupOpen}
        onClose={handleClose}
        defaultStoreId={popupStoreId}
      />
    </>
  );
}
