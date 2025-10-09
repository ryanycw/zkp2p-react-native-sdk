/**
 * TLSN Prover JSI Interface
 * Direct bindings to TLSN native functions
 */

import { NativeModules } from 'react-native';

const { Zkp2pTlsnModule } = NativeModules;

if (!Zkp2pTlsnModule?.install()) {
  throw new Error('Failed to install TLSN JSI bindings');
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

export const tlsnInit = global.tlsnInit;
export const tlsnProve = global.tlsnProve;
export const tlsnVerify = global.tlsnVerify;
export const tlsnCleanup = global.tlsnCleanup;
export const tlsnGetLastError = global.tlsnGetLastError;

/**
 * Validates TLSN operation result and throws descriptive error if failed
 * @param result The result code from TLSN operation
 * @param operation The operation name for error message
 * @throws Error if result is non-zero
 */
export const validateTlsnResult = (result: number, operation: string): void => {
  if (result !== 0) {
    const error = tlsnGetLastError();
    throw new Error(`TLSN ${operation} failed: ${error || 'Unknown error'}`);
  }
};
