import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import type { ReactNode } from 'react';

import {
  Modal,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Linking,
  Animated,
  Easing,
  Image,
  Platform,
  Alert,
  Dimensions,
} from 'react-native';

import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { WebViewErrorEvent } from 'react-native-webview/lib/WebViewTypes';
import CookieManager from '@react-native-cookies/cookies';
import { JSONPath } from 'jsonpath-plus';
import type { WalletClient } from 'viem';
import Svg, { Circle } from 'react-native-svg';
import DeviceInfo from 'react-native-device-info';

import {
  type WindowRPCIncomingMsg,
  type RPCCreateClaimOptions,
} from '@zkp2p/reclaim-witness-sdk';
import { InterceptWebView } from '@zkp2p/react-native-webview-intercept';

import {
  type ProviderSettings,
  type ExtractedMetadataList,
  type Zkp2pClientOptions,
  type PendingEntry,
  type NetworkEvent,
  type RPCResponse,
  type ProofData,
  type FlowState,
  type InitiateOptions,
  type AuthenticateOptions,
  type AutoGenerateProofOptions,
} from '../types';

import { Zkp2pClient } from '../client';
import { BridgeFactory } from '../bridges/BridgeFactory';
import type { GnarkBridge } from '../bridges/GnarkBridge';
import { DEFAULT_USER_AGENT } from '../utils/constants';
import { toDecimalString } from '../utils/format';
import { parseReclaimProxyProof } from '../utils/reclaimProof';
import { flowReducer, initialFlow } from './flowReducer';
import {
  extractMetadata,
  preprocessBody,
  buildHeadersToSend,
  buildInPageReplayScript,
  buildParamValues,
  buildSecretParams,
  saveInterceptedPayload,
  loadInterceptedPayload,
  type ReplayTarget,
  replayAndResolve,
} from './utils';

import { RPCWebView } from '../components/RPCWebView';
import Zkp2pContext from './Zkp2pContext';
import { clearSession as clearSessionService } from '../utils/session';
import { logger, setLogLevel } from '../utils/logger';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface Zkp2pProviderProps {
  children: ReactNode;
  witnessUrl?: string;
  prover?: 'reclaim_gnark' | 'reclaim_snarkjs';
  configBaseUrl?: string;
  rpcTimeout?: number;
  walletClient?: WalletClient;
  apiKey?: string;
  chainId?: number;
  environment?: 'production' | 'staging';
  baseApiUrl?: string;
  logLevel?: 'error' | 'info' | 'debug';
}

// ============================================================================
// ANIMATED SVG COMPONENT
// ============================================================================

const AnimatedSvg = Animated.createAnimatedComponent(Svg as any);

const getCustomUserAgent = (providerCfg?: ProviderSettings): string => {
  if (!providerCfg?.mobile?.userAgent) {
    return DEFAULT_USER_AGENT;
  }

  return (
    Platform.select({
      ios: providerCfg.mobile.userAgent.ios,
      android: providerCfg.mobile.userAgent.android,
      default: DEFAULT_USER_AGENT,
    }) || DEFAULT_USER_AGENT
  );
};

// ============================================================================
// MEMORY HELPERS
// ============================================================================

