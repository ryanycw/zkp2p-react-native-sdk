import type {
  IntentSignalRequest,
  PostDepositDetailsRequest,
  SignalIntentResponse,
  PostDepositDetailsResponse,
  QuoteRequest,
  QuoteResponse,
  GetPayeeDetailsRequest,
  GetPayeeDetailsResponse,
  ValidatePayeeDetailsRequest,
  ValidatePayeeDetailsResponse,
  GetOwnerDepositsRequest,
  GetOwnerDepositsResponse,
  Deposit,
  GetOwnerIntentsRequest,
  GetOwnerIntentsResponse,
  Intent,
  GetIntentsByDepositRequest,
  GetIntentsByDepositResponse,
  GetIntentsByTakerRequest,
  GetIntentsByTakerResponse,
  GetIntentByHashRequest,
  GetIntentByHashResponse,
  GetDepositByIdRequest,
  GetDepositByIdResponse,
  GetDepositsOrderStatsRequest,
  GetDepositsOrderStatsResponse,
} from '../types';
import { NetworkError, ValidationError } from '../errors';
import { parseAPIError, withRetry } from '../errors/utils';
import { buildQueryString } from '../utils/query';

function headers() {
  return { 'Content-Type': 'application/json' } as const;
}

function createHeadersWithApiKey(apiKey: string) {
  return { 'Content-Type': 'application/json', 'x-api-key': apiKey } as const;
}

// Helper function to transform date strings to Date objects
function transformDatesToObjects<T extends Record<string, any>>(obj: T): T {
  const dateFields = ['createdAt', 'updatedAt'];
  const transformed = { ...obj };

  for (const key in transformed) {
    const value = transformed[key];

    if (dateFields.includes(key) && typeof value === 'string') {
      transformed[key] = new Date(value) as any;
    } else if (Array.isArray(value)) {
      transformed[key] = value.map((item: any) =>
        typeof item === 'object' && item !== null
          ? transformDatesToObjects(item)
          : item
      ) as any;
    } else if (typeof value === 'object' && value !== null) {
      transformed[key] = transformDatesToObjects(value) as any;
    }
  }

  return transformed;
}

export async function apiSignalIntent(
  req: IntentSignalRequest,
  apiKey: string,
  baseApiUrl: string
): Promise<SignalIntentResponse> {
  return withRetry(async () => {
    let res: Response;
    try {
      res = await fetch(`${baseApiUrl}/verify/intent`, {
        method: 'POST',
        headers: createHeadersWithApiKey(apiKey),
        body: JSON.stringify(req),
      });
    } catch (error) {
      throw new NetworkError('Failed to connect to API server', {
        endpoint: '/verify/intent',
        error,
      });
    }

    if (!res.ok) {
      const errorText = await res.text();
      throw parseAPIError(res, errorText);
    }

    return res.json();
  });
}

export async function apiPostDepositDetails(
  req: PostDepositDetailsRequest,
  apiKey: string,
  baseApiUrl: string
): Promise<PostDepositDetailsResponse> {
  return withRetry(async () => {
    let res: Response;
    try {
      res = await fetch(`${baseApiUrl}/makers/create`, {
        method: 'POST',
        headers: createHeadersWithApiKey(apiKey),
        body: JSON.stringify(req),
      });
    } catch (error) {
      throw new NetworkError('Failed to connect to API server', {
        endpoint: '/makers/create',
        error,
      });
    }

    if (!res.ok) {
      const errorText = await res.text();
      throw parseAPIError(res, errorText);
    }

    return res.json();
  });
}

export async function apiGetQuote(
  req: QuoteRequest,
  baseApiUrl: string
): Promise<QuoteResponse> {
  // Validate quotesToReturn if provided
  if (req.quotesToReturn !== undefined) {
    if (!Number.isInteger(req.quotesToReturn) || req.quotesToReturn < 1) {
      throw new ValidationError(
        'quotesToReturn must be a positive integer',
        'quotesToReturn'
      );
    }
  }

  // Default isExactFiat to true if not specified
  const isExactFiat = req.isExactFiat !== false;

  // Determine endpoint based on isExactFiat
  const endpoint = isExactFiat ? 'exact-fiat' : 'exact-token';

  // Build URL with query parameters
  let url = `${baseApiUrl}/quote/${endpoint}`;
  if (req.quotesToReturn) {
    url += `?quotesToReturn=${req.quotesToReturn}`;
  }

  // Create request body with appropriate field name
  const requestBody = {
    ...req,
    [isExactFiat ? 'exactFiatAmount' : 'exactTokenAmount']: req.amount,
    // Remove our custom fields before sending to API
    amount: undefined,
    isExactFiat: undefined,
    quotesToReturn: undefined, // Remove from body since it's in query params
  };

  // Clean up undefined fields
  Object.keys(requestBody).forEach((key) => {
    if (requestBody[key as keyof typeof requestBody] === undefined) {
      delete requestBody[key as keyof typeof requestBody];
    }
  });

  return withRetry(async () => {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      throw new NetworkError('Failed to connect to API server', {
        endpoint: `/quote/${endpoint}`,
        error,
      });
    }

    if (!res.ok) {
      const errorText = await res.text();
      throw parseAPIError(res, errorText);
    }

    return res.json();
  });
}

