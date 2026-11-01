import { createContext, useContext } from 'react';

export interface CustomerAddress {
  postalCode: string;
  prefecture: string;
  city: string;
  line1: string;
  building: string;
}

export interface CustomerPreferences {
  allergens: string[];
  otherAllergies: string;
  diets: string[];
  spiceLevel: number | null;
  note: string;
}

export interface Customer {
  id: string;
  name: string;
  nameKana: string;
  email: string;
  phone: string;
  /** YYYY-MM-DD, or '' when not given. */
  birthDate: string;
  address: CustomerAddress;
  preferences: CustomerPreferences;
  newsletterOptIn: boolean;
  points: number;
  createdAt: string;
}

export interface Loyalty {
  enabled: boolean;
  pointsPer100Yen: number;
  pointValueYen: number;
}

export interface CustomerValue {
  /** undefined while the session is being checked, null when signed out. */
  customer: Customer | null | undefined;
  loyalty: Loyalty | null;
  refresh: () => Promise<void>;
  signIn: (customer: Customer) => void;
  signOut: () => Promise<void>;
}

export const CustomerContext = createContext<CustomerValue | null>(null);

export function useCustomer(): CustomerValue {
  const value = useContext(CustomerContext);
  if (!value) throw new Error('useCustomer must be used inside CustomerProvider');
  return value;
}
