/**
 * TLSN Prover JSI Interface
 * Direct bindings to TLSN native functions
 */

import { NativeModules, Platform } from 'react-native';

const TlsnModule = NativeModules.Zkp2pTlsnModule;

// Install JSI bindings on iOS
if (Platform.OS === 'ios' && TlsnModule?.install) {
  const result = TlsnModule.install();
  if (!result) {
    console.error('Failed to install TLSN JSI bindings');
  }
}

declare global {
  /**
   * Initialize TLSN prover
   * @returns 0 on success, error code on failure
   */
  var tlsnInit: () => number;

  /**
   * Generate TLSN proof
   * @param mode Proof mode
   * @param url Target URL
   * @param cookie Cookie string
   * @param accessToken Access token
   * @param userAgent User agent string
   * @param providerHost Provider host
   * @param providerPort Provider port
   * @param notaryHost Notary host
   * @param notaryPort Notary port
   * @param notaryTlsEnabled Notary TLS enabled
   * @param maxSentData Max sent data
   * @param maxRecvData Max received data
   * @returns 0 on success, error code on failure
   */
  var tlsnProve: (
    mode: number,
    url: string,
    cookie: string,
    accessToken: string,
    userAgent: string,
    providerHost: string,
    providerPort: number,
    notaryHost: string,
    notaryPort: number,
    notaryTlsEnabled: boolean,
    maxSentData: number,
    maxRecvData: number
  ) => number;

  /**
   * Verify TLSN proof
   * @param url Target URL
   * @param unauthedBytes Unauthenticated bytes
   * @returns 0 on success, error code on failure
   */
  var tlsnVerify: (url: string, unauthedBytes: string) => number;

  /**
   * Cleanup TLSN resources
   */
  var tlsnCleanup: () => void;

  /**
   * Get last error message
   * @returns Error string or null
   */
  var tlsnGetLastError: () => string | null;
}

/**
 * TLSN Prover wrapper
 */
export class TlsnProver {
  private static nativeInitialized = false;

  async initialize(): Promise<void> {
    if (TlsnProver.nativeInitialized) return;

    const result = global.tlsnInit();
    if (result !== 0) {
      const error = global.tlsnGetLastError();
      throw new Error(`TLSN init failed: ${error || 'Unknown error'}`);
    }

    TlsnProver.nativeInitialized = true;
  }

  async prove(params: {
    mode: number;
    url: string;
    cookie: string;
    accessToken: string;
    userAgent: string;
    providerHost: string;
    providerPort: number;
    notaryHost: string;
    notaryPort: number;
    notaryTlsEnabled: boolean;
    maxSentData: number;
    maxRecvData: number;
  }): Promise<void> {
    if (!TlsnProver.nativeInitialized) {
      await this.initialize();
    }

    const result = global.tlsnProve(
      params.mode,
      params.url,
      params.cookie,
      params.accessToken,
      params.userAgent,
      params.providerHost,
      params.providerPort,
      params.notaryHost,
      params.notaryPort,
      params.notaryTlsEnabled,
      params.maxSentData,
      params.maxRecvData
    );

    if (result !== 0) {
      const error = global.tlsnGetLastError();
      throw new Error(`TLSN prove failed: ${error || 'Unknown error'}`);
    }
  }

  async verify(url: string, unauthedBytes: string): Promise<void> {
    if (!TlsnProver.nativeInitialized) {
      await this.initialize();
    }

    const result = global.tlsnVerify(url, unauthedBytes);
    if (result !== 0) {
      const error = global.tlsnGetLastError();
      throw new Error(`TLSN verify failed: ${error || 'Unknown error'}`);
    }
  }

  cleanup(): void {
    if (TlsnProver.nativeInitialized) {
      global.tlsnCleanup();
      TlsnProver.nativeInitialized = false;
    }
  }
}