export async function apiGetPayeeDetails(
  req: GetPayeeDetailsRequest,
  apiKey: string,
  baseApiUrl: string
): Promise<GetPayeeDetailsResponse> {
  return withRetry(async () => {
    let res: Response;
    const endpoint = `/makers/${req.platform}/${req.hashedOnchainId}`;

    try {
      res = await fetch(`${baseApiUrl}${endpoint}`, {
        method: 'GET',
        headers: createHeadersWithApiKey(apiKey),
      });
    } catch (error) {
      throw new NetworkError('Failed to connect to API server', {
        endpoint,
        error,
      });
    }

    if (!res.ok) {
      const errorText = await res.text();
      throw parseAPIError(res, errorText);
    }

    return res.json();
  });
}

export async function apiValidatePayeeDetails(
  req: ValidatePayeeDetailsRequest,
  apiKey: string,
  baseApiUrl: string
): Promise<ValidatePayeeDetailsResponse> {
  return withRetry(async () => {
    let res: Response;
    const endpoint = '/makers/validate';

    try {
      res = await fetch(`${baseApiUrl}${endpoint}`, {
        method: 'POST',
        headers: createHeadersWithApiKey(apiKey),
        body: JSON.stringify(req),
      });
    } catch (error) {
      throw new NetworkError('Failed to connect to API server', {
        endpoint,
        error,
      });
    }

    if (!res.ok) {
      const errorText = await res.text();
      throw parseAPIError(res, errorText);
    }

    return res.json();
  });
}

export async function apiGetOwnerDeposits(
  req: GetOwnerDepositsRequest,
  apiKey: string,
  baseApiUrl: string,
  escrowAddress?: string
): Promise<GetOwnerDepositsResponse> {
  return withRetry(async () => {
    let res: Response;
    let endpoint = `/deposits/maker/${req.ownerAddress}`;

    // Add required escrowAddress and optional status query parameters
    const qs = buildQueryString({
      escrowAddress,
      status: req.status,
    });
    if (qs) endpoint += `?${qs}`;

    try {
      res = await fetch(`${baseApiUrl}${endpoint}`, {
        method: 'GET',
        headers: createHeadersWithApiKey(apiKey),
      });
    } catch (error) {
      throw new NetworkError('Failed to connect to API server', {
        endpoint,
        error,
      });
    }

    if (!res.ok) {
      const errorText = await res.text();
      throw parseAPIError(res, errorText);
    }

    const data = await res.json();

    // Transform date strings to Date objects for all deposits
    if (data.responseObject && Array.isArray(data.responseObject)) {
      data.responseObject = data.responseObject.map((deposit: Deposit) =>
        transformDatesToObjects(deposit)
      );
    }

    return data;
  });
}

export async function apiGetOwnerIntents(
  req: GetOwnerIntentsRequest,
  apiKey: string,
  baseApiUrl: string,
  escrowAddress?: string
): Promise<GetOwnerIntentsResponse> {
  return withRetry(async () => {
    let res: Response;
    let endpoint = `/orders/maker/${req.ownerAddress}`;

    // Add required escrowAddress query parameter
    const qs = buildQueryString({ escrowAddress });
    if (qs) endpoint += `?${qs}`;

    try {
      res = await fetch(`${baseApiUrl}${endpoint}`, {
        method: 'GET',
        headers: createHeadersWithApiKey(apiKey),
      });
    } catch (error) {
      throw new NetworkError('Failed to connect to API server', {
        endpoint,
        error,
      });
    }

    if (!res.ok) {
      const errorText = await res.text();
      throw parseAPIError(res, errorText);
    }

    const data = await res.json();

    // Transform date strings to Date objects for all intents
    if (data.responseObject && Array.isArray(data.responseObject)) {
      data.responseObject = data.responseObject.map((intent: Intent) =>
        transformDatesToObjects(intent)
      );
    }

    return data;
  });
}

/**
 * Get intents by deposit ID with optional status filter
 */
