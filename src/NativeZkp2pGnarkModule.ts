export interface Spec {
  executeZkFunction(
    requestId: string,
    functionName: string,
    args: string[],
    algorithm: string
  ): Promise<void>;

  addListener(eventName: string): void;
  removeListeners(count: number): void;

  // Platform implementations exist on both Android (Kotlin) and iOS (ObjC++)
  cancelProofGeneration(requestId: string): Promise<any>;
  cleanupMemory(): Promise<any>;

  // Preload a single algorithm/circuit lazily
  preloadAlgorithm(algorithm: string): Promise<any>;
}
