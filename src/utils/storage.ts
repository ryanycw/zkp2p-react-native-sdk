import type { Storage, ProviderSettings } from '../types';
import {
  computeCredentialsKey,
  computeCredentialAndConsentKeys,
} from '../providers/utils';

const isCredKey = (k: string) => k.startsWith('zkp2p:cred:');
const isConsentKey = (k: string) => k.startsWith('zkp2p_consent_');

export async function clearAllCredentials(storage: Storage): Promise<number> {
  const keys = (await storage.getKeys?.()) || [];
  let deleted = 0;
  for (const k of keys as string[]) {
    if (isCredKey(k)) {
      try {
        await storage.del(k);
        deleted += 1;
      } catch {}
    }
  }
  return deleted;
}

export async function clearAllConsents(storage: Storage): Promise<number> {
  const keys = (await storage.getKeys?.()) || [];
  let deleted = 0;
  for (const k of keys as string[]) {
    if (isConsentKey(k)) {
      try {
        await storage.del(k);
        deleted += 1;
      } catch {}
    }
  }
  return deleted;
}

export async function clearProviderCredentials(
  storage: Storage,
  platform: string,
  actionType: string
): Promise<boolean> {
  const key = computeCredentialsKey(platform, actionType, 'zkp2p:cred');
  try {
    await storage.del(key);
    return true;
  } catch {
    return false;
  }
}

export async function clearProviderConsent(
  storage: Storage,
  cfg: ProviderSettings
): Promise<boolean> {
  try {
    const { consentKey } = computeCredentialAndConsentKeys(cfg);
    await storage.del(consentKey);
    return true;
  } catch {
    return false;
  }
}

export async function getProviderConsent(
  storage: Storage,
  cfg: ProviderSettings
): Promise<'accepted' | 'denied' | null> {
  try {
    const { consentKey } = computeCredentialAndConsentKeys(cfg);
    const raw = (await (storage as any).get(consentKey)) as unknown;
    if (typeof raw === 'string') {
      const v = raw.trim();
      if (v === 'accepted' || v === 'denied') return v;
    }
  } catch {}
  return null;
}
