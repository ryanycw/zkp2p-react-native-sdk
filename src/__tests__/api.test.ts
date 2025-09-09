import {
  apiGetQuote,
  apiValidatePayeeDetails,
  apiGetOwnerDeposits,
  apiGetOwnerIntents,
  apiGetIntentsByDeposit,
  apiGetIntentsByTaker,
  apiGetIntentByHash,
  apiGetDepositById,
  apiGetDepositsOrderStats,
} from '../adapters/api';
import type {
  QuoteRequest,
  ValidatePayeeDetailsRequest,
  Intent,
  Deposit,
  OrderStats,
} from '../types';

// Mock fetch
global.fetch = jest.fn();

describe('apiGetQuote', () => {
  const mockBaseUrl = 'https://api.example.com';
  const mockResponse = {
    success: true,
    message: 'Success',
    responseObject: {
      fiat: { currencyCode: 'USD' },
      token: { symbol: 'USDC' },
      quotes: [
        { tokenAmount: '1000000', fiatAmount: '1.00' },
        { tokenAmount: '2000000', fiatAmount: '2.00' },
        { tokenAmount: '3000000', fiatAmount: '3.00' },
      ],
      fees: { zkp2pFee: '0.01' },
    },
    statusCode: 200,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
  });

  it('should pass quotesToReturn as query parameter for exact fiat', async () => {
    const request: QuoteRequest = {
      paymentPlatforms: ['venmo'],
      fiatCurrency: 'USD',
      user: '0x123',
      recipient: '0x456',
      destinationChainId: 1,
      destinationToken: '0xUSDC',
      amount: '100',
      quotesToReturn: 3,
    };

    await apiGetQuote(request, mockBaseUrl);

    expect(global.fetch).toHaveBeenCalledWith(
      `${mockBaseUrl}/quote/exact-fiat?quotesToReturn=3`,
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"exactFiatAmount":"100"'),
      })
    );

    // Verify quotesToReturn is not in the body
    const bodyStr = (global.fetch as jest.Mock).mock.calls[0][1].body;
    expect(bodyStr).not.toContain('"quotesToReturn"');
  });

  it('should pass quotesToReturn as query parameter for exact token', async () => {
    const request: QuoteRequest = {
      paymentPlatforms: ['venmo'],
      fiatCurrency: 'USD',
      user: '0x123',
      recipient: '0x456',
      destinationChainId: 1,
      destinationToken: '0xUSDC',
      amount: '1000000',
      isExactFiat: false,
      quotesToReturn: 2,
    };

    await apiGetQuote(request, mockBaseUrl);

    expect(global.fetch).toHaveBeenCalledWith(
      `${mockBaseUrl}/quote/exact-token?quotesToReturn=2`,
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"exactTokenAmount":"1000000"'),
      })
    );
  });

  it('should not include query parameter when quotesToReturn is not provided', async () => {
    const request: QuoteRequest = {
      paymentPlatforms: ['venmo'],
      fiatCurrency: 'USD',
      user: '0x123',
      recipient: '0x456',
      destinationChainId: 1,
      destinationToken: '0xUSDC',
      amount: '100',
    };

    await apiGetQuote(request, mockBaseUrl);

    expect(global.fetch).toHaveBeenCalledWith(
      `${mockBaseUrl}/quote/exact-fiat`,
      expect.any(Object)
    );
  });

  it('should pass quotesToReturn and trust API to handle limiting', async () => {
    const request: QuoteRequest = {
      paymentPlatforms: ['venmo'],
      fiatCurrency: 'USD',
      user: '0x123',
      recipient: '0x456',
      destinationChainId: 1,
      destinationToken: '0xUSDC',
      amount: '100',
      quotesToReturn: 2,
    };

    await apiGetQuote(request, mockBaseUrl);

    // Simply verify the parameter was passed correctly
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('?quotesToReturn=2'),
      expect.any(Object)
    );
  });

  it('should validate quotesToReturn parameter', async () => {
    const request: QuoteRequest = {
      paymentPlatforms: ['venmo'],
      fiatCurrency: 'USD',
      user: '0x123',
      recipient: '0x456',
      destinationChainId: 1,
      destinationToken: '0xUSDC',
      amount: '100',
      quotesToReturn: 0, // Invalid
    };

    await expect(apiGetQuote(request, mockBaseUrl)).rejects.toThrow(
      'quotesToReturn must be a positive integer'
    );
  });

  it('should default isExactFiat to true', async () => {
    const request: QuoteRequest = {
      paymentPlatforms: ['venmo'],
      fiatCurrency: 'USD',
      user: '0x123',
      recipient: '0x456',
      destinationChainId: 1,
      destinationToken: '0xUSDC',
      amount: '100',
    };

    await apiGetQuote(request, mockBaseUrl);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/quote/exact-fiat'),
      expect.any(Object)
    );
  });
});

