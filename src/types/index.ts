import type { WalletClient, Hash, AuthorizationList, AccessList } from 'viem';
import type { Range } from './contract';
import type { CurrencyType } from '../utils/currency';
import type { ReclaimProof } from '../utils/reclaimProof';
import type { InterceptWebView } from '@zkp2p/react-native-webview-intercept';

export interface AuthWVOverrides
  extends Partial<React.ComponentProps<typeof InterceptWebView>> {}

// ----------------------------------------------------------------------------
// Credentials & Storage (for host-provided secure persistence)
// ----------------------------------------------------------------------------

export type Credentials = {
  username?: string;
  password: string;
};

export type CredentialsSelectors = {
  usernameSelector?: string;
  passwordSelector: string;
  submitSelector?: string;
  nextSelector?: string;
};

// Minimal storage interface implemented by the host app (e.g., via expo-secure-store)
export interface Storage {
  get(key: string): unknown | Promise<unknown>;
  put(key: string, value: unknown): void | Promise<void>;
  del(key: string): void | Promise<void>;
  getKeys(): string[] | Promise<string[]>;
}

// Define options interfaces to match Zkp2pContext.ts
export interface InitialActionOptions {
  enabled?: boolean;
  paymentDetails?: Record<string, string>; // Generic details for both URL and JS injection
  useExternalActionOverride?: boolean;
}

export interface AutoGenerateProofOptions {
  intentHash?: string; // Optional custom intent hash
  itemIndex?: number; // Optional item index, defaults to 0
  onProofGenerated?: (proofData: ProofData) => void; // Success callback
  onProofError?: (error: Error) => void; // Error callback
}

export interface InitiateOptions {
  authOverrides?: AuthWVOverrides;
  existingProviderConfig?: ProviderSettings;
  initialAction?: InitialActionOptions;
  autoGenerateProof?: AutoGenerateProofOptions;
}

export interface AuthenticateOptions {
  authOverrides?: AuthWVOverrides;
  existingProviderConfig?: ProviderSettings;
  autoGenerateProof?: AutoGenerateProofOptions; // true for defaults, object for custom config
}

export type {
  DepositView,
  IntentView,
  Range,
  DepositVerifierData,
  Currency,
} from './contract';

export type Address = `0x${string}`;

export interface Zkp2pClientOptions {
  prover: 'reclaim_gnark' | 'reclaim_snarkjs' | 'primus_proxy' | 'tlsn_prover';
  walletClient?: WalletClient;
  apiKey?: string;
  chainId: number;
  environment?: 'production' | 'staging';
  baseApiUrl?: string;
  witnessUrl?: string;
  rpcUrl?: string;
}

export type TxCallbackParams = {
  hash: Hash;
  data?: any;
};

export type ActionCallback = (params: TxCallbackParams) => void;

// Simple safe overrides (internally constrained to broadly-supported fields)
export type SafeTxOverrides = {
  gas?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
  accessList?: AccessList;
  authorizationList?: AuthorizationList;
};

export type FulfillIntentParams = {
  paymentProofs: ProofData[];
  intentHash: Hash;
  paymentMethod?: number;
  onSuccess?: ActionCallback;
  onError?: (error: Error) => void;
  onMined?: ActionCallback;
  txOverrides?: SafeTxOverrides;
};

export type CancelIntentParams = {
  intentHash: Hash;
  onSuccess?: ActionCallback;
  onError?: (error: Error) => void;
  onMined?: ActionCallback;
  txOverrides?: SafeTxOverrides;
};

export type ReleaseFundsToPayerParams = {
  intentHash: Hash;
  onSuccess?: ActionCallback;
  onError?: (error: Error) => void;
  onMined?: ActionCallback;
  txOverrides?: SafeTxOverrides;
};

export type WithdrawDepositParams = {
  depositId: string;
  onSuccess?: ActionCallback;
  onError?: (error: Error) => void;
  onMined?: ActionCallback;
  txOverrides?: SafeTxOverrides;
};

