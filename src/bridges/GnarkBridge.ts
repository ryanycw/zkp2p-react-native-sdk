import { NativeEventEmitter } from 'react-native';
import type { Spec as GnarkModuleSpec } from '../NativeZkp2pGnarkModule';
import { ProofGenerationError, ValidationError } from '../errors';
import { logger } from '../utils/logger';

export interface GnarkProofResult {
  proof: string;
  publicSignals: string;
}

/**
 * Bridge for gnark proving operations.
 * Handles communication with native gnark libraries.
 */
export class GnarkBridge {
  private eventEmitter: NativeEventEmitter;
  private responseListeners: Map<string, (data: any) => void>;
  private nativeModule: GnarkModuleSpec;
  private activeRequestIds: Set<string>;

  constructor(nativeModule: GnarkModuleSpec) {
    if (!nativeModule) {
      throw new ValidationError(
        'Gnark native module not available. Please ensure the app is properly built and linked.',
        'nativeModule'
      );
    }

    this.nativeModule = nativeModule;

    this.eventEmitter = new NativeEventEmitter(nativeModule as any);
    this.responseListeners = new Map();
    this.activeRequestIds = new Set();

    this.eventEmitter.addListener('GnarkRPCResponse', (event) => {
      logger.debug('[GnarkBridge] Received event:', event.id, event.type);

      const { id, response, error } = event;
      const listener = this.responseListeners.get(id);
      if (listener) {
        listener({ response, error });
        this.responseListeners.delete(id);
        this.activeRequestIds.delete(id);
      } else {
        logger.warn('[GnarkBridge] No listener found for request:', id);
      }
    });
  }

  /**
   * Generate a proof using gnark
   * @param witness The witness as a JSON string
   * @param algorithm The encryption algorithm to use (e.g. 'aes-256-ctr', 'aes-128-ctr', 'chacha20')
   * @returns Promise resolving to proof result with request ID
   */
  async prove(
    witness: string,
    algorithm: string
  ): Promise<GnarkProofResult & { requestId: string }> {
    const requestId = Math.random().toString(36).substring(7);

    return new Promise((resolve, reject) => {
      this.activeRequestIds.add(requestId);
      this.responseListeners.set(requestId, ({ response, error }) => {
        logger.debug('[GnarkBridge] Received response for:', requestId);
        this.activeRequestIds.delete(requestId);

        if (error) {
          reject(
            new ProofGenerationError(
              error.message || 'Proof generation failed',
              { algorithm, requestId }
            )
          );
        } else {
          if (!response || !response.proof || !response.publicSignals) {
            logger.error('[GnarkBridge] Invalid response structure:', response);
            reject(
              new ProofGenerationError(
                'Invalid proof response: missing proof or publicSignals',
                { response, requestId }
              )
            );
          } else {
            resolve({ ...response, requestId } as GnarkProofResult & {
              requestId: string;
            });
          }
        }
      });

      logger.debug(
        '[GnarkBridge] Calling native groth16Prove with algorithm:',
        algorithm
      );

      this.nativeModule
        .executeZkFunction(requestId, 'groth16Prove', [witness], algorithm)
        .catch((err: Error) => {
          logger.error('[GnarkBridge] Native module error:', err);
          this.responseListeners.delete(requestId);
          this.activeRequestIds.delete(requestId);
          reject(
            new ProofGenerationError(
              `Failed to start proof generation: ${err.message}`,
              { algorithm, requestId, originalError: err }
            )
          );
        });
    });
  }

  /**
   * Preload a specific algorithm/circuit into native memory (lazy init)
   */
  async preloadAlgorithm(algorithm: string): Promise<void> {
    try {
      const native: any = this.nativeModule as any;
      if (typeof native.preloadAlgorithm === 'function') {
        await native.preloadAlgorithm(algorithm);
      }
    } catch (err) {
      logger.warn('[GnarkBridge] preloadAlgorithm failed (continuing):', err);
    }
  }

  /**
   * Configure bounded on-device native concurrency for gnark
   */
  async setConcurrencyLimit(limit: number): Promise<void> {
    const k = Math.max(1, Math.floor(limit || 1));
    const native: any = this.nativeModule as any;
    if (typeof native.setConcurrencyLimit === 'function') {
      try {
        await native.setConcurrencyLimit(k);
        logger.info('[GnarkBridge] Set native concurrency limit to', k);
      } catch (err) {
        logger.warn('[GnarkBridge] Failed to set concurrency limit:', err);
      }
    }
  }

  /**
   * Cancel an active proof generation
   * @param requestId The request ID of the proof to cancel
   * @returns Promise resolving when cancellation is complete
   */
  async cancelProofGeneration(requestId: string): Promise<void> {
    logger.info('[GnarkBridge] Cancelling proof generation for:', requestId);

    // Remove the listener if it exists
    if (this.responseListeners.has(requestId)) {
      this.responseListeners.delete(requestId);
      this.activeRequestIds.delete(requestId);
    }

    try {
      // Call native module to cancel
      await (this.nativeModule as any).cancelProofGeneration(requestId);
    } catch (err) {
      logger.error('[GnarkBridge] Error cancelling proof generation:', err);
      throw new ProofGenerationError(
        `Failed to cancel proof generation: ${(err as Error).message}`,
        { requestId, originalError: err }
      );
    }
  }

  /**
   * Cancel all active proof generations
   * @returns Promise resolving when all cancellations are complete
   */
  async cancelAllProofs(): Promise<void> {
    logger.info('[GnarkBridge] Cancelling all active proofs');

    const activeIds = Array.from(this.activeRequestIds);

    // Cancel all active requests
    await Promise.all(
      activeIds.map((requestId) => this.cancelProofGeneration(requestId))
    );
  }

  /**
   * Clean up memory and resources
   * @returns Promise resolving when cleanup is complete
   */
  async cleanupMemory(): Promise<void> {
    logger.info('[GnarkBridge] Cleaning up memory');

    // Cancel all active proofs first
    await this.cancelAllProofs();

    try {
      // Call native module to clean up memory
      await (this.nativeModule as any).cleanupMemory();
    } catch (err) {
      logger.error('[GnarkBridge] Error cleaning up memory:', err);
      throw new ProofGenerationError(
        `Failed to clean up memory: ${(err as Error).message}`,
        { originalError: err }
      );
    }
  }

  /**
   * Get the current request ID for the last proof request
   * @returns The current request ID or null if no active request
   */
  getCurrentRequestId(): string | null {
    const activeIds = Array.from(this.activeRequestIds);
    return activeIds.length > 0 ? activeIds[activeIds.length - 1]! : null;
  }

  /**
   * Get number of active gnark requests
   */
  getActiveCount(): number {
    return this.activeRequestIds.size;
  }

  /**
   * Wait until there are no active gnark requests, or timeout
   * @param timeoutMs max time to wait
   */
  async waitForIdle(timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    while (this.getActiveCount() > 0) {
      if (Date.now() - start > timeoutMs) {
        throw new Error('Timed out waiting for gnark to become idle');
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  dispose(): void {
    // Cancel all active proofs before disposing
    this.cancelAllProofs().catch((err) => {
      logger.error(
        '[GnarkBridge] Error cancelling proofs during disposal:',
        err
      );
    });

    this.eventEmitter.removeAllListeners('GnarkRPCResponse');
    this.responseListeners.clear();
    this.activeRequestIds.clear();
  }
}