describe('apiValidatePayeeDetails', () => {
  const mockApiKey = 'test-api-key';
  const mockBaseUrl = 'https://api.example.com';
  const mockResponse = {
    success: true,
    message: 'Validation successful',
    responseObject: {
      isValid: true,
      errors: [],
    },
    statusCode: 200,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });
  });

  it('should call the validate endpoint with correct parameters', async () => {
    const request: ValidatePayeeDetailsRequest = {
      processorName: 'venmo',
      depositData: {
        venmoPayeeUsername: 'testuser',
        venmoPayeeId: '123456',
      },
    };

    await apiValidatePayeeDetails(request, mockApiKey, mockBaseUrl);

    expect(global.fetch).toHaveBeenCalledWith(
      `${mockBaseUrl}/makers/validate`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': mockApiKey,
        },
        body: JSON.stringify(request),
      })
    );
  });

  it('should return validation boolean response when invalid', async () => {
    const apiResponse = {
      success: false,
      message: 'Validation failed',
      responseObject: false,
      statusCode: 200,
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => apiResponse,
    });

    const request: ValidatePayeeDetailsRequest = {
      processorName: 'venmo',
      depositData: {
        venmoPayeeUsername: 'invalid@user',
        venmoPayeeId: 'wrong',
      },
    };

    const result = await apiValidatePayeeDetails(
      request,
      mockApiKey,
      mockBaseUrl
    );

    expect(result).toEqual(apiResponse);
    expect(result.responseObject).toBe(false);
  });
});