export type SignalIntentParams = {
  processorName: string;
  depositId: string;
  tokenAmount: string;
  payeeDetails: string;
  toAddress: string;
  currency: CurrencyType;
  onSuccess?: ActionCallback;
  onError?: (error: Error) => void;
  onMined?: ActionCallback;
  txOverrides?: SafeTxOverrides;
};

export type CreateDepositConversionRate = {
  currency: CurrencyType;
  conversionRate: string;
};

export type CreateDepositParams = {
  token: Address;
  amount: bigint;
  intentAmountRange: Range;
  conversionRates: CreateDepositConversionRate[][];
  processorNames: string[];
  depositData: {
    [key: string]: string;
  }[];
  onSuccess?: ActionCallback;
  onError?: (error: Error) => void;
  onMined?: ActionCallback;
  txOverrides?: SafeTxOverrides; // applied to approval and createDeposit
};

export type IntentSignalRequest = {
  processorName: string;
  depositId: string;
  tokenAmount: string;
  payeeDetails: string;
  toAddress: string;
  fiatCurrencyCode: string;
  chainId: string;
};

export type SignalIntentResponse = {
  success: boolean;
  message: string;
  responseObject: {
    depositData: Record<string, any>;
    signedIntent: string;
    intentData: {
      depositId: string;
      tokenAmount: string;
      recipientAddress: string;
      verifierAddress: string;
      currencyCodeHash: string;
      gatingServiceSignature: string;
    };
  };
  statusCode: number;
};

export type PostDepositDetailsRequest = {
  depositData: {
    [key: string]: string;
  };
  processorName: string;
};

export type PostDepositDetailsResponse = {
  success: boolean;
  message: string;
  responseObject: {
    id: number;
    processorName: string;
    depositData: {
      [key: string]: string;
    };
    hashedOnchainId: string;
    createdAt: string;
  };
  statusCode: number;
};

export type QuoteRequest = {
  paymentPlatforms: string[];
  fiatCurrency: string;
  user: string;
  recipient: string;
  destinationChainId: number;
  destinationToken: string;
  referrer?: string;
  useMultihop?: boolean;
  quotesToReturn?: number;
  amount: string;
  isExactFiat?: boolean; // defaults to true
};

export type FiatResponse = {
  currencyCode: string;
  currencyName: string;
  currencySymbol: string;
  countryCode: string;
};

export type TokenResponse = {
  token: string;
  decimals: number;
  name: string;
  symbol: string;
  chainId: number;
};

export type QuoteIntentResponse = {
  depositId: string;
  processorName: string;
  amount: string;
  toAddress: string;
  payeeDetails: string;
  processorIntentData: any;
  fiatCurrencyCode: string;
  chainId: string;
  // Optional metadata from backend v2
  escrowAddress?: string;
};

export type QuoteSingleResponse = {
  fiatAmount: string;
  fiatAmountFormatted: string;
  tokenAmount: string;
  tokenAmountFormatted: string;
  paymentMethod: string;
  payeeAddress: string;
  conversionRate: string;
  intent: QuoteIntentResponse;
  payeeData?: {
    [key: string]: string;
  };
};

export type QuoteFeesResponse = {
  zkp2pFee: string;
  zkp2pFeeFormatted: string;
  swapFee: string;
  swapFeeFormatted: string;
};

export type QuoteResponse = {
  message: string;
  success: boolean;
  responseObject: {
    fiat: FiatResponse;
    token: TokenResponse;
    quotes: QuoteSingleResponse[];
    fees: QuoteFeesResponse;
  };
  statusCode: number;
};

export type GetPayeeDetailsRequest = {
  hashedOnchainId: string;
  platform: string;
};

export type GetPayeeDetailsResponse = {
  success: boolean;
  message: string;
  responseObject: {
    id: number;
    processorName: string;
    depositData: {
      [key: string]: string;
    };
    hashedOnchainId: string;
    createdAt: string;
  };
  statusCode: number;
};

export type ValidatePayeeDetailsRequest = {
  processorName: string;
  depositData: {
    [key: string]: string;
  };
};

