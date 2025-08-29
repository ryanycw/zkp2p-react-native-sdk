import { Zkp2pClient } from '../client';
import { base } from 'viem/chains';
import type { WalletClient } from 'viem';
import { createPublicClient, http } from 'viem';
import * as apiAdapter from '../adapters/api';

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
    it('should call apiGetDepositsOrderStats with correct parameters', async () => {
      const mockResponse = {
        success: true,
        message: 'Success',
        responseObject: [
          {
            depositId: '123',
            totalOrderCount: 10,
            totalOrderAmount: '100000',
            fulfilledOrderCount: 5,
            fulfilledOrderAmount: '50000',
            cancelledOrderCount: 2,
            cancelledOrderAmount: '20000',
            releasedOrderCount: 1,
            releasedOrderAmount: '10000',
            expiredOrderCount: 1,
            expiredOrderAmount: '10000',
            createdOrderCount: 1,
            createdOrderAmount: '10000',
          },
        ],
        statusCode: 200,
      };

      (apiAdapter.apiGetDepositsOrderStats as jest.Mock).mockResolvedValue(
        mockResponse
      );

      const client = new Zkp2pClient({
        walletClient,
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
        'https://api.zkp2p.xyz/v1'
      );
      expect(result).toEqual(mockResponse);
    });
  });
});
