jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

import { keccak256 } from '../utils/keccak';
import {
  computeCredentialsKey,
  computeCredentialAndConsentKeys,
} from '../providers/utils';
import type { ProviderMetadata, ProviderSettings } from '../types';

type ProviderOverrides = Partial<Omit<ProviderSettings, 'metadata'>> & {
  metadata?: Partial<ProviderMetadata>;
};

const makeProviderConfig = (
  overrides: ProviderOverrides = {}
): ProviderSettings => {
  const baseMetadata: ProviderMetadata = {
    platform: 'ios/login-provider',
    urlRegex: '.*',
    method: 'GET',
    fallbackUrlRegex: '.*',
    fallbackMethod: 'GET',
    preprocessRegex: '',
    transactionsExtraction: {
      transactionJsonPathListSelector: '$.transactions',
      transactionJsonPathSelectors: {},
    },
    proofMetadataSelectors: [],
  };

  const { metadata: metadataOverride, ...restOverrides } = overrides;

  const baseConfig: ProviderSettings = {
    actionType: 'sign-in:v1',
    authLink: 'https://example.com/auth',
    url: 'https://example.com/login',
    method: 'POST',
    skipRequestHeaders: [],
    body: '',
    metadata: metadataOverride
      ? { ...baseMetadata, ...metadataOverride }
      : baseMetadata,
    paramNames: [],
    paramSelectors: [],
    secretHeaders: [],
    responseMatches: [],
    responseRedactions: [],
    additionalProofs: [],
  };

  return {
    ...baseConfig,
    ...restOverrides,
    metadata: metadataOverride
      ? { ...baseMetadata, ...metadataOverride }
      : baseConfig.metadata,
  };
};

describe('storage key helpers', () => {
  it('generates hashed credential keys with allowed characters', () => {
    const cfg = makeProviderConfig();
    const key = computeCredentialsKey(cfg);
    const expected = `zkp2p_cred_${keccak256(
      `${cfg.metadata.platform}:${cfg.actionType}:${cfg.url}`
    )}`;
    expect(key).toBe(expected);
    expect(/^[A-Za-z0-9._-]+$/.test(key)).toBe(true);
  });

  it('exposes hashed credential key alongside consent key', () => {
    const cfg = makeProviderConfig({
      actionType: 'login',
      url: 'https://example.com/login',
      metadata: {
        platform: 'ios',
      },
    });
    const { credKey, consentKey } = computeCredentialAndConsentKeys(cfg);
    const expected = `zkp2p_cred_${keccak256(
      `${cfg.metadata.platform}:${cfg.actionType}:${cfg.url}`
    )}`;
    expect(credKey).toBe(expected);
    expect(consentKey).toMatch(/^zkp2p_consent_/);
  });
});