export type ValidatePayeeDetailsResponse = {
  success: boolean;
  message: string;
  responseObject: boolean;
  statusCode: number;
};

export type DepositStatus = 'ACTIVE' | 'WITHDRAWN' | 'CLOSED';

export type DepositVerifierCurrency = {
  id: number;
  depositVerifierId: number;
  currencyCode: string; // bytes32 hash as hex string
  conversionRate: string;
  createdAt: Date;
  updatedAt: Date;
};

export type DepositVerifier = {
  id: number;
  depositId: number;
  verifier: Address;
  intentGatingService: Address;
  payeeDetailsHash: string;
  data: string;
  createdAt: Date;
  updatedAt: Date;
  currencies: DepositVerifierCurrency[];
};

export type Deposit = {
  id: number;
  depositor: Address;
  token: Address;
  amount: string;
  remainingDeposits: string;
  intentAmountMin: string;
  intentAmountMax: string;
  acceptingIntents: boolean;
  outstandingIntentAmount: string;
  availableLiquidity: string;
  status: DepositStatus;
  totalIntents: number;
  signaledIntents: number;
  fulfilledIntents: number;
  prunedIntents: number;
  createdAt: Date;
  updatedAt: Date;
  verifiers: DepositVerifier[];
  // Optional metadata from backend v2
  escrowAddress?: Address;
};

export type GetOwnerDepositsRequest = {
  ownerAddress: string;
  status?: DepositStatus;
};

export type GetOwnerDepositsResponse = {
  success: boolean;
  message: string;
  responseObject: Deposit[];
  statusCode: number;
};

export type IntentStatusType = 'SIGNALED' | 'FULFILLED' | 'PRUNED';

// API: /orders/* response type
export type Intent = {
  id: number;
  intentHash: string;
  status: IntentStatusType;
  depositId: string; // API returns string
  verifier: Address;
  owner: Address;
  toAddress: Address;
  amount: string;
  fiatCurrency: string;
  conversionRate: string;
  sustainabilityFee: string | null;
  verifierFee: string | null;
  signalTxHash: string;
  signalTimestamp: Date;
  fulfillTxHash: string | null;
  fulfillTimestamp: Date | null;
  pruneTxHash: string | null;
  prunedTimestamp: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Optional metadata from backend v2
  escrowAddress?: Address;
  orchestratorAddress?: Address;
  paymentMethodHash?: string | null;
};

export type GetOwnerIntentsRequest = {
  ownerAddress: string;
};

export type GetOwnerIntentsResponse = {
  success: boolean;
  message: string;
  responseObject: Intent[];
  statusCode: number;
};

// Orders API types
export type GetIntentsByDepositRequest = {
  depositId: string;
  status?: IntentStatusType | IntentStatusType[];
};

export type GetIntentsByDepositResponse = {
  success: boolean;
  message: string;
  responseObject: Intent[];
  statusCode: number;
};

export type GetIntentsByTakerRequest = {
  takerAddress: string;
  status?: IntentStatusType | IntentStatusType[];
};

export type GetIntentsByTakerResponse = {
  success: boolean;
  message: string;
  responseObject: Intent[];
  statusCode: number;
};

export type GetIntentByHashRequest = {
  intentHash: string;
};

export type GetIntentByHashResponse = {
  success: boolean;
  message: string;
  responseObject: Intent;
  statusCode: number;
};

// Deposits API types
export type GetDepositByIdRequest = {
  depositId: string;
};

export type GetDepositByIdResponse = {
  success: boolean;
  message: string;
  responseObject: Deposit;
  statusCode: number;
};

// Intent/order statistics returned by `/deposits/order-stats`
export type OrderStats = {
  id: number;
  totalIntents: number;
  signaledIntents: number;
  fulfilledIntents: number;
  prunedIntents: number;
};

export type GetDepositsOrderStatsRequest = {
  depositIds: number[];
};

