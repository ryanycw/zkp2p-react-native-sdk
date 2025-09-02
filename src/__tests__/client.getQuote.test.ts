import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { Zkp2pClient } from '../client';
import * as api from '../adapters/api';

// Mock the API functions
jest.mock('../adapters/api');

describe('Zkp2pClient.getQuote', () => {
  let client: Zkp2pClient;
  const mockApiKey = 'test-api-key';
  const mockPrivateKey =
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup wallet client
    const account = privateKeyToAccount(mockPrivateKey);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(),
    });

    // Create client
    client = new Zkp2pClient({
      walletClient,
      apiKey: mockApiKey,
      chainId: 8453,
      prover: 'reclaim_gnark',
    });
  });

  it('should enrich quotes with payee details when available', async () => {
    const mockQuoteResponse = {
      success: true,
      message: 'Success',
      responseObject: {
        fiat: { currencyCode: 'USD' },
        token: { symbol: 'USDC' },
        quotes: [
          {
            fiatAmount: '100',
            fiatAmountFormatted: '$100.00',
            tokenAmount: '100000000',
            tokenAmountFormatted: '100.00',
            paymentMethod: 'Venmo',
            payeeAddress: '0x123',
            conversionRate: '1.00',
            intent: {
              depositId: 'deposit-1',
              processorName: 'venmo',
              amount: '100000000',
              toAddress: '0x123',
              payeeDetails: 'hashed-id-1',
              processorIntentData: {},
              fiatCurrencyCode: 'USD',
              chainId: '8453',
            },
          },
          {
            fiatAmount: '200',
            fiatAmountFormatted: '$200.00',
            tokenAmount: '200000000',
            tokenAmountFormatted: '200.00',
            paymentMethod: 'CashApp',
            payeeAddress: '0x456',
            conversionRate: '1.00',
            intent: {
              depositId: 'deposit-2',
              processorName: 'cashapp',
              amount: '200000000',
              toAddress: '0x456',
              payeeDetails: 'hashed-id-2',
              processorIntentData: {},
              fiatCurrencyCode: 'USD',
              chainId: '8453',
            },
          },
        ],
        fees: { zkp2pFee: '0.01' },
      },
      statusCode: 200,
    };

    const mockPayeeDetails1 = {
      success: true,
      message: 'Success',
      responseObject: {
        id: 1,
        processorName: 'venmo',
        depositData: {
          venmoUsername: '@alice-venmo',
          email: 'alice@example.com',
        },
        hashedOnchainId: 'hashed-id-1',
        createdAt: '2024-01-01',
      },
      statusCode: 200,
    };

    const mockPayeeDetails2 = {
      success: true,
      message: 'Success',
      responseObject: {
        id: 2,
        processorName: 'cashapp',
        depositData: {
          cashappUsername: '$bob-cash',
          phone: '+1234567890',
        },
        hashedOnchainId: 'hashed-id-2',
        createdAt: '2024-01-01',
      },
      statusCode: 200,
    };

    // Mock API responses
    (api.apiGetQuote as jest.Mock).mockResolvedValue(mockQuoteResponse);
    (api.apiGetPayeeDetails as jest.Mock)
      .mockResolvedValueOnce(mockPayeeDetails1)
      .mockResolvedValueOnce(mockPayeeDetails2);

    // Call getQuote
    const result = await client.getQuote({
      paymentPlatforms: ['venmo', 'cashapp'],
      fiatCurrency: 'USD',
      user: '0x123',
      recipient: '0x456',
      destinationChainId: 8453,
      destinationToken: 'USDC',
      amount: '100',
    });

    // Verify apiGetQuote was called
    expect(api.apiGetQuote).toHaveBeenCalledTimes(1);

    // Verify apiGetPayeeDetails was called for each quote
    expect(api.apiGetPayeeDetails).toHaveBeenCalledTimes(2);
    expect(api.apiGetPayeeDetails).toHaveBeenCalledWith(
      { hashedOnchainId: 'hashed-id-1', platform: 'venmo' },
      mockApiKey,
      expect.any(String)
    );
    expect(api.apiGetPayeeDetails).toHaveBeenCalledWith(
      { hashedOnchainId: 'hashed-id-2', platform: 'cashapp' },
      mockApiKey,
      expect.any(String)
    );

    // Verify quotes were enriched with payee data (entire depositData object)
    expect(result.responseObject.quotes[0]?.payeeData).toEqual({
      venmoUsername: '@alice-venmo',
      email: 'alice@example.com',
    });
    expect(result.responseObject.quotes[1]?.payeeData).toEqual({
      cashappUsername: '$bob-cash',
      phone: '+1234567890',
    });
  });

  it('should handle missing payee details gracefully', async () => {
    const mockQuoteResponse = {
      success: true,
      message: 'Success',
      responseObject: {
        fiat: { currencyCode: 'USD' },
        token: { symbol: 'USDC' },
        quotes: [
          {
            fiatAmount: '100',
            fiatAmountFormatted: '$100.00',
            tokenAmount: '100000000',
            tokenAmountFormatted: '100.00',
            paymentMethod: 'Venmo',
            payeeAddress: '0x123',
            conversionRate: '1.00',
            intent: {
              depositId: 'deposit-1',
              processorName: 'venmo',
              amount: '100000000',
              toAddress: '0x123',
              payeeDetails: 'hashed-id-1',
              processorIntentData: {},
              fiatCurrencyCode: 'USD',
              chainId: '8453',
            },
          },
        ],
        fees: { zkp2pFee: '0.01' },
      },
      statusCode: 200,
    };

    // Mock API responses
    (api.apiGetQuote as jest.Mock).mockResolvedValue(mockQuoteResponse);
    (api.apiGetPayeeDetails as jest.Mock).mockRejectedValue(
      new Error('Not found')
    );

    // Call getQuote
    const result = await client.getQuote({
      paymentPlatforms: ['venmo'],
      fiatCurrency: 'USD',
      user: '0x123',
      recipient: '0x456',
      destinationChainId: 8453,
      destinationToken: 'USDC',
      amount: '100',
    });

    // Verify apiGetPayeeDetails was attempted
    expect(api.apiGetPayeeDetails).toHaveBeenCalledTimes(1);

    // Verify quote was returned without payeeData
    expect(result.responseObject.quotes[0]?.payeeData).toBeUndefined();
  });

  it('should not fetch payee details when API key is not available', async () => {
    // Create client without API key
    const account = privateKeyToAccount(mockPrivateKey);
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(),
    });

    const clientWithoutApiKey = new Zkp2pClient({
      walletClient,
      apiKey: '',
      chainId: 8453,
      prover: 'reclaim_gnark',
    });

    const mockQuoteResponse = {
      success: true,
      message: 'Success',
      responseObject: {
        fiat: { currencyCode: 'USD' },
        token: { symbol: 'USDC' },
        quotes: [
          {
            fiatAmount: '100',
            fiatAmountFormatted: '$100.00',
            tokenAmount: '100000000',
            tokenAmountFormatted: '100.00',
            paymentMethod: 'Venmo',
            payeeAddress: '0x123',
            conversionRate: '1.00',
            intent: {
              depositId: 'deposit-1',
              processorName: 'venmo',
              amount: '100000000',
              toAddress: '0x123',
              payeeDetails: 'hashed-id-1',
              processorIntentData: {},
              fiatCurrencyCode: 'USD',
              chainId: '8453',
            },
          },
        ],
        fees: { zkp2pFee: '0.01' },
      },
      statusCode: 200,
    };

    // Mock API responses
    (api.apiGetQuote as jest.Mock).mockResolvedValue(mockQuoteResponse);

    // Call getQuote
    const result = await clientWithoutApiKey.getQuote({
      paymentPlatforms: ['venmo'],
      fiatCurrency: 'USD',
      user: '0x123',
      recipient: '0x456',
      destinationChainId: 8453,
      destinationToken: 'USDC',
      amount: '100',
    });

    // Verify apiGetPayeeDetails was NOT called
    expect(api.apiGetPayeeDetails).not.toHaveBeenCalled();

    // Verify quote was returned without payeeData
    expect(result.responseObject.quotes[0]?.payeeData).toBeUndefined();
  });

  it('should handle depositData with various field structures', async () => {
    const mockQuoteResponse = {
      success: true,
      message: 'Success',
      responseObject: {
        fiat: { currencyCode: 'USD' },
        token: { symbol: 'USDC' },
        quotes: [
          {
            fiatAmount: '100',
            fiatAmountFormatted: '$100.00',
            tokenAmount: '100000000',
            tokenAmountFormatted: '100.00',
            paymentMethod: 'Revolut',
            payeeAddress: '0x123',
            conversionRate: '1.00',
            intent: {
              depositId: 'deposit-1',
              processorName: 'revolut',
              amount: '100000000',
              toAddress: '0x123',
              payeeDetails: 'hashed-id-1',
              processorIntentData: {},
              fiatCurrencyCode: 'USD',
              chainId: '8453',
            },
          },
        ],
        fees: { zkp2pFee: '0.01' },
      },
      statusCode: 200,
    };

    const mockPayeeDetails = {
      success: true,
      message: 'Success',
      responseObject: {
        id: 1,
        processorName: 'revolut',
        depositData: {
          revolutTag: '@alice.revolut',
          email: 'alice@example.com',
          phoneNumber: '+1234567890',
          country: 'US',
          additionalInfo: 'Some extra data',
        },
        hashedOnchainId: 'hashed-id-1',
        createdAt: '2024-01-01',
      },
      statusCode: 200,
    };

    // Mock API responses
    (api.apiGetQuote as jest.Mock).mockResolvedValue(mockQuoteResponse);
    (api.apiGetPayeeDetails as jest.Mock).mockResolvedValue(mockPayeeDetails);

    // Call getQuote
    const result = await client.getQuote({
      paymentPlatforms: ['revolut'],
      fiatCurrency: 'USD',
      user: '0x123',
      recipient: '0x456',
      destinationChainId: 8453,
      destinationToken: 'USDC',
      amount: '100',
    });

    // Verify the entire depositData object is assigned to payeeData
    expect(result.responseObject.quotes[0]?.payeeData).toEqual({
      revolutTag: '@alice.revolut',
      email: 'alice@example.com',
      phoneNumber: '+1234567890',
      country: 'US',
      additionalInfo: 'Some extra data',
    });
  });

  it('should handle empty depositData object', async () => {
    const mockQuoteResponse = {
      success: true,
      message: 'Success',
      responseObject: {
        fiat: { currencyCode: 'USD' },
        token: { symbol: 'USDC' },
        quotes: [
          {
            fiatAmount: '100',
            fiatAmountFormatted: '$100.00',
            tokenAmount: '100000000',
            tokenAmountFormatted: '100.00',
            paymentMethod: 'Venmo',
            payeeAddress: '0x123',
            conversionRate: '1.00',
            intent: {
              depositId: 'deposit-1',
              processorName: 'venmo',
              amount: '100000000',
              toAddress: '0x123',
              payeeDetails: 'hashed-id-1',
              processorIntentData: {},
              fiatCurrencyCode: 'USD',
              chainId: '8453',
            },
          },
        ],
        fees: { zkp2pFee: '0.01' },
      },
      statusCode: 200,
    };

    const mockPayeeDetails = {
      success: true,
      message: 'Success',
      responseObject: {
        id: 1,
        processorName: 'venmo',
        depositData: {},
        hashedOnchainId: 'hashed-id-1',
        createdAt: '2024-01-01',
      },
      statusCode: 200,
    };

    // Mock API responses
    (api.apiGetQuote as jest.Mock).mockResolvedValue(mockQuoteResponse);
    (api.apiGetPayeeDetails as jest.Mock).mockResolvedValue(mockPayeeDetails);

    // Call getQuote
    const result = await client.getQuote({
      paymentPlatforms: ['venmo'],
      fiatCurrency: 'USD',
      user: '0x123',
      recipient: '0x456',
      destinationChainId: 8453,
      destinationToken: 'USDC',
      amount: '100',
    });

    // Verify empty depositData is assigned to payeeData
    expect(result.responseObject.quotes[0]?.payeeData).toEqual({});
  });

  it('should handle missing intent.payeeDetails field', async () => {
    const mockQuoteResponse = {
      success: true,
      message: 'Success',
      responseObject: {
        fiat: { currencyCode: 'USD' },
        token: { symbol: 'USDC' },
        quotes: [
          {
            fiatAmount: '100',
            fiatAmountFormatted: '$100.00',
            tokenAmount: '100000000',
            tokenAmountFormatted: '100.00',
            paymentMethod: 'Venmo',
            payeeAddress: '0x123',
            conversionRate: '1.00',
            intent: {
              depositId: 'deposit-1',
              processorName: 'venmo',
              amount: '100000000',
              toAddress: '0x123',
              payeeDetails: '', // Empty string
              processorIntentData: {},
              fiatCurrencyCode: 'USD',
              chainId: '8453',
            },
          },
        ],
        fees: { zkp2pFee: '0.01' },
      },
      statusCode: 200,
    };

    // Mock API responses
    (api.apiGetQuote as jest.Mock).mockResolvedValue(mockQuoteResponse);

    // Call getQuote
    const result = await client.getQuote({
      paymentPlatforms: ['venmo'],
      fiatCurrency: 'USD',
      user: '0x123',
      recipient: '0x456',
      destinationChainId: 8453,
      destinationToken: 'USDC',
      amount: '100',
    });

    // Verify apiGetPayeeDetails was NOT called since payeeDetails is empty
    expect(api.apiGetPayeeDetails).not.toHaveBeenCalled();

    // Verify quote was returned without payeeData
    expect(result.responseObject.quotes[0]?.payeeData).toBeUndefined();
  });

  it('should handle missing intent.processorName field', async () => {
    const mockQuoteResponse = {
      success: true,
      message: 'Success',
      responseObject: {
        fiat: { currencyCode: 'USD' },
        token: { symbol: 'USDC' },
        quotes: [
          {
            fiatAmount: '100',
            fiatAmountFormatted: '$100.00',
            tokenAmount: '100000000',
            tokenAmountFormatted: '100.00',
            paymentMethod: 'Unknown',
            payeeAddress: '0x123',
            conversionRate: '1.00',
            intent: {
              depositId: 'deposit-1',
              processorName: '', // Empty processor name
              amount: '100000000',
              toAddress: '0x123',
              payeeDetails: 'hashed-id-1',
              processorIntentData: {},
              fiatCurrencyCode: 'USD',
              chainId: '8453',
            },
          },
        ],
        fees: { zkp2pFee: '0.01' },
      },
      statusCode: 200,
    };

    // Mock API responses
    (api.apiGetQuote as jest.Mock).mockResolvedValue(mockQuoteResponse);

    // Call getQuote
    const result = await client.getQuote({
      paymentPlatforms: ['venmo'],
      fiatCurrency: 'USD',
      user: '0x123',
      recipient: '0x456',
      destinationChainId: 8453,
      destinationToken: 'USDC',
      amount: '100',
    });

    // Verify apiGetPayeeDetails was NOT called since processorName is empty
    expect(api.apiGetPayeeDetails).not.toHaveBeenCalled();

    // Verify quote was returned without payeeData
    expect(result.responseObject.quotes[0]?.payeeData).toBeUndefined();
  });
});
