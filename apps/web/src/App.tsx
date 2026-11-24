import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import Home from './pages/Home';
import { CartProvider } from './lib/cart';
import { CustomerProvider } from './lib/customer';
import CartDrawer from './components/order/CartDrawer';
import LineChatButton from './components/LineChatButton';
import MaintenanceBanner from './components/MaintenanceBanner';
import './index.css';

// Home is the usual landing page, so it ships in the main bundle; everything else loads on demand.
// The admin dashboard is its own chunk and is never downloaded by public visitors.
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const Menu = lazy(() => import('./pages/Menu'));
const Order = lazy(() => import('./pages/Order'));
const OrderStatus = lazy(() => import('./pages/OrderStatus'));
const Account = lazy(() => import('./pages/Account'));
const AccountAuth = lazy(() => import('./pages/AccountAuth'));
const Login = lazy(() => import('./pages/Login'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const Kitchen = lazy(() => import('./pages/Kitchen'));
const CashCounter = lazy(() => import('./pages/CashCounter'));
const NotFound = lazy(() => import('./pages/NotFound'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const RefundPolicy = lazy(() => import('./pages/RefundPolicy'));
const Careers = lazy(() => import('./pages/Careers'));
const Blog = lazy(() => import('./pages/Blog'));
const BlogPost = lazy(() => import('./pages/BlogPost'));

function AppContent() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);

  // Check if visitor has an active verified QR Dine-In session
  const isDineIn = (() => {
    try {
      const raw = sessionStorage.getItem('adarsha_qr_session');
      const session = raw ? JSON.parse(raw) : null;
      return Boolean(session?.valid && session?.sessionToken);
    } catch {
      return false;
    }
  })();

  const isQrUrl = location.pathname.startsWith('/qr') || searchParams.has('qr');
  // Only treat table-order surfaces as the QR app — leftover QR sessions must not strip Navbar/Footer from Home/About/Menu/etc.
  const isOrderSurface =
    location.pathname.startsWith('/order') ||
    location.pathname.startsWith('/table') ||
    location.pathname.startsWith('/dine-in') ||
    location.pathname.startsWith('/qr');
  const hasTableContext =
    Boolean(searchParams.get('table') || searchParams.get('store')) ||
    Boolean(location.pathname.match(/^\/(table|dine-in)\/[^/]+/));
  // QR / table-order surfaces only — never treat the whole order.adarsha.jp host as table-app
  // (that hid the menu chrome and broke browsing /menu/*).
  const isTableApp =
    isQrUrl ||
    (isOrderSurface && hasTableContext) ||
    (isDineIn && isOrderSurface);

  // Hide regular website Navbar, Footer, and CartDrawer for internal staff apps and active table QR diners
  const internalRoutes = ['/login', '/admin', '/kitchen', '/cash-counter', '/cashier'];
  const isInternal = internalRoutes.some(route => location.pathname === route || location.pathname.startsWith(route + '/'));
  const hideNavAndFooter = isInternal || isTableApp;

  return (
    <div className={hideNavAndFooter ? 'antialiased app-screen' : 'antialiased'} data-table-app={isTableApp ? '1' : undefined}>
      {!hideNavAndFooter && <MaintenanceBanner />}
      {!hideNavAndFooter && <Navbar />}
      <Suspense fallback={<div style={{ minHeight: '60vh' }} aria-busy="true" />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/menu/:type" element={<Menu />} />
          <Route path="/order" element={<Order />} />
          <Route path="/qr" element={<Order />} />
          <Route path="/qr/:qrCode" element={<Order />} />
          <Route path="/dine-in" element={<Order />} />
          <Route path="/dine-in/:tableNum" element={<Order />} />
          <Route path="/table" element={<Order />} />
          <Route path="/table/:tableNum" element={<Order />} />
          <Route path="/order/:token" element={<OrderStatus />} />
          <Route path="/account" element={<Account />} />
          <Route path="/account/login" element={<AccountAuth mode="login" />} />
          <Route path="/account/register" element={<AccountAuth mode="register" />} />
          <Route path="/account/verify" element={<AccountAuth mode="verify" />} />
          <Route path="/careers" element={<Careers />} />
          <Route path="/jobs" element={<Careers />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blogs" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/refund-policy" element={<RefundPolicy />} />
          <Route path="/refund" element={<RefundPolicy />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/kitchen" element={<Kitchen />} />
          <Route path="/cash-counter" element={<CashCounter />} />
          <Route path="/cashier" element={<CashCounter />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      {!hideNavAndFooter && <CartDrawer />}
      {!hideNavAndFooter && <LineChatButton />}
      {!hideNavAndFooter && <Footer />}
    </div>
  );
}

function App() {
  return (
    <Router>
      <ScrollToTop />
      {/* Top center, so toasts never cover the header cart icon on the right. */}
      <Toaster position="top-center" />
      <CustomerProvider>
        <CartProvider>
          <AppContent />
        </CartProvider>
      </CustomerProvider>
    </Router>
  );
}

export default App;