const calculateGnarkDynamicConcurrency = async (): Promise<number> => {
  try {
    const totalMemory = await DeviceInfo.getTotalMemory();
    const usedMemory = await DeviceInfo.getUsedMemory();
    const availableMemory = totalMemory - usedMemory;

    // Calculate concurrency based on available memory
    // Assume each proof needs ~750MB
    const memoryPerProof = 750 * 1024 * 1024; // 750MB
    const suggestedConcurrency = Math.floor(
      (availableMemory * 0.5) / memoryPerProof
    ); // Use 50% of available

    // Apply limits based on total memory
    let maxConcurrency = 4;
    if (totalMemory >= 8 * 1024 * 1024 * 1024) {
      // 8GB+
      maxConcurrency = 6;
    } else if (totalMemory >= 6 * 1024 * 1024 * 1024) {
      // 6GB+
      maxConcurrency = 4;
    } else if (totalMemory >= 4 * 1024 * 1024 * 1024) {
      // 4GB+
      maxConcurrency = 3;
    } else {
      // Less than 4GB
      maxConcurrency = 2;
    }

    const finalConcurrency = Math.max(
      1,
      Math.min(suggestedConcurrency, maxConcurrency)
    );

    // Simulator/dev guardrail: clamp when running on emulator
    try {
      const isEmulator = await DeviceInfo.isEmulator();
      if (isEmulator) {
        return 2;
      }
    } catch {}
    return finalConcurrency;
  } catch (error) {
    logger.info(
      '[zkp2p] Could not determine memory dynamically, using defaults:',
      error
    );
    // Fallback to 1
    return 1;
  }
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const Zkp2pProvider = ({
  children,
  prover = 'reclaim_gnark',
  witnessUrl = 'https://witness-proxy.zkp2p.xyz',
  configBaseUrl = 'https://raw.githubusercontent.com/zkp2p/providers/main/',
  rpcTimeout = 30_000,
  walletClient,
  apiKey,
  chainId = 8453,
  environment = 'production',
  baseApiUrl = 'https://api.zkp2p.xyz/v1',
  logLevel,
}: Zkp2pProviderProps) => {
  // ==========================================================================
  // CLIENT INITIALIZATION
  // ==========================================================================

  useEffect(() => {
    if (logLevel) setLogLevel(logLevel);
  }, [logLevel]);

  const zkp2pClient = useMemo(() => {
    if (!apiKey || !walletClient) {
      return null;
    }
    const clientOptions: Zkp2pClientOptions = {
      prover,
      walletClient,
      apiKey,
      chainId,
      environment,
      witnessUrl,
    };
    if (baseApiUrl) {
      clientOptions.baseApiUrl = baseApiUrl;
    }
    return new Zkp2pClient(clientOptions);
  }, [
    walletClient,
    apiKey,
    chainId,
    environment,
    witnessUrl,
    baseApiUrl,
    prover,
  ]);

  // ==========================================================================
  // REFS
  // ==========================================================================

  const rpcWebViewRef = useRef<WebView>(null);
  const authWebViewRef = useRef<WebView>(null);
  const isClosingRef = useRef(false);
  const pending = useRef<Record<string, PendingEntry>>({});
  const spinAnimation = useRef(new Animated.Value(0)).current;
  const slideAnimation = useRef(new Animated.Value(0)).current;
  const openAnimation = useRef(new Animated.Value(1)).current;
  const sessionIdRef = useRef(0);
  const rpcLoadedRef = useRef(false);
  const rpcReadyResolversRef = useRef<Array<() => void>>([]);
  const rpcAutoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  // ==========================================================================
  // GNARK BRIDGE SETUP
  // ==========================================================================

  const gnarkBridge = useMemo<GnarkBridge | null>(() => {
    if (prover === 'reclaim_gnark') {
      return BridgeFactory.getGnarkBridge();
    }
    return null;
  }, [prover]);

  useEffect(() => {
    return () => {
      BridgeFactory.dispose();
    };
  }, []);

  // ==========================================================================
  // STATE MANAGEMENT
  // ==========================================================================

  const [provider, setProvider] = useState<ProviderSettings | null>(null);
  const [rpcVisible, setRpcVisible] = useState(false);

  const [flow, dispatch] = useReducer(flowReducer, initialFlow);
  const flowState: FlowState = flow.phase as FlowState;
  const authError = flow.authError;
  const proofError = flow.proofError;

  const [authWebViewProps, setAuthWebViewProps] = useState<React.ComponentProps<
    typeof InterceptWebView
  > | null>(null);

  // Data extraction state
  const [metadataList, setMetadataList] = useState<ExtractedMetadataList[]>([]);
  const [interceptedPayload, setInterceptedPayload] =
    useState<NetworkEvent | null>(null);

  // Proof generation state
  const [proofData, setProofData] = useState<ProofData[]>([]);
  const [lastProofItemIndex, setLastProofItemIndex] = useState<number>(0);
  const [autoGenerateOptions, setAutoGenerateOptions] =
    useState<AutoGenerateProofOptions | null>(null);

  // WebView state
  const [isWebViewMinimized, setIsWebViewMinimized] = useState(false);

  // Auth webview mount/unmount logs
  const wasAuthMountedRef = useRef(false);
  useEffect(() => {
    if (authWebViewProps && !wasAuthMountedRef.current) {
      wasAuthMountedRef.current = true;
      logger.info('[AuthWebView] mounted');
    } else if (!authWebViewProps && wasAuthMountedRef.current) {
      wasAuthMountedRef.current = false;
      logger.info('[AuthWebView] unmounted');
    }
  }, [authWebViewProps]);

  /*
   * Closes the auth webview (idempotent)
   */
  const closeAuthWebView = useCallback(
    (afterClose?: () => void) => {
      if (isClosingRef.current) {
        afterClose?.();
        return;
      }
      isClosingRef.current = true;
      Animated.timing(openAnimation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }).start(() => {
        setAuthWebViewProps(null);
        setIsWebViewMinimized(false);
        slideAnimation.setValue(0);
        dispatch({ type: 'AUTH_CLOSE' });
        isClosingRef.current = false;
        afterClose?.();
      });
    },
    [
      openAnimation,
      setAuthWebViewProps,
      setIsWebViewMinimized,
      slideAnimation,
      dispatch,
    ]
  );

  useEffect(() => {
    sessionIdRef.current = flow.session;
  }, [flow.session]);

  // Cleanup effect for when component unmounts or prover changes
  useEffect(() => {
    return () => {
      // Cancel any active proof generations when unmounting
      if (gnarkBridge) {
        gnarkBridge.cancelAllProofs().catch((err) => {
          logger.error('[zkp2p] Error cancelling proofs on unmount:', err);
        });
        gnarkBridge.cleanupMemory().catch((err) => {
          logger.error('[zkp2p] Error cleaning up memory on unmount:', err);
        });
      }
    };
  }, [gnarkBridge]);

  // ==========================================================================
  // PROVIDER CONFIGURATION METHODS
  // ==========================================================================

  const _fetchProviderConfig = useCallback(
    async (platform: string, actionType: string) => {
      const res = await fetch(`${configBaseUrl}${platform}/${actionType}.json`);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `Failed to load provider config: ${res.status} ${errorText || res.statusText}`
        );
      }
      return (await res.json()) as ProviderSettings;
    },
    [configBaseUrl]
  );

  const _refetchProviderConfig = useCallback(
    async (platform: string, actionType: string): Promise<ProviderSettings> => {
      const cfg = await _fetchProviderConfig(platform, actionType);
      setProvider(cfg);
      return cfg;
    },
    [_fetchProviderConfig, setProvider]
  );

  // ==========================================================================
  // AUTHENTICATION METHODS
  // ==========================================================================

  const _restoreSessionWith = useCallback(
    async (cfg: ProviderSettings) => {
      const payload = await loadInterceptedPayload(cfg);
      if (!payload) return false;

      if (payload.request.cookie) {
        await CookieManager.setFromResponse(
          payload.request.url,
          payload.request.cookie
        );
      }
      try {
        const target = {
          // Prefer configured metadataUrl; otherwise replay the last responded URL
          // from the stored payload rather than the original request URL.
          url: cfg.metadata.metadataUrl || payload.response.url,
          method:
            (cfg.metadata.metadataUrlMethod as any) ||
            payload.request.method ||
            'GET',
          body: cfg.metadata.metadataUrl
            ? cfg.metadata.metadataUrlBody
            : payload.request.body || undefined,
        } as ReplayTarget;
        const resolved = await replayAndResolve(
          payload,
          target,
          getCustomUserAgent(cfg)
        );
        const bodyJson = resolved.bodyJson ?? JSON.parse(resolved.bodyStr);
        setInterceptedPayload(resolved.updatedPayload);
        setMetadataList(extractMetadata(bodyJson, cfg));
        dispatch({ type: 'AUTH_SUCCESS' });
        return true;
      } catch (e) {
        // Surface restore errors to caller (_authenticateInternal) to handle
        throw e;
      }
    },
    [setInterceptedPayload, setMetadataList, dispatch]
  );

  const _handleAuthIntercept = useCallback(
    async (evt: NetworkEvent, cfg: ProviderSettings) => {
      if (isClosingRef.current) {
        return;
      }
      const sid = sessionIdRef.current;
      const { metadata } = cfg;
      const primaryHit =
        evt.request.method === metadata.method &&
        new RegExp(metadata.urlRegex).test(evt.response.url);

      const fallbackHit =
        metadata.fallbackUrlRegex &&
        evt.request.method === metadata.fallbackMethod &&
        new RegExp(metadata.fallbackUrlRegex).test(evt.response.url);

      if (!primaryHit && !fallbackHit) {
        return;
      }

      let itemExtractionError: Error | null = null;

      try {
        let effectivePayload: NetworkEvent;
        let jsonBody: any;

        if (primaryHit) {
          // Primary urlRegex hit: do not replay, use intercepted response as-is
          const bodyStr = evt.response.body ?? '{}';
          try {
            jsonBody = JSON.parse(bodyStr);
          } catch {
            jsonBody = {};
          }
          effectivePayload = evt;
          await saveInterceptedPayload(cfg, effectivePayload);
        } else {
          // Fallback urlRegex hit: perform an in-page XHR to metadataUrl (or cfg.url)
          const url = cfg.metadata.metadataUrl || cfg.url;
          const method =
            (cfg.metadata.metadataUrlMethod as any) ||
            (cfg.method as any) ||
            'GET';
          const body = cfg.metadata.metadataUrl
            ? cfg.metadata.metadataUrlBody
            : cfg.body || undefined;

          const headersObject =
            (evt.request.headers as Record<string, string>) || {};

          const js = buildInPageReplayScript({
            url,
            method,
            headers: headersObject,
            body,
          });

          try {
            authWebViewRef.current?.injectJavaScript?.(js);
          } catch (e) {
            logger.warn('[zkp2p] In-page fallback replay injection failed:', e);
          }
          // The metadataUrl response will be intercepted and handled in a subsequent call
          return;
        }

        const txs = extractMetadata(jsonBody, cfg);
        if (sid !== sessionIdRef.current) return;
        setMetadataList(txs);
        setInterceptedPayload(effectivePayload);

        if (
          txs.length === 0 &&
          cfg.metadata.transactionsExtraction?.transactionJsonPathListSelector
        ) {
          itemExtractionError = new Error('No transactions found');
        }

        dispatch({
          type: 'AUTH_SUCCESS_WITH_ERROR',
          error: itemExtractionError ?? null,
        });
        closeAuthWebView();
      } catch (err) {
        logger.error(
          '[zkp2p] failed to retrieve/process JSON body (via _handleAuthIntercept):',
          err
        );
        if (sid !== sessionIdRef.current) return;
        setMetadataList([]);
        setInterceptedPayload(null);
        dispatch({ type: 'AUTH_FAILURE', error: err as Error });
        closeAuthWebView();
      }
    },
    [setMetadataList, setInterceptedPayload, dispatch, closeAuthWebView]
  );

  const _processInjectedScript = useCallback(
    (script: string, values: Record<string, string>) => {
      let processedScript = script;

      Object.entries(values).forEach(([key, value]) => {
        // Escape the value for safe JavaScript string insertion
        const escapedValue = value
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n');
        processedScript = processedScript.replace(
          new RegExp(`{{${key}}}`, 'g'),
          escapedValue
        );
      });

      return processedScript;
    },
    []
  );

  const _setupAuthWebViewProps = useCallback(
    (cfg: ProviderSettings) => {
      return {
        source: { uri: cfg.authLink },
        urlPatterns: [
          cfg.metadata.urlRegex,
          cfg.metadata.fallbackUrlRegex,
        ].filter(Boolean) as string[],
        userAgent: getCustomUserAgent(cfg),
        interceptConfig: {
          xhr: true,
          fetch: true,
          html: true,
          maxBodyBytes: 10 * 1024 * 1024,
        },
        additionalCookieDomainsToInclude:
          cfg.mobile?.includeAdditionalCookieDomains ?? [],
        style: { flex: 1 },
        onIntercept: (evt: NetworkEvent) => _handleAuthIntercept(evt, cfg),
        onError: (e: WebViewErrorEvent) => {
          logger.error('[zkp2p] Auth webview error:', e.nativeEvent);
          dispatch({
            type: 'SET_AUTH_ERROR',
            error: new Error(String(e.nativeEvent?.description ?? e.type)),
          });
          closeAuthWebView();
        },
      };
    },
    [_handleAuthIntercept, dispatch, closeAuthWebView]
  );

  const _authenticateInternal = useCallback(
    async (
      cfg: ProviderSettings,
      autoGenerateProof?: AutoGenerateProofOptions | null
    ) => {
      dispatch({ type: 'AUTH_OPEN' });

      // Set auto-generate options if provided
      if (autoGenerateProof !== undefined) {
        setAutoGenerateOptions(autoGenerateProof);
      }

      try {
        const reused = await _restoreSessionWith(cfg);
        if (reused) {
          closeAuthWebView();
          return;
        }
      } catch (err) {
        logger.warn('[zkp2p] Stored session invalid:', err);
        dispatch({ type: 'SET_AUTH_ERROR', error: err as Error });
      }

      const webViewProps = _setupAuthWebViewProps(cfg);
      setAuthWebViewProps(webViewProps);
      slideAnimation.setValue(0);
      openAnimation.setValue(1);

      // Animate webview sliding up from bottom
      Animated.timing(openAnimation, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }).start();
    },
    [
      _restoreSessionWith,
      setAuthWebViewProps,
      _setupAuthWebViewProps,
      slideAnimation,
      openAnimation,
      dispatch,
      setAutoGenerateOptions,
      closeAuthWebView,
    ]
  );

  const _handleHttpActionInWebView = useCallback(
    async (
      actionUrl: string,
      cfg: ProviderSettings,
      initialAction: NonNullable<InitiateOptions['initialAction']>,
      autoGenerateProof?: AutoGenerateProofOptions | null
    ) => {
      dispatch({ type: 'ACTION_START' });

      // Apply template substitutions to URL and injection script
      let effectiveActionUrl = actionUrl;
      const details = initialAction.paymentDetails || {};

      // Replace templates in URL
      Object.entries(details).forEach(([key, value]) => {
        effectiveActionUrl = effectiveActionUrl.replace(
          new RegExp(`{{${key}}}`, 'g'),
          value
        );
      });

      // Process injected script with same details
      const injectedScript = cfg.mobile?.internal?.injectedJavaScript
        ? _processInjectedScript(
            cfg.mobile.internal.injectedJavaScript,
            details
          )
        : '';

      logger.debug('[zkp2p] Action WebView injectedScript:', injectedScript);

      setAuthWebViewProps({
        source: { uri: effectiveActionUrl },
        urlPatterns: [],
        userAgent: getCustomUserAgent(cfg),
        domStorageEnabled: true,
        interceptConfig: { xhr: false, fetch: false, html: false },
        additionalCookieDomainsToInclude:
          cfg.mobile?.includeAdditionalCookieDomains ?? [],
        style: { flex: 1 },
        injectedJavaScript: injectedScript || undefined,
        onIntercept: (_evt: NetworkEvent) => {
          // Intercept should be off during action phase
        },
        onNavigationStateChange: async (navState) => {
          // Check if the current URL matches the target URL pattern
          if (
            cfg.mobile?.internal?.actionCompletedUrlRegex &&
            new RegExp(cfg.mobile.internal.actionCompletedUrlRegex).test(
              navState.url
            )
          ) {
            // Navigate to authentication phase
            await _authenticateInternal(cfg, autoGenerateProof);
          }
        },
        onError: (e: WebViewErrorEvent) => {
          logger.error(
            '[zkp2p] InitialAction WebView error:',
            e.nativeEvent?.description ?? e.type
          );
          dispatch({
            type: 'AUTH_FAILURE',
            error: new Error(String(e.nativeEvent?.description ?? e.type)),
          });
          closeAuthWebView();
        },
      });
      slideAnimation.setValue(0);
      openAnimation.setValue(1);

      // Animate webview sliding up from bottom
      Animated.timing(openAnimation, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }).start();
    },
    [
      setAuthWebViewProps,
      _authenticateInternal,
      _processInjectedScript,
      slideAnimation,
      openAnimation,
      dispatch,
      closeAuthWebView,
    ]
  );

  const _handleExternalAction = useCallback(
    async (
      actionUrl: string,
      cfg: ProviderSettings,
      initialAction: NonNullable<InitiateOptions['initialAction']>
    ) => {
      dispatch({ type: 'ACTION_START' });

      // Apply template substitutions to URL
      let effectiveActionUrl = actionUrl;
      const details = initialAction.paymentDetails || {};

      Object.entries(details).forEach(([key, value]) => {
        effectiveActionUrl = effectiveActionUrl.replace(
          new RegExp(`{{${key}}}`, 'g'),
          value
        );
      });

      try {
        await Linking.openURL(effectiveActionUrl);
      } catch (linkErr) {
        logger.warn('[zkp2p] Failed to open external URL:', linkErr);

        // Check if app store links are available for fallback
        const appStoreLink =
          Platform.OS === 'ios'
            ? cfg.mobile?.external?.appStoreLink
            : cfg.mobile?.external?.playStoreLink;

        if (appStoreLink) {
          // Show alert asking user if they want to open the app store
          Alert.alert(
            'App Not Installed',
            'Download the app from the app store to continue.',
            [
              {
                text: 'Cancel',
                onPress: () => {
                  dispatch({
                    type: 'AUTH_FAILURE',
                    error: new Error(
                      `Failed to open action URL: ${effectiveActionUrl}`
                    ),
                  });
                },
                style: 'cancel',
              },
              {
                text: 'Open App Store',
                onPress: async () => {
                  try {
                    await Linking.openURL(appStoreLink);
                    // Still set error state as the original action couldn't complete
                    dispatch({
                      type: 'AUTH_FAILURE',
                      error: new Error(
                        'App not installed. Please install and try again.'
                      ),
                    });
                  } catch (storeErr) {
                    logger.error('[zkp2p] Failed to open app store:', storeErr);
                    dispatch({
                      type: 'AUTH_FAILURE',
                      error: new Error('Failed to open app store'),
                    });
                  }
                },
              },
            ],
            { cancelable: true }
          );
        } else {
          // No app store link available, just show error
          dispatch({
            type: 'AUTH_FAILURE',
            error: new Error(
              `Failed to open action URL: ${effectiveActionUrl}`
            ),
          });
        }
      }
    },
    [dispatch]
  );

  const _handleInitialAction = useCallback(
    async (
      cfg: ProviderSettings,
      initialAction: NonNullable<InitiateOptions['initialAction']>,
      autoGenerateProof?: AutoGenerateProofOptions | null
    ) => {
      const internalUrl = cfg.mobile?.internal?.actionLink;
      const externalUrl = cfg.mobile?.external?.actionLink;

      // Choose flow: prioritize internal when available unless config set to external
      let preferExternal = cfg.mobile?.useExternalAction === true;
      // Runtime override (for dev/testing): initialAction.useExternalActionOverride takes precedence.
      if (initialAction.useExternalActionOverride !== undefined) {
        preferExternal = !!initialAction.useExternalActionOverride;
      }

      const runInternal = async () => {
        if (!internalUrl) return false;
        await _handleHttpActionInWebView(
          internalUrl,
          cfg,
          initialAction,
          autoGenerateProof
        );
        return true;
      };

      const runExternal = async () => {
        if (!externalUrl) return false;
        await _handleExternalAction(externalUrl, cfg, initialAction);
        return true;
      };

      let started = false;
      if (preferExternal) {
        started = (await runExternal()) || (await runInternal());
      } else {
        started = (await runInternal()) || (await runExternal());
      }
      if (!started) return; // nothing to do
    },
    [_handleHttpActionInWebView, _handleExternalAction]
  );

  // ==========================================================================
  // RPC COMMUNICATION METHODS
  // ==========================================================================

  const _rpcRequest = useCallback(
    async (
      type: 'createClaim',
      req: RPCCreateClaimOptions,
      onStep?: (msg: RPCResponse) => void
    ): Promise<RPCResponse> => {
      // Ensure RPC WebView is visible and loaded
      if (!rpcVisible) setRpcVisible(true);
      if (!rpcLoadedRef.current) {
        await new Promise<void>((resolve) => {
          rpcReadyResolversRef.current.push(resolve);
        });
      }

      const id = Math.random().toString(16).slice(2);
      const msg: WindowRPCIncomingMsg = {
        module: 'attestor-core',
        id,
        type,
        channel: 'ReactNativeWebView',
        request: req,
      };

      const promise = new Promise<RPCResponse>((resolve, reject) => {
        const timeout = setTimeout(() => {
          logger.error('[Zkp2pProvider] RPC timeout exceeded:', {
            id,
            type,
            rpcTimeout: rpcTimeout / 1000 + 's',
            request: req,
          });
          // Best-effort native cleanup to avoid lingering tasks impacting next run
          if (prover === 'reclaim_gnark' && gnarkBridge) {
            gnarkBridge
              .cancelAllProofs()
              .then(() => gnarkBridge.cleanupMemory())
              .catch(() => undefined);
          }
          delete pending.current[id];
          reject(new Error('Proof generation timeout'));
        }, rpcTimeout);

        pending.current[id] = { resolve, reject, timeout, onStep };
      });

      if (!rpcWebViewRef.current) {
        throw new Error('RPC not initialized');
      }
      rpcWebViewRef.current.injectJavaScript(`
        window.postMessage(${JSON.stringify(msg)});
      `);
      return promise;
    },
    [rpcTimeout, prover, gnarkBridge, rpcVisible]
  );

  const _onRpcMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (!data.module || data.module !== 'attestor-core' || !data.id) {
        return;
      }
      const { id, type } = data as RPCResponse;
      if (type === 'createClaimStep') {
        const entry = pending.current[id];
        if (entry?.onStep) entry.onStep(data as RPCResponse);
      } else if (type === 'createClaimDone') {
        pending.current[id]?.resolve(data as RPCResponse);
        clearTimeout(pending.current[id]?.timeout);
        delete pending.current[id];
        if (Object.keys(pending.current).length === 0) {
          if (rpcAutoHideTimerRef.current)
            clearTimeout(rpcAutoHideTimerRef.current);
          rpcAutoHideTimerRef.current = setTimeout(() => {
            setRpcVisible(false);
            rpcLoadedRef.current = false;
          }, 300);
        }
      } else if (type === 'error') {
        logger.error('[zkp2p] RPC error:', data);
        const errorMessage = (data as any).data?.message || 'Unknown error';
        const error = new Error(errorMessage);
        if ((data as any).data?.stack) error.stack = (data as any).data.stack;
        (error as any).rawData = data;
        const entry = pending.current[id];
        entry?.reject(error);
        if (entry?.timeout) clearTimeout(entry.timeout as any);
        delete pending.current[id];
        if (Object.keys(pending.current).length === 0) {
          if (rpcAutoHideTimerRef.current)
            clearTimeout(rpcAutoHideTimerRef.current);
          rpcAutoHideTimerRef.current = setTimeout(() => {
            setRpcVisible(false);
            rpcLoadedRef.current = false;
          }, 300);
        }
      }
    } catch (error) {
      logger.error('[zkp2p] Failed to process WebView message:', error);
    }
  }, []);

  const rpcWebViewProps = {
    ref: rpcWebViewRef,
    witnessUrl,
    onMessage: _onRpcMessage,
    onLoad: () => {
      rpcLoadedRef.current = true;
      const resolvers = rpcReadyResolversRef.current.splice(0);
      resolvers.forEach((r) => r());
      logger.info('[RPCWebView] onLoad (ready)');
    },
    gnarkBridge,
  } as const;

  // ==========================================================================
  // PROOF GENERATION METHODS
  // ==========================================================================

  // Abort all outstanding RPC promises and clear their timers
  const abortAllPending = useCallback((reason: string): number => {
    let count = 0;
    try {
      Object.entries(pending.current).forEach(([id, ent]) => {
        try {
          if (ent.timeout) clearTimeout(ent.timeout as any);
          ent.reject(new Error(reason));
          delete pending.current[id];
          count++;
        } catch {}
      });
    } catch {}
    if (count > 0) {
      if (rpcAutoHideTimerRef.current)
        clearTimeout(rpcAutoHideTimerRef.current);
      rpcAutoHideTimerRef.current = setTimeout(() => {
        if (Object.keys(pending.current).length === 0) {
          setRpcVisible(false);
          rpcLoadedRef.current = false;
        }
      }, 300);
    }
    return count;
  }, []);

  const generateProof = useCallback(
    async (
      providerCfg: ProviderSettings,
      payload: NetworkEvent,
      intentHash: string,
      itemIndex: number = 0
    ) => {
      const sid = sessionIdRef.current;
      if (!payload) throw new Error('No authentication data');
      if (prover !== 'reclaim_snarkjs' && prover !== 'reclaim_gnark') {
        throw new Error(`Unsupported prover: ${prover}`);
      }

      logger.info('[zkp2p] Starting proof generation...');
      if (sid !== sessionIdRef.current) return [];
      dispatch({ type: 'PROOF_START' });
      setProofData([]);
      setLastProofItemIndex(itemIndex);
      try {
        // Preflight: ensure no native gnark tasks are lingering
        if (gnarkBridge && prover === 'reclaim_gnark') {
          try {
            await gnarkBridge.cancelAllProofs();
            await gnarkBridge.cleanupMemory();
          } catch (e) {
            logger.warn('[zkp2p] Preflight cleanup warning:', e);
          }
        }

        // Abort any outstanding RPC requests from a previous attempt
        const aborted = abortAllPending('New proof started');
        if (aborted > 0) {
          logger.info('[zkp2p] Aborted', aborted, 'pending RPC request(s)');
        }
        // Keep preflight simple (no global abort/remount): rely on timeout guards

        let body = preprocessBody(
          providerCfg.metadata.preprocessRegex,
          payload.response.body ?? '{}'
        );
        const headersToSend = buildHeadersToSend(
          payload.request.headers,
          providerCfg.skipRequestHeaders,
          getCustomUserAgent(providerCfg)
        );
        const paramValues = buildParamValues(
          providerCfg,
          payload,
          body,
          itemIndex
        );
        const secret = buildSecretParams(providerCfg, payload);
        const rpc: RPCCreateClaimOptions = {
          name: 'http',
          context: JSON.stringify({
            contextAddress: '0x0',
            contextMessage: toDecimalString(intentHash),
          }),
          params: {
            url: providerCfg.url,
            method: providerCfg.method,
            body: providerCfg.body,
            headers: headersToSend,
            paramValues,
            responseMatches: providerCfg.responseMatches,
            responseRedactions: providerCfg.responseRedactions?.map((r) => ({
              jsonPath: r.jsonPath?.replace('{{INDEX}}', String(itemIndex)),
              regex: r.regex?.replace('{{INDEX}}', String(itemIndex)),
              xPath: r.xPath?.replace('{{INDEX}}', String(itemIndex)),
            })),
            ...(providerCfg.countryCode
              ? { geoLocation: providerCfg.countryCode }
              : {}),
          },
          secretParams: secret,
          ownerPrivateKey:
            '0x0123788edad59d7c013cdc85e4372f350f828e2cec62d9a2de4560e69aec7f89',
          zkEngine: prover === 'reclaim_gnark' ? 'gnark' : 'snarkjs',
          zkOperatorMode: prover === 'reclaim_gnark' ? 'rpc' : 'default',
          zkProofConcurrency:
            prover === 'reclaim_gnark'
              ? await calculateGnarkDynamicConcurrency()
              : 1,
        };
        const res = await _rpcRequest('createClaim', rpc, (stepData) => {
          logger.debug('[zkp2p] Proof generation step:', stepData);
          if (stepData.step?.error) {
            logger.error(
              '[zkp2p] Proof generation step error:',
              stepData.step.error
            );
          }
        });

        if (sid !== sessionIdRef.current) return [] as any;
        const proof = parseReclaimProxyProof(res.response ?? null);
        const proofDataItem: ProofData = {
          proofType: 'reclaim',
          proof: proof,
        };

        // Check if we need to generate additional proofs
        if (
          providerCfg.additionalProofs &&
          providerCfg.additionalProofs.length > 0
        ) {
          const allProofs: ProofData[] = [proofDataItem];

          for (let i = 0; i < providerCfg.additionalProofs.length; i++) {
            const additionalProofConfig = providerCfg.additionalProofs[i];
            if (!additionalProofConfig) continue;

            logger.debug(
              `[zkp2p] Generating additional proof ${i + 1}/${providerCfg.additionalProofs.length}...`
            );

            // Build body with param substitution
            let additionalBody = additionalProofConfig.body;
            const additionalParamValues: Record<string, string> = {};

            // Extract param values from the original response
            additionalProofConfig.paramNames.forEach((paramName, idx) => {
              const selector = additionalProofConfig.paramSelectors[idx];
              if (!selector) return;

              let responseBody = payload.response.body ?? '{}';
              if (providerCfg.metadata.preprocessRegex) {
                const m = responseBody.match(
                  new RegExp(providerCfg.metadata.preprocessRegex)
                );
                if (m?.[1]) responseBody = m[1];
              }

              if (selector.type === 'jsonPath') {
                const path = selector.value.replace(
                  '{{INDEX}}',
                  String(itemIndex)
                );
                const val = (
                  JSONPath({
                    path,
                    json: JSON.parse(responseBody),
                    resultType: 'value',
                  }) as any[]
                )[0];
                additionalParamValues[paramName] = String(val ?? '');
              } else if (selector.type === 'regex') {
                const m = responseBody.match(new RegExp(selector.value));
                if (m?.[1]) additionalParamValues[paramName] = m[1];
              }
            });

            // Replace param placeholders in body
            Object.entries(additionalParamValues).forEach(([key, value]) => {
              additionalBody = additionalBody.replace(`{{${key}}}`, value);
            });

            // Build new provider config for the additional proof
            const additionalProviderCfg: ProviderSettings = {
              ...providerCfg,
              url: additionalProofConfig.url,
              method: additionalProofConfig.method,
              body: additionalBody,
              paramNames: [],
              paramSelectors: [],
              skipRequestHeaders: additionalProofConfig.skipRequestHeaders,
              secretHeaders: additionalProofConfig.secretHeaders,
              responseMatches: additionalProofConfig.responseMatches,
              responseRedactions: additionalProofConfig.responseRedactions,
            };

            // Generate the additional proof
            const additionalProofResult = await _generateSingleProof(
              additionalProviderCfg,
              payload,
              intentHash,
              itemIndex
            );

            // Extract proof from the result
            const additionalProof = parseReclaimProxyProof(
              additionalProofResult.response ?? null
            );
            allProofs.push({
              proofType: 'reclaim',
              proof: additionalProof,
            });
          }

          setProofData(allProofs);
          dispatch({ type: 'PROOF_SUCCESS' });
          return allProofs;
        } else {
          // Single proof case
          setProofData([proofDataItem]);
          dispatch({ type: 'PROOF_SUCCESS' });
          return [proofDataItem];
        }
      } catch (err) {
        if (sid !== sessionIdRef.current) throw err;
        dispatch({ type: 'PROOF_FAILURE', error: err as Error });
        throw err;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [_rpcRequest, witnessUrl, prover, setProofData, gnarkBridge, dispatch]
  );

  // Internal helper to generate a single proof without modifying state
  const _generateSingleProof = useCallback(
    async (
      providerCfg: ProviderSettings,
      payload: NetworkEvent,
      intentHash: string,
      itemIndex: number = 0
    ) => {
      if (!payload) throw new Error('No authentication data');
      if (prover !== 'reclaim_snarkjs' && prover !== 'reclaim_gnark') {
        throw new Error(`Unsupported prover: ${prover}`);
      }

      // Ensure gnark is not busy between sequential proof calls
      if (gnarkBridge && prover === 'reclaim_gnark') {
        try {
          await gnarkBridge.waitForIdle(2000);
        } catch (e) {
          logger.warn('[zkp2p] waitForIdle before additional proof timed out');
        }
      }

      let body = preprocessBody(
        providerCfg.metadata.preprocessRegex,
        payload.response.body ?? '{}'
      );
      const headersToSend = buildHeadersToSend(
        payload.request.headers,
        providerCfg.skipRequestHeaders,
        getCustomUserAgent(providerCfg)
      );
      const paramValues = buildParamValues(
        providerCfg,
        payload,
        body,
        itemIndex
      );
      const secret = buildSecretParams(providerCfg, payload);

      const rpc: RPCCreateClaimOptions = {
        name: 'http',
        context: JSON.stringify({
          contextAddress: '0x0',
          contextMessage: toDecimalString(intentHash),
        }),
        params: {
          url: providerCfg.url,
          method: providerCfg.method,
          body: providerCfg.body,
          headers: headersToSend,
          paramValues,
          responseMatches: providerCfg.responseMatches,
          responseRedactions: providerCfg.responseRedactions?.map((r) => ({
            jsonPath: r.jsonPath?.replace('{{INDEX}}', String(itemIndex)),
            regex: r.regex?.replace('{{INDEX}}', String(itemIndex)),
            xPath: r.xPath?.replace('{{INDEX}}', String(itemIndex)),
          })),
          ...(providerCfg.countryCode
            ? { geoLocation: providerCfg.countryCode }
            : {}),
        },
        secretParams: secret,
        ownerPrivateKey:
          '0x0123788edad59d7c013cdc85e4372f350f828e2cec62d9a2de4560e69aec7f89',
        zkEngine: prover === 'reclaim_gnark' ? 'gnark' : 'snarkjs',
        zkOperatorMode: prover === 'reclaim_gnark' ? 'rpc' : 'default',
        zkProofConcurrency:
          prover === 'reclaim_gnark'
            ? await calculateGnarkDynamicConcurrency()
            : 1,
      };

      const res = await _rpcRequest('createClaim', rpc, (stepData) => {
        logger.debug('[zkp2p] Proof generation step:', stepData);
        if (stepData.step?.error) {
          logger.error(
            '[zkp2p] Proof generation step error:',
            stepData.step.error
          );
        }
      });

      return res;
    },
    [_rpcRequest, prover, gnarkBridge]
  );

  const _handleAutoGenerateProof = useCallback(
    async (
      cfg: ProviderSettings,
      payload: NetworkEvent,
      items: ExtractedMetadataList[],
      options: AutoGenerateProofOptions
    ) => {
      // Validate we have items to generate proof for
      const targetIndex = options.itemIndex ?? 0;
      if (!items || items.length === 0) {
        const error = new Error('No transactions found');
        options.onProofError?.(error);
        return null;
      }

      if (targetIndex >= items.length) {
        const error = new Error('Invalid transaction index');
        options.onProofError?.(error);
        return null;
      }

      try {
        const intentHash = options.intentHash || '';
        const result = await generateProof(
          cfg,
          payload,
          intentHash,
          targetIndex
        );

        if (flowState === 'proofGeneratedSuccess' && proofData.length > 0) {
          // For backward compatibility, pass the first proof if only one exists
          // Otherwise pass the entire array
          const proofToPass = proofData.length === 1 ? proofData[0] : proofData;
          options.onProofGenerated?.(proofToPass as any);
        }

        return result;
      } catch (error) {
        logger.error('[zkp2p] Auto-generation failed:', error);
        options.onProofError?.(error as Error);
        // Don't set flow state to idle - let it fall back to showing transactions
        return null;
      }
    },
    [generateProof, flowState, proofData]
  );

  // ==========================================================================
  // PUBLIC API METHODS
  // ==========================================================================

  /*
   * Initiates the authentication flow for a given platform and action type.
   * @dev For action types where there is an action link, user will send payment via the webview itself
   * and automatically transition to the authenticate step
   */
  const initiate = useCallback(
    async (
      platform: string,
      actionType: string,
      options: InitiateOptions = {}
    ): Promise<ProviderSettings> => {
      // Start fresh session for this flow
      dispatch({ type: 'NEW_SESSION' });
      try {
        const aborted = abortAllPending('New session (initiate)');
        if (aborted > 0) {
          logger.info('[zkp2p] Aborted', aborted, 'pending RPC request(s)');
        }
      } catch {}
      const { initialAction, autoGenerateProof } = options;

      // Reset flow data (errors are cleared by transitions ACTION_START/AUTH_OPEN)
      setMetadataList([]);
      setInterceptedPayload(null);
      setProofData([]);

      const { existingProviderConfig } = options;
      let cfg: ProviderSettings;
      if (existingProviderConfig) {
        cfg = existingProviderConfig;
        try {
          setProvider(cfg);
        } catch {}
      } else {
        cfg = await _refetchProviderConfig(platform, actionType);
      }

      // Handle action link if it exists
      const hasAnyActionLink =
        !!cfg.mobile?.internal?.actionLink ||
        !!cfg.mobile?.external?.actionLink;
      if (hasAnyActionLink) {
        // If no initialAction provided, create default options
        const actionOptions = initialAction || { enabled: true };
        await _handleInitialAction(
          cfg,
          actionOptions,
          autoGenerateProof || null
        );
        return cfg;
      }

      return cfg;
    },
    [
      _refetchProviderConfig,
      _handleInitialAction,
      setMetadataList,
      setInterceptedPayload,
      abortAllPending,
      dispatch,
    ]
  );

  /*
   * Authenticates the payment
   * @dev This opens the auth webview and starts the authentication flow
   */
  const authenticate = useCallback(
    async (
      platform: string,
      actionType: string,
      options: AuthenticateOptions = {}
    ) => {
      // Start new session and abort previous RPCs
      dispatch({ type: 'NEW_SESSION' });
      try {
        const aborted = abortAllPending('New session (authenticate)');
        if (aborted > 0) {
          logger.info('[zkp2p] Aborted', aborted, 'pending RPC request(s)');
        }
      } catch {}

      // Ensure no stale state leaks into a new authentication flow
      setProofData([]);
      setMetadataList([]);
      setInterceptedPayload(null);

      const { existingProviderConfig, autoGenerateProof } = options;
      let cfg: ProviderSettings;
      if (existingProviderConfig) {
        cfg = existingProviderConfig;
        try {
          setProvider(cfg);
        } catch {}
      } else {
        cfg = await _refetchProviderConfig(platform, actionType);
      }

      await _authenticateInternal(cfg, autoGenerateProof || null);
    },
    [_refetchProviderConfig, _authenticateInternal, abortAllPending, dispatch]
  );

  /*
   * Minimizes the auth webview
   */
  const minimizeAuthWebView = () => {
    const toValue = isWebViewMinimized ? 0 : 1;

    Animated.timing(slideAnimation, {
      toValue,
      duration: 300,
      useNativeDriver: false,
    }).start();

    setIsWebViewMinimized(!isWebViewMinimized);
  };

  const clearSession = useCallback(
    async (options?: {
      clearInterceptedPayloads?: boolean;
      iosAlsoClearWebKitStore?: boolean;
    }) => {
      await clearSessionService(options);
    },
    []
  );

  // ==========================================================================
  // RESET STATE
  // ==========================================================================
  const resetState = useCallback(async () => {
    try {
      // Cancel native proofs and cleanup memory if using gnark
      if (gnarkBridge) {
        try {
          await gnarkBridge.cancelAllProofs();
        } catch (err) {
          logger.error('[zkp2p] Error cancelling proofs during reset:', err);
        }
        try {
          await gnarkBridge.cleanupMemory();
        } catch (err) {
          logger.error('[zkp2p] Error cleaning up memory during reset:', err);
        }
      }

      // Abort any outstanding RPC promises and remount the RPC channel
      const aborted = abortAllPending('Reset state');
      if (aborted > 0) {
        logger.info('[zkp2p] Aborted', aborted, 'pending RPC request(s)');
      }

      // Reset in-memory state
      setMetadataList([]);
      setProvider(null);
      setInterceptedPayload(null);
      setProofData([]);
      setAutoGenerateOptions(null);
      setLastProofItemIndex(0);
      closeAuthWebView(() => {
        setRpcVisible(false);
        rpcLoadedRef.current = false;
      });
      // Clear any RPC timers and ready waiters
      if (rpcAutoHideTimerRef.current) {
        clearTimeout(rpcAutoHideTimerRef.current);
        rpcAutoHideTimerRef.current = null;
      }
      rpcReadyResolversRef.current = [];

      // Reset flow reducer to initial
      dispatch({ type: 'RESET' });
    } catch (e) {
      logger.error('[zkp2p] Error during resetState:', e);
    }
  }, [
    gnarkBridge,
    abortAllPending,
    setMetadataList,
    setInterceptedPayload,
    setProofData,
    dispatch,
    closeAuthWebView,
  ]);

  // ==========================================================================
  // COMPUTED STYLES
  // ==========================================================================

  const animatedWebViewStyle = useMemo(
    () => ({
      height: slideAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: [Dimensions.get('window').height * 0.9, 48],
      }),
      transform: [
        {
          translateY: openAnimation.interpolate({
            inputRange: [0, 1],
            outputRange: [0, Dimensions.get('window').height],
          }),
        },
      ],
    }),
    [slideAnimation, openAnimation]
  );

  // ==========================================================================
  // EFFECTS
  // ==========================================================================

  // Auto-generate proof effect
  useEffect(() => {
    if (
      flowState === 'authenticated' &&
      autoGenerateOptions && // If it exists, it's enabled
      proofData.length === 0 && // Only auto-generate if no proof exists yet
      provider &&
      interceptedPayload &&
      metadataList.length > 0 &&
      !authError
    ) {
      _handleAutoGenerateProof(
        provider,
        interceptedPayload,
        metadataList,
        autoGenerateOptions
      );
    }
  }, [
    flowState,
    autoGenerateOptions,
    proofData,
    provider,
    interceptedPayload,
    metadataList,
    authError,
    _handleAutoGenerateProof,
  ]);

  // Proof generation animation effect
  useEffect(() => {
    if (flowState === 'proofGenerating') {
      spinAnimation.setValue(0);
      const animation = Animated.loop(
        Animated.timing(spinAnimation, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      animation.start();
      return () => animation.stop();
    } else if (flowState === 'proofGeneratedSuccess') {
      spinAnimation.setValue(0);
      const timer = setTimeout(() => {
        dispatch({ type: 'AUTH_CLOSE' });
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      spinAnimation.setValue(0);
      return () => {};
    }
  }, [flowState, spinAnimation]);

  useEffect(
    () => () => {
      abortAllPending('Component unmounted');
    },
    [abortAllPending]
  );

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <Zkp2pContext.Provider
      value={{
        provider,
        flowState,
        authError,
        proofError,
        metadataList,
        interceptedPayload,
        initiate,
        authenticate,
        authWebViewProps,
        closeAuthWebView,
        generateProof,
        proofData,
        zkp2pClient,
        clearSession,
        resetState,
      }}
    >
      {children}
      {authWebViewProps && (
        <Animated.View
          style={[styles.nativeWebviewOverlay, animatedWebViewStyle]}
        >
          <View style={styles.nativeWebviewContainer}>
            <TouchableOpacity
              style={styles.nativeHeader}
              onPress={minimizeAuthWebView}
              activeOpacity={0.9}
            >
              <View style={styles.headerContent}>
                <View style={styles.headerTitleContainer} />
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    closeAuthWebView();
                  }}
                  style={styles.nativeCloseButton}
                >
                  <Text style={styles.nativeCloseText}>×</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
            <View
              style={[
                styles.webviewWrapper,
                isWebViewMinimized && styles.webviewWrapperHidden,
              ]}
            >
              <InterceptWebView
                ref={authWebViewRef}
                nativeID="auth-webview"
                testID="auth-webview"
                {...authWebViewProps}
                style={styles.nativeWebview}
              />
            </View>
          </View>
        </Animated.View>
      )}
      {rpcVisible && <RPCWebView {...rpcWebViewProps} />}

      {/* Proof Generation Spinner */}
      {(flowState === 'proofGenerating' ||
        flowState === 'proofGeneratedSuccess' ||
        flowState === 'proofGeneratedFailure') && (
        <Modal transparent animationType="fade" visible={true}>
          <View style={styles.proofSpinnerBackdrop}>
            <View style={styles.proofSpinnerCard}>
              {/* Exit button in top right */}
              <TouchableOpacity
                style={styles.proofSpinnerExitButton}
                onPress={async () => {
                  logger.info(
                    '[zkp2p] Exit button pressed, cancelling proof generation'
                  );

                  // Cancel the proof generation if using gnark
                  if (gnarkBridge && flowState === 'proofGenerating') {
                    try {
                      await gnarkBridge.cancelAllProofs();
                      logger.info('[zkp2p] All proof generations cancelled');
                    } catch (err) {
                      logger.error('[zkp2p] Error cancelling proofs:', err);
                    }
                  }

                  // Clean up state
                  dispatch({ type: 'PROOF_DISMISS' });

                  // Clean up memory if using gnark
                  if (gnarkBridge) {
                    try {
                      await gnarkBridge.cleanupMemory();
                      logger.info('[zkp2p] Memory cleaned up');
                    } catch (err) {
                      logger.error('[zkp2p] Error cleaning up memory:', err);
                    }
                  }

                  // Abort any outstanding RPC promises and remount the RPC channel
                  const aborted = abortAllPending('User cancelled');
                  if (aborted > 0) {
                    logger.info(
                      '[zkp2p] Aborted',
                      aborted,
                      'pending RPC request(s)'
                    );
                  }
                }}
              >
                <Text style={styles.proofSpinnerExitText}>×</Text>
              </TouchableOpacity>

              <Text style={styles.proofSpinnerTitle}>
                {flowState === 'proofGeneratedSuccess'
                  ? 'Successfully Verified!'
                  : flowState === 'proofGeneratedFailure'
                    ? 'Verification Failed'
                    : 'Verifying...'}
              </Text>

              <View style={styles.proofSpinnerWrapper}>
                <AnimatedSvg
                  width={128}
                  height={128}
                  style={[
                    styles.proofSpinnerRing,
                    {
                      transform: [
                        {
                          rotate: spinAnimation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '360deg'],
                          }),
                        },
                      ],
                    },
                  ]}
                  viewBox="0 0 128 128"
                >
                  <Circle
                    cx="64"
                    cy="64"
                    r="58"
                    stroke={
                      flowState === 'proofGeneratedSuccess'
                        ? '#27ae60'
                        : flowState === 'proofGeneratedFailure'
                          ? '#e74c3c'
                          : '#555'
                    }
                    strokeWidth="6"
                    fill="none"
                    opacity={flowState !== 'proofGenerating' ? 0.5 : 1}
                  />
                  {/* Animated arc (colored) */}
                  {flowState === 'proofGenerating' && (
                    <Circle
                      cx="64"
                      cy="64"
                      r="58"
                      stroke="#ffbd4a"
                      strokeWidth="6"
                      fill="none"
                      strokeDasharray="91.1 273.3" // ~25% of circumference
                      strokeLinecap="round"
                      transform="rotate(-90 64 64)" // Start from top
                    />
                  )}
                </AnimatedSvg>

                {/* Logo in center (always) */}
                <Image
                  source={require('../assets/logo192.png')}
                  style={styles.proofSpinnerLogoImage}
                />
              </View>

              {flowState === 'proofGeneratedFailure' ? (
                <>
                  <Text style={styles.proofSpinnerSubtitle}>
                    {proofError?.message ||
                      'An error occurred while verifying payment'}
                  </Text>
                  <TouchableOpacity
                    style={styles.retryButton}
                    onPress={async () => {
                      if (!provider || !interceptedPayload) return;
                      try {
                        const intentHash =
                          '0x0000000000000000000000000000000000000000000000000000000000000001';
                        await generateProof(
                          provider,
                          interceptedPayload,
                          intentHash,
                          lastProofItemIndex
                        );
                      } catch (err) {
                        logger.error('[zkp2p] Retry failed:', err);
                      }
                    }}
                  >
                    <Text style={styles.retryButtonText}>Retry</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={() => dispatch({ type: 'PROOF_DISMISS' })}
                  >
                    <Text style={styles.closeButtonText}>Close</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.proofSpinnerSubtitle}>
                    {flowState === 'proofGeneratedSuccess'
                      ? 'Payment Verified!'
                      : 'Verifying Payment'}
                  </Text>
                </>
              )}

              <Text style={styles.proofSpinnerPoweredBy}>Secured by ZKP2P</Text>
            </View>
          </View>
        </Modal>
      )}
    </Zkp2pContext.Provider>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  // WebView overlay styles
  nativeWebviewOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 999,
  },
  nativeWebviewContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  nativeHeader: {
    height: 48,
    width: '100%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '100%',
  },
  headerTitleContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nativeCloseButton: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 18,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nativeCloseText: {
    fontSize: 20,
    color: '#666',
    lineHeight: 20,
  },
  nativeWebview: {
    flex: 1,
    backgroundColor: '#fff',
  },
  webviewWrapper: {
    flex: 1,
  },
  webviewWrapperHidden: {
    height: 0,
    overflow: 'hidden',
  },

  // Proof Generation Spinner styles
  proofSpinnerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  proofSpinnerCard: {
    backgroundColor: '#171717',
    borderRadius: 12,
    paddingVertical: 28,
    paddingHorizontal: 32,
    width: '90%',
    maxWidth: 400,
    minHeight: 380,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 10,
  },
  proofSpinnerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginTop: 12,
    marginBottom: 0,
  },
  proofSpinnerWrapper: {
    width: 128,
    height: 128,
    marginTop: 32,
    marginBottom: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  proofSpinnerRing: {
    position: 'absolute',
  },
  proofSpinnerSubtitle: {
    fontSize: 14,
    color: '#fff',
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 20,
  },
  proofSpinnerPoweredBy: {
    fontSize: 12,
    color: '#777',
    marginTop: 'auto',
    marginBottom: 12,
  },
  proofSpinnerLogoImage: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },

  // Button styles
  retryButton: {
    backgroundColor: '#ffbd4a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 20,
  },
  retryButtonText: {
    color: '#171717',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 10,
  },
  closeButtonText: {
    color: '#aaa',
    fontSize: 14,
  },

  // Proof spinner exit button styles
  proofSpinnerExitButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
    zIndex: 10,
  },
  proofSpinnerExitText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '400',
    lineHeight: 20,
  },
});

export default Zkp2pProvider;