describe('apiGetOwnerDeposits', () => {
  const mockApiKey = 'test-api-key';
  const mockBaseUrl = 'https://api.test.com';

  beforeEach(() => {
    jest.clearAllMocks();
  });
  const mockDeposit: Deposit = {
    id: 123,
    depositor: '0xabc123',
    token: '0xUSDC',
    amount: '1000000',
    remainingDeposits: '900000',
    intentAmountMin: '100000',
    intentAmountMax: '500000',
    acceptingIntents: true,
    outstandingIntentAmount: '0',
    availableLiquidity: '0',
    status: 'ACTIVE',
    totalIntents: 0,
    signaledIntents: 0,
    fulfilledIntents: 0,
    prunedIntents: 0,
    updatedAt: new Date('2024-01-15T10:00:00Z'),
    createdAt: new Date('2024-01-10T10:00:00Z'),
    verifiers: [
      {
        id: 1,
        depositId: 123,
        verifier: '0xVerifier',
        intentGatingService: '0xGating',
        payeeDetailsHash: '0xpayeehash',
        data: '0xdata',
        createdAt: new Date('2024-01-10T10:00:00Z'),
        updatedAt: new Date('2024-01-10T10:00:00Z'),
        currencies: [
          {
            id: 1,
            depositVerifierId: 1,
            currencyCode:
              '0x5553440000000000000000000000000000000000000000000000000000000000',
            conversionRate: '1000000',
            createdAt: new Date('2024-01-10T10:00:00Z'),
            updatedAt: new Date('2024-01-10T10:00:00Z'),
          },
        ],
      },
    ],
  };

  const mockApiResponse = {
    success: true,
    message: 'Success',
    responseObject: [
      {
        ...mockDeposit,
        updatedAt: '2024-01-15T10:00:00Z',
        createdAt: '2024-01-10T10:00:00Z',
        verifiers: [
          {
            ...mockDeposit.verifiers[0]!,
            updatedAt: '2024-01-10T10:00:00Z',
            createdAt: '2024-01-10T10:00:00Z',
            currencies: [
              {
                ...mockDeposit.verifiers[0]!.currencies[0]!,
                createdAt: '2024-01-10T10:00:00Z',
                updatedAt: '2024-01-10T10:00:00Z',
              },
            ],
          },
        ],
      },
    ],
    statusCode: 200,
  };

  it('should fetch owner deposits without status filter', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });

    const result = await apiGetOwnerDeposits(
      { ownerAddress: '0xabc123' },
      mockApiKey,
      mockBaseUrl
    );

    expect(global.fetch).toHaveBeenCalledWith(
      `${mockBaseUrl}/deposits/maker/0xabc123`,
      expect.objectContaining({
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': mockApiKey,
        },
      })
    );

    expect(result.success).toBe(true);
    expect(result.responseObject).toHaveLength(1);
    expect(result.responseObject[0]!.updatedAt).toBeInstanceOf(Date);
    expect(result.responseObject[0]!.createdAt).toBeInstanceOf(Date);
    expect(result.responseObject[0]!.verifiers[0]!.updatedAt).toBeInstanceOf(
      Date
    );
  });

  it('should fetch owner deposits with status filter', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });

    await apiGetOwnerDeposits(
      { ownerAddress: '0xabc123', status: 'ACTIVE' },
      mockApiKey,
      mockBaseUrl
    );

    expect(global.fetch).toHaveBeenCalledWith(
      `${mockBaseUrl}/deposits/maker/0xabc123?status=ACTIVE`,
      expect.any(Object)
    );
  });

  it('should handle API errors properly', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not found',
    });

    await expect(
      apiGetOwnerDeposits({ ownerAddress: '0xabc123' }, mockApiKey, mockBaseUrl)
    ).rejects.toThrow();
  });
});

describe('apiGetOwnerIntents', () => {
  const mockApiKey = 'test-api-key';
  const mockBaseUrl = 'https://api.test.com';

  beforeEach(() => {
    jest.clearAllMocks();
  });
  const mockIntent: Intent = {
    id: 456,
    intentHash: '0x456abc',
    status: 'SIGNALED',
    depositId: '123',
    verifier: '0xVerifier',
    owner: '0xabc123',
    toAddress: '0xdef456',
    amount: '100000',
    fiatCurrency: 'USD',
    conversionRate: '1.05',
    sustainabilityFee: null,
    verifierFee: null,
    signalTxHash: '0xSignalHash',
    signalTimestamp: new Date('2024-01-14T12:00:00Z'),
    fulfillTxHash: null,
    fulfillTimestamp: null,
    pruneTxHash: null,
    prunedTimestamp: null,
    updatedAt: new Date('2024-01-15T12:00:00Z'),
    createdAt: new Date('2024-01-14T12:00:00Z'),
  };

  const mockApiResponse = {
    success: true,
    message: 'Success',
    responseObject: [
      {
        ...mockIntent,
        updatedAt: '2024-01-15T12:00:00Z',
        createdAt: '2024-01-14T12:00:00Z',
      },
    ],
    statusCode: 200,
  };

  it('should fetch owner intents', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });

    const result = await apiGetOwnerIntents(
      { ownerAddress: '0xabc123' },
      mockApiKey,
      mockBaseUrl
    );

    expect(global.fetch).toHaveBeenCalledWith(
      `${mockBaseUrl}/orders/maker/0xabc123`,
      expect.objectContaining({
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': mockApiKey,
        },
      })
    );

    expect(result.success).toBe(true);
    expect(result.responseObject).toHaveLength(1);
    expect(result.responseObject[0]!.updatedAt).toBeInstanceOf(Date);
    expect(result.responseObject[0]!.createdAt).toBeInstanceOf(Date);
  });

  it('should handle empty response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: 'Success',
        responseObject: [],
        statusCode: 200,
      }),
    });

    const result = await apiGetOwnerIntents(
      { ownerAddress: '0xabc123' },
      mockApiKey,
      mockBaseUrl
    );

    expect(result.responseObject).toEqual([]);
  });

  it('should handle API errors properly', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal server error',
    });

    await expect(
      apiGetOwnerIntents({ ownerAddress: '0xabc123' }, mockApiKey, mockBaseUrl)
    ).rejects.toThrow();
  });
});

