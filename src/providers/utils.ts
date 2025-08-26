import { JSONPath } from 'jsonpath-plus';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { keccak256 } from '../utils/keccak';
import type {
  ProviderSettings,
  ExtractedMetadataList,
  ParamSelector,
  NetworkEvent,
} from '../types';

export type ReplayTarget = { url: string; method?: string; body?: string };

export type ResolvedPayload = {
  bodyStr: string;
  bodyJson?: any;
  updatedPayload: NetworkEvent;
};

/**
 * Replay the request and resolve the response.
 */
export async function replayAndResolve(
  evt: NetworkEvent,
  target: ReplayTarget,
  userAgent: string
): Promise<ResolvedPayload> {
  console.log('evt', evt);
  const res = await fetch(target.url, {
    method: (target.method as any) || 'GET',
    headers: {
      ...evt.request.headers,
      'User-Agent': userAgent,
      ...(evt.request.cookie ? { Cookie: evt.request.cookie } : {}),
    },
    body: target.body,
    credentials: 'include',
  } as any);
  console.log('res', res);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch transaction data: ${res.status} ${res.statusText}`
    );
  }
  const bodyJson = await res.json();
  const updatedPayload: NetworkEvent = {
    ...evt,
    response: {
      url: (res as any).url || evt.response.url,
      status: res.status,
      headers: evt.response.headers,
      body: JSON.stringify(bodyJson),
    },
  };
  return { bodyStr: JSON.stringify(bodyJson), bodyJson, updatedPayload };
}

/**
 * JSON stringify helper that omits functions which are not serializable.
 */
export const safeStringify = (v: unknown): string =>
  JSON.stringify(v, (_, val) => (typeof val === 'function' ? undefined : val));

/**
 * Extracts a list of transaction items from a provider response JSON.
 * Returns an empty array on errors.
 */
export const extractMetadata = (
  json: any,
  cfg: ProviderSettings
): ExtractedMetadataList[] => {
  const txCfg = cfg.metadata.transactionsExtraction;
  if (!txCfg) return [];
  try {
    const list = JSONPath({
      path: txCfg.transactionJsonPathListSelector,
      json,
    });
    if (!Array.isArray((list as any)[0])) return [];
    return (list as any)[0].map((t: any, i: number) => {
      const row: Record<string, unknown> = {};
      for (const [k, p] of Object.entries(txCfg.transactionJsonPathSelectors)) {
        row[k] = (
          JSONPath({ path: p, json: t, resultType: 'value' }) as any[]
        )[0];
      }
      return {
        ...row,
        hidden: Object.values(row).some((v) => v == null),
        originalIndex: i,
      } as ExtractedMetadataList;
    });
  } catch {
    return [];
  }
};

// Helper: get parameter value from various sources
export function getParamValue(
  selector: ParamSelector,
  payload: NetworkEvent,
  responseBodyString: string,
  originalIndex: number
): string {
  const source = selector.source || 'responseBody';
  let sourceData = '';
  switch (source) {
    case 'responseBody':
      sourceData = responseBodyString;
      break;
    case 'requestBody':
      sourceData = payload.request.body || '';
      break;
    case 'requestHeaders':
      sourceData = JSON.stringify(payload.request.headers || {});
      break;
    case 'responseHeaders':
      sourceData = JSON.stringify(payload.response.headers || {});
      break;
    case 'url':
      sourceData = payload.request.url || '';
      break;
    default:
      sourceData = responseBodyString;
  }

  if (selector.type === 'jsonPath') {
    try {
      const jsonPath = selector.value.replace(
        '{{INDEX}}',
        String(originalIndex)
      );
      const json =
        source === 'url' ? { url: sourceData } : JSON.parse(sourceData || '{}');
      const result = JSONPath({
        path: jsonPath,
        json,
        resultType: 'value',
      }) as any[];
      return result?.[0] !== undefined ? String(result[0]) : '';
    } catch {
      return '';
    }
  }

  // regex
  try {
    const re = new RegExp(selector.value);
    const m = sourceData.match(re);
    return m && (m[1] ?? m[0]) ? String(m[1] ?? m[0]) : '';
  } catch {
    return '';
  }
}

// Preprocess response body with regex if configured
export function preprocessBody(
  preprocessRegex?: string,
  body?: string
): string {
  const input = body ?? '{}';
  if (!preprocessRegex) return input;
  try {
    const m = input.match(new RegExp(preprocessRegex));
    return m?.[1] ? m[1] : input;
  } catch {
    return input;
  }
}

// Build headers to send by skipping configured headers and forcing User-Agent
export function buildHeadersToSend(
  requestHeaders: Record<string, string>,
  skipList: string[],
  userAgent: string
): Record<string, string> {
  const entries = Object.entries(requestHeaders || {});
  const out: Record<string, string> =
    skipList.length > 0
      ? entries.reduce(
          (acc, [name, value]) => {
            if (!skipList.includes(name)) acc[name] = value;
            return acc;
          },
          {} as Record<string, string>
        )
      : {};
  out['User-Agent'] = userAgent;
  return out;
}

// Build param values by applying each selector with getParamValue
export function buildParamValues(
  cfg: ProviderSettings,
  payload: NetworkEvent,
  responseBody: string,
  originalIndex: number
): Record<string, string> {
  const params: Record<string, string> = {};
  cfg.paramNames?.forEach((name, idx) => {
    const sel = cfg.paramSelectors?.[idx] as any;
    if (!sel) return;
    const val = getParamValue(sel, payload, responseBody, originalIndex);
    params[name] = String(val ?? '');
  });
  return params;
}

// Build secret params (headers + cookieStr) from payload per configuration
export function buildSecretParams(
  cfg: ProviderSettings,
  payload: NetworkEvent
): { headers: Record<string, string>; cookieStr?: string } {
  const secret: { headers: Record<string, string>; cookieStr?: string } = {
    headers: {},
  };
  cfg.secretHeaders?.forEach((h) => {
    if (h === 'Cookie') secret.cookieStr = payload.request.cookie ?? '';
    else secret.headers[h] = payload.request.headers[h] ?? '';
  });
  return secret;
}

// Build a unique storage key for intercepted payloads, including URL hash for disambiguation
export function computeInterceptStorageKey(cfg: ProviderSettings): string {
  const raw = `${cfg.metadata.platform}:${cfg.actionType}:${cfg.url || ''}`;
  const hash = keccak256(raw);
  return `intercepted_payload_${hash}`;
}

// Save intercepted payload using a unique key per URL
export async function saveInterceptedPayload(
  cfg: ProviderSettings,
  evt: NetworkEvent
): Promise<void> {
  const key = computeInterceptStorageKey(cfg);
  await AsyncStorage.setItem(key, safeStringify(evt));
}

// Attempt to load a previously stored intercepted payload for this provider
export async function loadInterceptedPayload(
  cfg: ProviderSettings
): Promise<NetworkEvent | null> {
  const key = computeInterceptStorageKey(cfg);
  const raw = await AsyncStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}
