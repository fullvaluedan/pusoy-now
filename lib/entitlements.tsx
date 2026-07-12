// Entitlements surface for the whole app: <EntitlementProvider> plus
// useEntitlements().
//
// R6-R9 monetization plumbing, DARK-LAUNCHED: this provider exposes whether
// the signed-in player is premium plus the free-game config, but nothing in
// the app enforces it yet (config.enforced is false, see lib/entitlementRules
// for the gate itself). The entitlement lives on the account, so this
// provider depends on auth and reads the Worker only once a session exists;
// it degrades quietly like lib/auth.tsx: signed out, or on any fetch hiccup,
// the player is simply free (not premium), never an error.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { apiUrl, authClient } from './authClient';
import { useAuth } from './auth';
import {
  canStartGame,
  shouldShowAds,
  DEFAULT_ENTITLEMENT_CONFIG,
  type EntitlementConfig,
} from './entitlementRules';

export { canStartGame, shouldShowAds, DEFAULT_ENTITLEMENT_CONFIG };
export type { EntitlementConfig };

interface EntitlementResponse {
  premium: boolean;
  premiumUntil: number | null;
}

interface EntitlementValue {
  premium: boolean;
  premiumUntil: number | null;
  config: EntitlementConfig;
  // True until the Worker's entitlement read (if any) settles.
  loading: boolean;
  // Re-read the entitlement, e.g. right after a checkout redirect returns.
  refresh(): Promise<void>;
}

const EntitlementContext = createContext<EntitlementValue | null>(null);

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const [premium, setPremium] = useState(false);
  const [premiumUntil, setPremiumUntil] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) {
      // Signed out: free, and there is nothing to read.
      setPremium(false);
      setPremiumUntil(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await authClient.$fetch<EntitlementResponse>(apiUrl('/api/entitlement'));
      // 401 (not signed in) and any other error both mean "treat as free".
      if (error || !data) {
        setPremium(false);
        setPremiumUntil(null);
      } else {
        setPremium(Boolean(data.premium));
        setPremiumUntil(data.premiumUntil ?? null);
      }
    } catch {
      setPremium(false);
      setPremiumUntil(null);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
    // refresh already depends on `session`; re-running on authLoading settling
    // is what triggers the first real read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session]);

  const value = useMemo<EntitlementValue>(
    () => ({ premium, premiumUntil, config: DEFAULT_ENTITLEMENT_CONFIG, loading, refresh }),
    [premium, premiumUntil, loading, refresh],
  );

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlements(): EntitlementValue {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error('useEntitlements must be used inside <EntitlementProvider>');
  return ctx;
}