describe('Date transformation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle nested date transformations correctly', async () => {
    const complexResponse = {
      success: true,
      message: 'Success',
      responseObject: [
        {
          id: 1,
          depositor: '0x123',
          token: '0xUSDC',
          amount: '1000',
          remainingDeposits: '900',
          intentAmountMin: '100',
          intentAmountMax: '500',
          acceptingIntents: true,
          outstandingIntentAmount: '0',
          availableLiquidity: '0',
          status: 'ACTIVE' as const,
          totalIntents: 0,
          signaledIntents: 0,
          fulfilledIntents: 0,
          prunedIntents: 0,
          updatedAt: '2024-01-15T10:00:00Z',
          createdAt: '2024-01-10T10:00:00Z',
          verifiers: [
            {
              id: 1,
              depositId: 1,
              verifier: '0xVerifier',
              intentGatingService: '0xGating',
              payeeDetailsHash: '0xhash',
              data: '0xdata',
              updatedAt: '2024-01-12T10:00:00Z',
              createdAt: '2024-01-11T10:00:00Z',
              currencies: [
                {
                  id: 1,
                  depositVerifierId: 1,
                  currencyCode:
                    '0x5553440000000000000000000000000000000000000000000000000000000000',
                  conversionRate: '1000000',
                  updatedAt: '2024-01-12T10:00:00Z',
                  createdAt: '2024-01-11T10:00:00Z',
                },
              ],
            },
            {
              id: 2,
              depositId: 1,
              verifier: '0xVerifier2',
              intentGatingService: '0xGating2',
              payeeDetailsHash: '0xhash2',
              data: '0xdata2',
              updatedAt: '2024-01-13T10:00:00Z',
              createdAt: '2024-01-11T10:00:00Z',
              currencies: [],
            },
          ],
        },
      ],
      statusCode: 200,
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => complexResponse,
    });

    const result = await apiGetOwnerDeposits(
      { ownerAddress: '0x123' },
      'test-api-key',
      'https://api.test.com'
    );

    // Check main object dates
    expect(result.responseObject[0]!.updatedAt).toBeInstanceOf(Date);
    expect(result.responseObject[0]!.createdAt).toBeInstanceOf(Date);

    // Check nested array dates
    result.responseObject[0]!.verifiers.forEach((v) => {
      expect(v.updatedAt).toBeInstanceOf(Date);
      expect(v.createdAt).toBeInstanceOf(Date);
      v.currencies.forEach((c) => {
        expect(c.updatedAt).toBeInstanceOf(Date);
        expect(c.createdAt).toBeInstanceOf(Date);
      });
    });
  });
});

