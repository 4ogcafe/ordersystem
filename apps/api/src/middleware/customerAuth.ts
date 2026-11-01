import type { Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { readCookie } from './auth.js';

// Customers get their own cookie, token audience and table, so a customer session can never
// reach staff routes (and a staff session is never mistaken for a customer).
export const CUSTOMER_COOKIE = 'adarsha_customer';
const CUSTOMER_AUDIENCE = 'customer';
const CUSTOMER_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface SessionCustomer {
  id: string;
  name: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      customer?: SessionCustomer;
    }
  }
}

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.isProduction,
  sameSite: 'strict' as const,
  path: '/',
});

export function issueCustomerSession(res: Response, customerId: string) {
  const token = jwt.sign({}, config.jwtSecret, {
    subject: customerId,
    audience: CUSTOMER_AUDIENCE,
    expiresIn: CUSTOMER_SESSION_TTL_SECONDS,
  });
  res.cookie(CUSTOMER_COOKIE, token, { ...cookieOptions(), maxAge: CUSTOMER_SESSION_TTL_SECONDS * 1000 });
}

export function clearCustomerSession(res: Response) {
  res.clearCookie(CUSTOMER_COOKIE, cookieOptions());
  res.clearCookie('kalpana_customer', cookieOptions());
}

function customerIdFromToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], audience: CUSTOMER_AUDIENCE });
    if (typeof payload === 'object' && typeof payload.sub === 'string' && payload.sub.length > 0) {
      return payload.sub;
    }
  } catch {
    // invalid or expired token
  }
  return null;
}

/** Loads the customer on every request so a disabled account is signed out immediately. */
async function loadCustomer(req: Request): Promise<SessionCustomer | null> {
  const token = readCookie(req, CUSTOMER_COOKIE) ?? readCookie(req, 'kalpana_customer');
  const id = token ? customerIdFromToken(token) : null;
  if (!id) return null;
  const customer = await prisma.customer.findFirst({
    where: { id, isActive: { not: false } },
    select: { id: true, name: true, email: true },
  });
  return customer ?? null;
}

/** Attaches req.customer when a valid session exists; guests continue without one. */
export const optionalCustomer: RequestHandler = async (req, _res, next) => {
  req.customer = (await loadCustomer(req)) ?? undefined;
  next();
};

export const requireCustomer: RequestHandler = async (req, _res, next) => {
  const customer = await loadCustomer(req);
  if (!customer) throw new AppError(401, 'UNAUTHENTICATED', 'ログインしてください');
  req.customer = customer;
  next();
};