export type GetDepositsOrderStatsResponse = {
  success: boolean;
  message: string;
  responseObject: OrderStats[];
  statusCode: number;
};

export type ExtractedMetadataList = {
  [k: string]: any; // dynamic columns
  hidden: boolean;
  originalIndex: number;
};

export interface Selector {
  type: string;
  value: string;
}

// Extended selector allowing selection from multiple sources.
export interface ParamSelector extends Selector {
  // Defaults to 'responseBody' for backward compatibility
  source?:
    | 'responseBody'
    | 'requestBody'
    | 'requestHeaders'
    | 'responseHeaders'
    | 'url';
}

export interface ResponseMatch extends Selector {
  hash?: boolean;
}

export interface ResponseRedaction {
  jsonPath?: string;
  xPath?: string;
  regex?: string;
}

export interface TransactionsExtraction {
  transactionJsonPathListSelector: string;
  transactionJsonPathSelectors: Record<string, string>;
}

export interface ProviderMetadata {
  platform: string;
  urlRegex: string;
  method: string;
  fallbackUrlRegex: string;
  fallbackMethod: string;
  preprocessRegex: string;
  shouldReplayRequestInPage?: boolean;
  transactionsExtraction: TransactionsExtraction;
  proofMetadataSelectors: Selector[];
  metadataUrl?: string;
  metadataUrlMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  metadataUrlBody?: string;
}

export interface AdditionalProof {
  url: string;
  method: string;
  body: string;
  paramNames: string[];
  paramSelectors: ParamSelector[];
  skipRequestHeaders: string[];
  secretHeaders: string[];
  responseMatches: ResponseMatch[];
  responseRedactions: ResponseRedaction[];
}

export interface ProviderSettings {
  actionType: string;
  authLink: string;
  url: string;
  method: string;
  skipRequestHeaders: string[];
  body: string;
  countryCode?: string;
  metadata: ProviderMetadata;
  paramNames: string[];
  paramSelectors: ParamSelector[];
  secretHeaders: string[];
  responseMatches: ResponseMatch[];
  responseRedactions: ResponseRedaction[];
  additionalProofs?: AdditionalProof[];
  mobile?: {
    includeAdditionalCookieDomains: string[];
    useExternalAction?: boolean; // prefer external action when true; otherwise prefer internal
    userAgent?: {
      android: string;
      ios: string;
    };
    internal?: {
      actionLink: string;
      actionCompletedUrlRegex?: string;
      injectedJavaScript?: string;
      injectedJavaScriptParamNames?: string[];
    };
    external?: {
      actionLink: string;
      appStoreLink?: string;
      playStoreLink?: string;
    };
    login?: {
      usernameSelector?: string;
      passwordSelector: string;
      submitSelector?: string;
      nextSelector?: string;
      revealTimeoutMs?: number;
    };
  };
}

export interface NetworkEvent {
  type: 'network';
  api: 'fetch' | 'xhr' | 'html';
  request: {
    url: string;
    method?: string;
    headers: Record<string, string>;
    body?: string | null;
    cookie: string | null;
  };
  response: {
    url: string;
    status: number;
    headers: Record<string, string>;
    body: string | null;
  };
}

export type RPCResponse = {
  module: 'attestor-core';
  id: string;
  type: string;
  response?: any;
  step?: any;
  error?: { data: { message: string; stack?: string } };
};

export type PendingEntry = {
  resolve: (r: RPCResponse) => void;
  reject: (e: Error) => void;
  timeout: NodeJS.Timeout | number;
  onStep?: (step: RPCResponse) => void;
};

export type ProofData = {
  proofType: 'reclaim';
  proof: ReclaimProof;
};

export type FlowState =
  | 'idle'
  | 'authenticating'
  | 'authenticated'
  | 'actionStarted'
  | 'proofGenerating'
  | 'proofGeneratedSuccess'
  | 'proofGeneratedFailure';

// Export on-chain view types
export type {
  EscrowRange,
  EscrowDepositView,
  EscrowIntentView,
  EscrowVerifierDataView,
} from './escrowViews';