describe('apiGetIntentsByDeposit', () => {
  const mockApiKey = 'test-api-key';
  const mockBaseUrl = 'https://api.test.com';

  beforeEach(() => {
    jest.clearAllMocks();
  });
  const mockIntent: Intent = {
    id: 123,
    intentHash: '0x123abc',
    status: 'SIGNALED',
    depositId: '456',
    verifier: '0xVerifier',
    owner: '0xabc123',
    toAddress: '0xdef456',
    amount: '100000',
    fiatCurrency: 'USD',
    conversionRate: '1.05',
    sustainabilityFee: null,
    verifierFee: null,
    signalTxHash: '0xSignalHash',
    signalTimestamp: new Date('2024-01-14T12:00:00Z'),
    fulfillTxHash: null,
    fulfillTimestamp: null,
    pruneTxHash: null,
    prunedTimestamp: null,
    createdAt: new Date('2024-01-14T12:00:00Z'),
    updatedAt: new Date('2024-01-15T12:00:00Z'),
  };

  it('should fetch intents by deposit ID', async () => {
    const mockResponse = {
      success: true,
      message: 'Success',
      responseObject: [mockIntent],
      statusCode: 200,
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ...mockResponse,
          responseObject: [
            {
              ...mockIntent,
              updatedAt: mockIntent.updatedAt.toISOString(),
              createdAt: mockIntent.createdAt.toISOString(),
            },
          ],
        }),
    });

    const result = await apiGetIntentsByDeposit(
      { depositId: '456' },
      mockApiKey,
      mockBaseUrl
    );

    expect(global.fetch).toHaveBeenCalledWith(
      `${mockBaseUrl}/orders/deposit/456`,
      expect.objectContaining({
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': mockApiKey,
        },
      })
    );
    expect(result.responseObject[0]?.status).toBe('SIGNALED');
  });

  it('should handle status filter as array', async () => {
    const mockResponse = {
      success: true,
      message: 'Success',
      responseObject: [],
      statusCode: 200,
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    await apiGetIntentsByDeposit(
      { depositId: '456', status: ['SIGNALED', 'FULFILLED'] },
      mockApiKey,
      mockBaseUrl
    );

    expect(global.fetch).toHaveBeenCalledWith(
      `${mockBaseUrl}/orders/deposit/456?status=SIGNALED,FULFILLED`,
      expect.any(Object)
    );
  });

  it('should handle network error', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    await expect(
      apiGetIntentsByDeposit({ depositId: '456' }, mockApiKey, mockBaseUrl)
    ).rejects.toThrow('Failed to connect to API server');
  });
});

describe('apiGetIntentsByTaker', () => {
  const mockApiKey = 'test-api-key';
  const mockBaseUrl = 'https://api.test.com';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockIntent: Intent = {
    id: 123,
    intentHash: '0x123abc',
    status: 'SIGNALED',
    depositId: '456',
    verifier: '0xVerifier',
    owner: '0xabc123',
    toAddress: '0xdef456',
    amount: '100000',
    fiatCurrency: 'USD',
    conversionRate: '1.05',
    sustainabilityFee: null,
    verifierFee: null,
    signalTxHash: '0xSignalHash',
    signalTimestamp: new Date('2024-01-14T12:00:00Z'),
    fulfillTxHash: null,
    fulfillTimestamp: null,
    pruneTxHash: null,
    prunedTimestamp: null,
    updatedAt: new Date('2024-01-15T12:00:00Z'),
    createdAt: new Date('2024-01-14T12:00:00Z'),
  };

  it('should fetch intents by taker address', async () => {
    const mockResponse = {
      success: true,
      message: 'Success',
      responseObject: [mockIntent],
      statusCode: 200,
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ...mockResponse,
          responseObject: [
            {
              ...mockIntent,
              updatedAt: mockIntent.updatedAt.toISOString(),
              createdAt: mockIntent.createdAt.toISOString(),
            },
          ],
        }),
    });

    const result = await apiGetIntentsByTaker(
      { takerAddress: '0xabc123' },
      mockApiKey,
      mockBaseUrl
    );

    expect(global.fetch).toHaveBeenCalledWith(
      `${mockBaseUrl}/orders/taker/0xabc123`,
      expect.objectContaining({
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': mockApiKey,
        },
      })
    );
    expect(result.responseObject).toBeDefined();
    expect(result.responseObject.length).toBeGreaterThan(0);
  });
});

