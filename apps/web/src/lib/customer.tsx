import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiFetch } from './api';
import { CustomerContext, type Customer, type CustomerValue, type Loyalty } from './customer-context';
import { clearCustomerSession, onAuthEvent } from './auth-storage';

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null | undefined>(undefined);
  const [loyalty, setLoyalty] = useState<Loyalty | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch('/api/v1/customers/me');
      if (!res.ok) {
        setCustomer(null);
        return;
      }
      const data = await res.json();
      setCustomer(data.customer ?? null);
      setLoyalty(data.loyalty ?? null);
      if (data.token && typeof window !== 'undefined' && !sessionStorage.getItem('kalpana_customer_token')) {
        sessionStorage.setItem('kalpana_customer_token', data.token);
      }
    } catch {
      setCustomer(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen to cross-tab logout events
  useEffect(() => {
    return onAuthEvent((type) => {
      if (type === 'LOGOUT_CUSTOMER') {
        setCustomer(null);
        setLoyalty(null);
      } else if (type === 'LOGIN_CUSTOMER') {
        refresh();
      }
    });
  }, [refresh]);

  const signIn = useCallback((signedIn: Customer) => {
    setCustomer(signedIn);
    refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    clearCustomerSession();
    await apiFetch('/api/v1/customers/logout', { method: 'POST' }).catch(() => undefined);
    setCustomer(null);
    setLoyalty(null);
  }, []);

  const value = useMemo<CustomerValue>(() => ({ customer, loyalty, refresh, signIn, signOut }), [customer, loyalty, refresh, signIn, signOut]);
  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
}
