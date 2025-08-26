import 'fast-text-encoding';

export { useZkp2p } from './hooks/useZkp2p';
export { Zkp2pProvider, Zkp2pContext } from './providers';
export { Zkp2pClient } from './client';
export { clearSession } from './utils/session';
export { DEPLOYED_ADDRESSES } from './utils/constants';
export { currencyInfo } from './utils/currency';
export { apiGetOwnerDeposits, apiGetIntentsByTaker } from './adapters/api';
export { setLogLevel } from './utils/logger';
export type { LogLevel } from './utils/logger';

// Error handling exports
export {
  ZKP2PError,
  NetworkError,
  APIError,
  ContractError,
  ValidationError,
  ProofGenerationError,
  ErrorCode,
} from './errors';

export type {
  ExtractedMetadataList,
  NetworkEvent,
  ProviderSettings,
  ProofData,
  FlowState,
  InitiateOptions,
  AuthenticateOptions,
  AutoGenerateProofOptions,
  SignalIntentParams,
  FulfillIntentParams,
  SignalIntentResponse,
  WithdrawDepositParams,
  CancelIntentParams,
  ReleaseFundsToPayerParams,
  CreateDepositParams,
  PostDepositDetailsRequest,
  DepositVerifierData,
  Currency,
  IntentSignalRequest,
  QuoteRequest,
  QuoteResponse,
  GetPayeeDetailsRequest,
  GetPayeeDetailsResponse,
  GetOwnerDepositsRequest,
  GetOwnerDepositsResponse,
  GetIntentsByTakerRequest,
  GetIntentsByTakerResponse,
  Deposit,
  DepositStatus,
  Intent,
  IntentStatusType,
  AuthWVOverrides,
} from './types';
export type { ClearSessionOptions } from './utils/session';

export type { GnarkBridge, GnarkProofResult } from './bridges';