describe('apiGetIntentByHash', () => {
  const mockApiKey = 'test-api-key';
  const mockBaseUrl = 'https://api.test.com';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockIntent: Intent = {
    id: 123,
    intentHash: '0x123abc',
    status: 'SIGNALED',
    depositId: '456',
    verifier: '0xVerifier',
    owner: '0xabc123',
    toAddress: '0xdef456',
    amount: '100000',
    fiatCurrency: 'USD',
    conversionRate: '1.05',
    sustainabilityFee: null,
    verifierFee: null,
    signalTxHash: '0xSignalHash',
    signalTimestamp: new Date('2024-01-14T12:00:00Z'),
    fulfillTxHash: null,
    fulfillTimestamp: null,
    pruneTxHash: null,
    prunedTimestamp: null,
    updatedAt: new Date('2024-01-15T12:00:00Z'),
    createdAt: new Date('2024-01-14T12:00:00Z'),
  };

  it('should fetch a single intent by hash', async () => {
    const mockResponse = {
      success: true,
      message: 'Success',
      responseObject: mockIntent,
      statusCode: 200,
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ...mockResponse,
          responseObject: {
            ...mockIntent,
            updatedAt: mockIntent.updatedAt.toISOString(),
            createdAt: mockIntent.createdAt.toISOString(),
          },
        }),
    });

    const result = await apiGetIntentByHash(
      { intentHash: '0xhash123' },
      mockApiKey,
      mockBaseUrl
    );

    expect(global.fetch).toHaveBeenCalledWith(
      `${mockBaseUrl}/orders/0xhash123`,
      expect.objectContaining({
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': mockApiKey,
        },
      })
    );
    expect(result.responseObject.id).toBe(123);
  });

  it('should handle intent not found', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Intent not found'),
    });

    await expect(
      apiGetIntentByHash(
        { intentHash: '0xnonexistent' },
        mockApiKey,
        mockBaseUrl
      )
    ).rejects.toThrow('Intent not found');
  });
});

describe('apiGetDepositById', () => {
  const mockApiKey = 'test-api-key';
  const mockBaseUrl = 'https://api.test.com';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockDeposit: Deposit = {
    id: 123,
    depositor: '0xabc123',
    token: '0xUSDC',
    amount: '1000000',
    remainingDeposits: '999000',
    intentAmountMin: '100',
    intentAmountMax: '10000',
    acceptingIntents: true,
    outstandingIntentAmount: '0',
    availableLiquidity: '0',
    status: 'ACTIVE',
    totalIntents: 0,
    signaledIntents: 0,
    fulfilledIntents: 0,
    prunedIntents: 0,
    updatedAt: new Date('2024-01-15T12:00:00Z'),
    createdAt: new Date('2024-01-14T12:00:00Z'),
    verifiers: [],
  };

  it('should fetch a single deposit by ID', async () => {
    const mockResponse = {
      success: true,
      message: 'Success',
      responseObject: mockDeposit,
      statusCode: 200,
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          ...mockResponse,
          responseObject: {
            ...mockDeposit,
            updatedAt: mockDeposit.updatedAt.toISOString(),
            createdAt: mockDeposit.createdAt.toISOString(),
          },
        }),
    });

    const result = await apiGetDepositById(
      { depositId: '123' },
      mockApiKey,
      mockBaseUrl
    );

    expect(global.fetch).toHaveBeenCalledWith(
      `${mockBaseUrl}/deposits/123`,
      expect.objectContaining({
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': mockApiKey,
        },
      })
    );
    expect(result.responseObject.id).toBe(123);
  });

  it('should handle invalid deposit ID format', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Invalid deposit ID format'),
    });

    await expect(
      apiGetDepositById({ depositId: 'invalid-id!' }, mockApiKey, mockBaseUrl)
    ).rejects.toThrow('Invalid deposit ID format');
  });
});

describe('apiGetDepositsOrderStats', () => {
  const mockApiKey = 'test-api-key';
  const mockBaseUrl = 'https://api.test.com';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch order statistics for multiple deposits', async () => {
    const mockOrderStats: OrderStats = {
      id: 123,
      totalIntents: 10,
      signaledIntents: 7,
      fulfilledIntents: 2,
      prunedIntents: 1,
    };

    const mockResponse = {
      success: true,
      message: 'Success',
      responseObject: [mockOrderStats],
      statusCode: 200,
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await apiGetDepositsOrderStats(
      { depositIds: [123, 456] },
      mockApiKey,
      mockBaseUrl
    );

    expect(global.fetch).toHaveBeenCalledWith(
      `${mockBaseUrl}/deposits/order-stats`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': mockApiKey,
        },
        body: JSON.stringify({ depositIds: [123, 456] }),
      })
    );
    expect(result.responseObject[0]?.totalIntents).toBe(10);
  });

  it('should handle server error during POST request', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal server error'),
    });

    await expect(
      apiGetDepositsOrderStats({ depositIds: [123] }, mockApiKey, mockBaseUrl)
    ).rejects.toThrow('Internal server error');
  });
});
