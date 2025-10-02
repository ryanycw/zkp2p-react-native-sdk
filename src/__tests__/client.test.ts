import { Zkp2pClient } from '../client';
import { base } from 'viem/chains';
import type { WalletClient } from 'viem';
import { createPublicClient, http } from 'viem';
import * as apiAdapter from '../adapters/api';
import * as escrowViewParsers from '../utils/escrowViewParsers';
import { ESCROW_ABI } from '../utils/contracts';

jest.mock('viem', () => {
  const actual = jest.requireActual('viem');
  return {
    ...actual,
    createPublicClient: jest.fn(() => ({})),
    http: jest.fn((url?: string) => ({ url })),
  };
});

jest.mock('../adapters/api');

const walletClient = {} as WalletClient;

describe('Zkp2pClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws for unsupported chain without rpcUrl', () => {
    expect(
      () =>
        new Zkp2pClient({
          walletClient,
          apiKey: 'key',
          chainId: 99999,
          prover: 'reclaim_snarkjs',
        })
    ).toThrow('Unsupported chain ID: 99999');
  });

  it('uses custom rpcUrl when provided', () => {
    const rpcUrl = 'https://rpc.example.com';
    const client = new Zkp2pClient({
      walletClient,
      apiKey: 'key',
      chainId: base.id,
      rpcUrl,
      prover: 'reclaim_snarkjs',
    });
    expect(createPublicClient).toHaveBeenCalledWith({
      chain: base,
      transport: http(rpcUrl),
    });

    expect(client.apiKey).toBe('key');
    expect(client.chainId).toBe(base.id);
  });

  describe('getDepositsOrderStats', () => {
    it('should call apiGetDepositsOrderStats with correct parameters even without wallet client', async () => {
      const mockResponse = {
        success: true,
        message: 'Success',
        responseObject: [
          {
            id: 123,
            totalIntents: 10,
            signaledIntents: 7,
            fulfilledIntents: 2,
            prunedIntents: 1,
          },
        ],
        statusCode: 200,
      };

      (apiAdapter.apiGetDepositsOrderStats as jest.Mock).mockResolvedValue(
        mockResponse
      );

      const client = new Zkp2pClient({
        apiKey: 'test-key',
        chainId: base.id,
        prover: 'reclaim_snarkjs',
      });

      const result = await client.getDepositsOrderStats({
        depositIds: [123, 456],
      });

      expect(apiAdapter.apiGetDepositsOrderStats).toHaveBeenCalledWith(
        { depositIds: [123, 456] },
        'test-key',
        'https://api.zkp2p.xyz/v1',
        client.addresses.escrow
      );
      expect(result).toEqual(mockResponse);
    });
  });

  it('throws when calling fulfillIntent without a wallet client', async () => {
    const client = new Zkp2pClient({
      apiKey: 'test-key',
      chainId: base.id,
      prover: 'reclaim_snarkjs',
    });

    await expect(
      client.fulfillIntent({
        paymentProofs: [],
        intentHash:
          '0x0000000000000000000000000000000000000000000000000000000000000000',
      } as any)
    ).rejects.toThrow(/walletClient is required to fulfill intents/);
  });

  it('throws when calling API-gated methods without an apiKey', async () => {
    const client = new Zkp2pClient({
      chainId: base.id,
      prover: 'reclaim_snarkjs',
    });

    await expect(
      client.getPayeeDetails({ hashedOnchainId: 'hash', platform: 'venmo' })
    ).rejects.toThrow(/apiKey is required to fetch payee details/);
  });

  it('fetches an intent by hash', async () => {
    const client = new Zkp2pClient({
      apiKey: 'test-key',
      chainId: base.id,
      prover: 'reclaim_snarkjs',
    });

    const intentHash = `0x${'1'.repeat(64)}` as const;
    const rawIntentView = {
      intentHash,
      intent: {
        owner: '0x0000000000000000000000000000000000000001',
        to: '0x0000000000000000000000000000000000000002',
        depositId: '0x01',
        amount: '0x0a',
        timestamp: '0x05',
        paymentVerifier: client.addresses.venmo,
        fiatCurrency: `0x${'0'.repeat(56)}41424344`,
        conversionRate: '0x0a',
      },
      deposit: {
        depositId: '0x01',
        deposit: {
          depositor: '0x0000000000000000000000000000000000000003',
          token: client.addresses.usdc,
          amount: '0x64',
          intentAmountRange: { min: '0x0a', max: '0x14' },
          acceptingIntents: true,
          remainingDeposits: '0x32',
          outstandingIntentAmount: '0x05',
          intentHashes: [intentHash],
        },
        availableLiquidity: '0x64',
        verifiers: [
          {
            verifier: client.addresses.venmo,
            verificationData: {
              intentGatingService: client.addresses.gatingService,
              payeeDetails: 'hashed-id',
              data: '0x',
            },
            currencies: [
              {
                code: `0x${'0'.repeat(56)}55555555`,
                conversionRate: '0x01',
              },
            ],
          },
        ],
      },
    };

    const readContractMock = jest
      .fn()
      .mockResolvedValue(rawIntentView as unknown as Record<string, any>);
    (client as any).publicClient = {
      readContract: readContractMock,
    };

    const enrichVerifiersSpy = jest
      .spyOn(escrowViewParsers, 'enrichVerifiers')
      .mockResolvedValue();
    const enrichIntentSpy = jest.spyOn(
      escrowViewParsers,
      'enrichIntentFromVerifiers'
    );

    const result = await client.getIntent(intentHash);

    expect(readContractMock).toHaveBeenCalledWith({
      address: client.addresses.escrow,
      abi: ESCROW_ABI,
      functionName: 'getIntent',
      args: [intentHash],
    });
    expect(result?.intentHash).toBe(intentHash);
    expect(enrichVerifiersSpy).toHaveBeenCalled();
    expect(enrichIntentSpy).toHaveBeenCalled();

    enrichVerifiersSpy.mockRestore();
    enrichIntentSpy.mockRestore();
  });
});