export async function apiGetIntentsByDeposit(
  req: GetIntentsByDepositRequest,
  apiKey: string,
  baseApiUrl: string,
  escrowAddress?: string
): Promise<GetIntentsByDepositResponse> {
  return withRetry(async () => {
    let res: Response;
    let endpoint = `/orders/deposit/${req.depositId}`;

    // Add required escrowAddress and optional status query parameters
    const qs = buildQueryString({
      escrowAddress,
      status: req.status,
    });
    if (qs) endpoint += `?${qs}`;

    try {
      res = await fetch(`${baseApiUrl}${endpoint}`, {
        method: 'GET',
        headers: createHeadersWithApiKey(apiKey),
      });
    } catch (error) {
      throw new NetworkError('Failed to connect to API server', {
        endpoint,
        error,
      });
    }

    if (!res.ok) {
      const errorText = await res.text();
      throw parseAPIError(res, errorText);
    }

    const data = await res.json();

    // Transform date strings to Date objects for all intents
    if (data.responseObject && Array.isArray(data.responseObject)) {
      data.responseObject = data.responseObject.map((intent: Intent) =>
        transformDatesToObjects(intent)
      );
    }

    return data;
  });
}

/**
 * Get intents by taker address with optional status filter
 */
export async function apiGetIntentsByTaker(
  req: GetIntentsByTakerRequest,
  apiKey: string,
  baseApiUrl: string
): Promise<GetIntentsByTakerResponse> {
  return withRetry(async () => {
    let res: Response;
    let endpoint = `/orders/taker/${req.takerAddress}`;

    // Add status query parameter if provided
    if (req.status) {
      const statusParam = Array.isArray(req.status)
        ? req.status.join(',')
        : req.status;
      endpoint += `?status=${statusParam}`;
    }

    try {
      res = await fetch(`${baseApiUrl}${endpoint}`, {
        method: 'GET',
        headers: createHeadersWithApiKey(apiKey),
      });
    } catch (error) {
      throw new NetworkError('Failed to connect to API server', {
        endpoint,
        error,
      });
    }

    if (!res.ok) {
      const errorText = await res.text();
      throw parseAPIError(res, errorText);
    }

    const data = await res.json();

    // Transform date strings to Date objects for all intents
    if (data.responseObject && Array.isArray(data.responseObject)) {
      data.responseObject = data.responseObject.map((intent: Intent) =>
        transformDatesToObjects(intent)
      );
    }

    return data;
  });
}

/**
 * Get a single intent by its hash
 */
export async function apiGetIntentByHash(
  req: GetIntentByHashRequest,
  apiKey: string,
  baseApiUrl: string
): Promise<GetIntentByHashResponse> {
  return withRetry(async () => {
    let res: Response;
    const endpoint = `/orders/${req.intentHash}`;

    try {
      res = await fetch(`${baseApiUrl}${endpoint}`, {
        method: 'GET',
        headers: createHeadersWithApiKey(apiKey),
      });
    } catch (error) {
      throw new NetworkError('Failed to connect to API server', {
        endpoint,
        error,
      });
    }

    if (!res.ok) {
      const errorText = await res.text();
      throw parseAPIError(res, errorText);
    }

    const data = await res.json();

    // Transform date strings to Date objects for the intent
    if (data.responseObject) {
      data.responseObject = transformDatesToObjects(data.responseObject);
    }

    return data;
  });
}

// Deposits API Functions

/**
 * Get a single deposit by its ID
 */
export async function apiGetDepositById(
  req: GetDepositByIdRequest,
  apiKey: string,
  baseApiUrl: string,
  escrowAddress?: string
): Promise<GetDepositByIdResponse> {
  return withRetry(async () => {
    let res: Response;
    let endpoint = `/deposits/${req.depositId}`;
    const qs = buildQueryString({ escrowAddress });
    if (qs) endpoint += `?${qs}`;

    try {
      res = await fetch(`${baseApiUrl}${endpoint}`, {
        method: 'GET',
        headers: createHeadersWithApiKey(apiKey),
      });
    } catch (error) {
      throw new NetworkError('Failed to connect to API server', {
        endpoint,
        error,
      });
    }

    if (!res.ok) {
      const errorText = await res.text();
      throw parseAPIError(res, errorText);
    }

    const data = await res.json();

    // Transform date strings to Date objects for the deposit
    if (data.responseObject) {
      data.responseObject = transformDatesToObjects(data.responseObject);
    }

    return data;
  });
}

/**
 * Get order statistics for multiple deposits
 */
export async function apiGetDepositsOrderStats(
  req: GetDepositsOrderStatsRequest,
  apiKey: string,
  baseApiUrl: string,
  escrowAddress?: string
): Promise<GetDepositsOrderStatsResponse> {
  return withRetry(async () => {
    let res: Response;
    const endpoint = '/deposits/order-stats';

    try {
      res = await fetch(`${baseApiUrl}${endpoint}`, {
        method: 'POST',
        headers: createHeadersWithApiKey(apiKey),
        body: JSON.stringify({ depositIds: req.depositIds, escrowAddress }),
      });
    } catch (error) {
      throw new NetworkError('Failed to connect to API server', {
        endpoint,
        error,
      });
    }

    if (!res.ok) {
      const errorText = await res.text();
      throw parseAPIError(res, errorText);
    }

    return res.json();
  });
}
