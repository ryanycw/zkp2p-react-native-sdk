import type { WalletClient, Hash } from 'viem';
import type { Range } from './contract';
import type { CurrencyType } from '../utils/currency';
import type { ReclaimProof } from '../utils/reclaimProof';
import type { InterceptWebView } from '@zkp2p/react-native-webview-intercept';

export interface AuthWVOverrides
  extends Partial<React.ComponentProps<typeof InterceptWebView>> {}

// Define options interfaces to match Zkp2pContext.ts
export interface InitialActionOptions {
  enabled?: boolean;
  paymentDetails?: Record<string, string>; // Generic details for both URL and JS injection
  // Runtime override for internal vs external action preference.
  // If provided, this overrides the provider config's mobile.useExternalAction.
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
  autoGenerateProof?: AutoGenerateProofOptions; // true for defaults, object for custom config
  skipAction?: boolean; // Skip action step and go straight to authentication
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
  prover: 'reclaim_gnark' | 'reclaim_snarkjs' | 'primus_proxy';
  walletClient: WalletClient;
  apiKey: string;
  chainId: number;
  baseApiUrl?: string;
  witnessUrl?: string;
  rpcUrl?: string;
  logLevel?: 'silent' | 'error' | 'info' | 'debug';
  pollingInterval?: number; // ms
}

export type TxCallbackParams = {
  hash: Hash;
  data?: any;
};

export type ActionCallback = (params: TxCallbackParams) => void;

export type FulfillIntentParams = {
  paymentProofs: ProofData[];
  intentHash: Hash;
  paymentMethod?: number;
  onSuccess?: ActionCallback;
  onError?: (error: Error) => void;
  onMined?: ActionCallback;
};

export type CancelIntentParams = {
  intentHash: Hash;
  onSuccess?: ActionCallback;
  onError?: (error: Error) => void;
  onMined?: ActionCallback;
};

export type ReleaseFundsToPayerParams = {
  intentHash: Hash;
  onSuccess?: ActionCallback;
  onError?: (error: Error) => void;
  onMined?: ActionCallback;
};

export type WithdrawDepositParams = {
  depositId: string;
  onSuccess?: ActionCallback;
  onError?: (error: Error) => void;
  onMined?: ActionCallback;
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
  responseObject: {
    isValid: boolean;
    errors?: string[];
  };
  statusCode: number;
};

export type DepositStatus = 'ACTIVE' | 'WITHDRAWN' | 'CLOSED';

export type Deposit = {
  id: string;
  owner: string;
  amount: string;
  minimumIntent: string;
  maximumIntent: string;
  status: DepositStatus;
  updatedAt: Date;
  createdAt: Date;
  processorPaymentData: Array<{
    processor: string;
    paymentDetailsHash: string;
    isHashed: boolean;
    paymentDetails: string;
    updatedAt: Date;
    createdAt: Date;
  }>;
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

export type IntentStatusType =
  | 'CREATED'
  | 'FULFILLED'
  | 'CANCELLED'
  | 'RELEASED'
  | 'EXPIRED';

export type Intent = {
  id: number;
  intentHash: string;
  depositId: number;
  owner: string;
  toAddress: string;
  amount: string;
  status: IntentStatusType;
  signalTxHash: string;
  signalTimestamp: Date;
  fulfillTxHash: string | null;
  fulfillTimestamp: Date | null;
  pruneTxHash: string | null;
  prunedTimestamp: Date | null;
  chainId?: number;
  fiatCurrency: string;
  conversionRate: string;
  verifier: string;
  sustainabilityFee: string | null;
  verifierFee: string | null;
  updatedAt: Date;
  createdAt: Date;
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

export type OrderStats = {
  depositId: string;
  totalOrderCount: number;
  totalOrderAmount: string;
  fulfilledOrderCount: number;
  fulfilledOrderAmount: string;
  cancelledOrderCount: number;
  cancelledOrderAmount: string;
  releasedOrderCount: number;
  releasedOrderAmount: string;
  expiredOrderCount: number;
  expiredOrderAmount: string;
  createdOrderCount: number;
  createdOrderAmount: string;
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
}

export interface AdditionalProof {
  url: string;
  method: string;
  body: string;
  paramNames: string[];
  paramSelectors: Selector[];
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
  paramSelectors: Selector[];
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
} from './escrowViews';
