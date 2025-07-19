import type {
  IntentSignalRequest,
  PostDepositDetailsRequest,
  SignalIntentResponse,
  PostDepositDetailsResponse,
  QuoteRequest,
  QuoteResponse,
  GetPayeeDetailsRequest,
  GetPayeeDetailsResponse,
} from '../types';

function headers() {
  return { 'Content-Type': 'application/json' } as const;
}

function createHeadersWithApiKey(apiKey: string) {
  return { 'Content-Type': 'application/json', 'x-api-key': apiKey } as const;
}

export async function apiSignalIntent(
  req: IntentSignalRequest,
  apiKey: string,
  baseApiUrl: string
): Promise<SignalIntentResponse> {
  const res = await fetch(`${baseApiUrl}/verify/intent`, {
    method: 'POST',
    headers: createHeadersWithApiKey(apiKey),
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to signal intent: ${errorText}`);
  }
  return res.json();
}

export async function apiPostDepositDetails(
  req: PostDepositDetailsRequest,
  apiKey: string,
  baseApiUrl: string
): Promise<PostDepositDetailsResponse> {
  const res = await fetch(`${baseApiUrl}/makers/create`, {
    method: 'POST',
    headers: createHeadersWithApiKey(apiKey),
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to create deposit details: ${errorText}`);
  }
  return res.json();
}

export async function apiGetQuote(
  req: QuoteRequest,
  baseApiUrl: string
): Promise<QuoteResponse> {
  // Validate quotesToReturn if provided
  if (req.quotesToReturn !== undefined) {
    if (!Number.isInteger(req.quotesToReturn) || req.quotesToReturn < 1) {
      throw new Error('quotesToReturn must be a positive integer');
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

  const res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to get quote: ${errorText}`);
  }

  const response: QuoteResponse = await res.json();

  return response;
}

export async function apiGetPayeeDetails(
  req: GetPayeeDetailsRequest,
  apiKey: string,
  baseApiUrl: string
): Promise<GetPayeeDetailsResponse> {
  const res = await fetch(
    `${baseApiUrl}/makers/${req.platform}/${req.hashedOnchainId}`,
    {
      method: 'GET',
      headers: createHeadersWithApiKey(apiKey),
    }
  );
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to get payee details: ${errorText}`);
  }
  return res.json();
}
