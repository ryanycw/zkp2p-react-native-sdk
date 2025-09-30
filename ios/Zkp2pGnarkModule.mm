#import "Zkp2pGnarkModule.h"
#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import "libgnarkprover.h"

#ifdef RCT_NEW_ARCH_ENABLED
#import <ReactCommon/RCTTurboModule.h>
#import <FBReactNativeSpec/FBReactNativeSpec.h>

@protocol NativeZkp2pGnarkModuleSpec <RCTBridgeModule, RCTTurboModule>

- (void)executeZkFunction:(NSString *)requestId
              functionName:(NSString *)functionName
                     args:(NSArray<NSString *> *)args
                algorithm:(NSString *)algorithm
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject;

@end
#endif

// Algorithm configuration
typedef struct {
    NSString *name;
    NSUInteger id;
    NSString *fileExt;
} AlgorithmConfig;

static const AlgorithmConfig ALGORITHM_CONFIGS[] = {
    {@"chacha20", 0, @"chacha20"},
    {@"aes-128-ctr", 1, @"aes128"},
    {@"aes-256-ctr", 2, @"aes256"},
};
static const NSUInteger ALGORITHM_COUNT = 3;

@interface Zkp2pGnarkModule ()
@property (nonatomic, strong) NSMutableSet<NSString *> *initializedAlgorithms;
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSNumber *> *algorithmIdMap;
@property (nonatomic, strong) NSMutableSet<NSString *> *cancelledRequests;
@property (nonatomic, strong) NSOperationQueue *gnarkQueue;
@property (nonatomic, assign) NSInteger concurrencyLimit;
@property (nonatomic, assign) BOOL queueInitialized;
@property (nonatomic) dispatch_queue_t stateQueue;
@end

@implementation Zkp2pGnarkModule {
    bool hasListeners;
}

RCT_EXPORT_MODULE(Zkp2pGnarkModule)

+ (BOOL)requiresMainQueueSetup
{
    return NO;
}

- (instancetype)init
{
    if (self = [super init]) {
        self.initializedAlgorithms = [NSMutableSet set];
        self.algorithmIdMap = [NSMutableDictionary dictionary];
        self.cancelledRequests = [NSMutableSet set];
        self.concurrencyLimit = 1; // conservative default
        self.gnarkQueue = [[NSOperationQueue alloc] init];
        self.gnarkQueue.maxConcurrentOperationCount = (int)self.concurrencyLimit;
        self.gnarkQueue.qualityOfService = NSQualityOfServiceUserInitiated;
        self.queueInitialized = YES;
        self.stateQueue = dispatch_queue_create("com.zkp2p.gnark.state", DISPATCH_QUEUE_SERIAL);
        
        // Initialize gnark binding
        enforce_binding();
        
        for (NSUInteger i = 0; i < ALGORITHM_COUNT; i++) {
            AlgorithmConfig config = ALGORITHM_CONFIGS[i];
            self.algorithmIdMap[config.name] = @(config.id);
        }
    }
    return self;
}

// Lazy initialize a single algorithm on-demand
- (BOOL)initializeAlgorithmIfNeeded:(NSString *)algorithmName
{
    if (!algorithmName) { return NO; }

    __block BOOL alreadyInitialized = NO;
    dispatch_sync(self.stateQueue, ^{
        alreadyInitialized = [self.initializedAlgorithms containsObject:algorithmName];
    });
    if (alreadyInitialized) {
        return YES;
    }

    __block BOOL success = NO;
    __block NSNumber *algIdNum = nil;
    dispatch_sync(self.stateQueue, ^{
        algIdNum = self.algorithmIdMap[algorithmName];
    });
    if (!algIdNum) {
        NSLog(@"[Zkp2pGnarkModule] Unknown algorithm: %@", algorithmName);
        return NO;
    }

    NSUInteger algId = [algIdNum unsignedIntegerValue];
    AlgorithmConfig config = ALGORITHM_CONFIGS[algId];

    // Perform initialization fully under stateQueue to serialize init
    dispatch_sync(self.stateQueue, ^{
        if ([self.initializedAlgorithms containsObject:algorithmName]) {
            success = YES;
            return;
        }

        NSBundle *mainBundle = [NSBundle mainBundle];
        NSString *pkFilename = [NSString stringWithFormat:@"pk.%@", config.fileExt];
        NSString *r1csFilename = [NSString stringWithFormat:@"r1cs.%@", config.fileExt];

        NSString *pkPath = [mainBundle pathForResource:pkFilename ofType:nil];
        NSString *r1csPath = [mainBundle pathForResource:r1csFilename ofType:nil];

        if (!pkPath || !r1csPath) {
            NSLog(@"[Zkp2pGnarkModule] ERROR: Circuit files not found for %@", algorithmName);
            success = NO;
            return;
        }

        NSError *error = nil;
        NSData *pkData = [NSData dataWithContentsOfFile:pkPath options:0 error:&error];
        if (error || !pkData) {
            NSLog(@"[Zkp2pGnarkModule] ERROR: Failed to load %@: %@", pkFilename, error);
            success = NO;
            return;
        }
        NSData *r1csData = [NSData dataWithContentsOfFile:r1csPath options:0 error:&error];
        if (error || !r1csData) {
            NSLog(@"[Zkp2pGnarkModule] ERROR: Failed to load %@: %@", r1csFilename, error);
            success = NO;
            return;
        }

        GoSlice pkSlice;
        pkSlice.data = (void *)[pkData bytes];
        pkSlice.len = [pkData length];
        pkSlice.cap = [pkData length];

        GoSlice r1csSlice;
        r1csSlice.data = (void *)[r1csData bytes];
        r1csSlice.len = [r1csData length];
        r1csSlice.cap = [r1csData length];

        GoUint8 result = InitAlgorithm((GoUint8)algId, pkSlice, r1csSlice);
        if (result == 1) {
            [self.initializedAlgorithms addObject:algorithmName];
            NSLog(@"[Zkp2pGnarkModule] Initialized algorithm: %@", algorithmName);
            success = YES;
        } else {
            NSLog(@"[Zkp2pGnarkModule] ERROR: Failed to initialize %@ (id: %lu)", algorithmName, (unsigned long)algId);
            success = NO;
        }
    });

    return success;
}

- (void)startObserving
{
    hasListeners = YES;
}

- (void)stopObserving
{
    hasListeners = NO;
}

- (NSArray<NSString *> *)supportedEvents
{
    return @[@"GnarkRPCResponse"];
}

- (void)sendResponse:(NSString *)requestId response:(NSDictionary *)response error:(NSDictionary *)error
{
    if (!hasListeners) { return; }
    NSMutableDictionary *event = [NSMutableDictionary dictionary];
    event[@"id"] = requestId ?: @"";
    event[@"type"] = error ? @"error" : @"response";
    if (response) { event[@"response"] = response; }
    if (error) { event[@"error"] = error; }
    dispatch_async(dispatch_get_main_queue(), ^{
        [self sendEventWithName:@"GnarkRPCResponse" body:event];
    });
}



RCT_EXPORT_METHOD(executeZkFunction:(NSString *)requestId
                  functionName:(NSString *)functionName
                  args:(NSArray<NSString *> *)args
                  algorithm:(NSString *)algorithm
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    if (!self.queueInitialized) {
        self.gnarkQueue = [[NSOperationQueue alloc] init];
        self.gnarkQueue.maxConcurrentOperationCount = (int)MAX(1, self.concurrencyLimit);
        self.gnarkQueue.qualityOfService = NSQualityOfServiceUserInitiated;
        self.queueInitialized = YES;
    }
    __weak __typeof(self) weakSelf = self;
    [self.gnarkQueue addOperationWithBlock:^{
        @autoreleasepool {
        Zkp2pGnarkModule *strongSelf = weakSelf;
        if (!strongSelf) { return; }
        @try {
            // Check if cancelled
            __block BOOL isCancelled = NO;
            dispatch_sync(strongSelf.stateQueue, ^{
                isCancelled = [strongSelf.cancelledRequests containsObject:requestId];
                if (isCancelled) { [strongSelf.cancelledRequests removeObject:requestId]; }
            });
            if (isCancelled) {
                NSLog(@"[Zkp2pGnarkModule] Cancellation detected pre-start (queued) for request: %@", requestId);
                NSString *errorMsg = @"Proof generation was cancelled";
                [strongSelf sendResponse:requestId response:nil error:@{@"message": errorMsg}];
                dispatch_async(dispatch_get_main_queue(), ^{ reject(@"CANCELLED", errorMsg, nil); });
                return;
            }
            
            if ([functionName isEqualToString:@"groth16Prove"] && args.count > 0) {
                
                NSString *argString = args[0];
                
                NSError *jsonError;
                NSData *argData = [argString dataUsingEncoding:NSUTF8StringEncoding];
                NSDictionary *argDict = [NSJSONSerialization JSONObjectWithData:argData options:0 error:&jsonError];
                
                NSString *base64Value;
                if (jsonError || ![argDict isKindOfClass:[NSDictionary class]]) {
                    base64Value = argString;
                } else {
                    base64Value = argDict[@"value"];
                }
                
                if (!base64Value) {
                    NSString *errorMsg = @"No base64 value found in argument";
                    [self sendResponse:requestId response:nil error:@{@"message": errorMsg}];
                    reject(@"INVALID_ARGS", errorMsg, nil);
                    return;
                }
                
                NSData *witnessData = [[NSData alloc] initWithBase64EncodedString:base64Value options:0];
                if (!witnessData) {
                    NSString *errorMsg = @"Failed to decode base64 witness data";
                    [self sendResponse:requestId response:nil error:@{@"message": errorMsg}];
                    reject(@"DECODE_ERROR", errorMsg, nil);
                    return;
                }
                
                // Ensure the requested algorithm is initialized lazily
                if (algorithm && algorithm.length > 0) {
                    [strongSelf initializeAlgorithmIfNeeded:algorithm];
                } else {
                    // Try to infer from witness JSON
                    @try {
                        NSDictionary *witnessDict = [NSJSONSerialization JSONObjectWithData:witnessData options:0 error:nil];
                        NSString *cipher = witnessDict[@"cipher"];
                        if (cipher) {
                            [strongSelf initializeAlgorithmIfNeeded:cipher];
                        }
                    } @catch(...) {}
                }

                NSString *witnessString = [[NSString alloc] initWithData:witnessData encoding:NSUTF8StringEncoding];
                if (!witnessString) {
                    NSString *errorMsg = @"Failed to convert witness data to string";
                    [self sendResponse:requestId response:nil error:@{@"message": errorMsg}];
                    reject(@"DECODE_ERROR", errorMsg, nil);
                    return;
                }
                
                NSError *witnessJsonError;
                NSDictionary *witnessDict = [NSJSONSerialization JSONObjectWithData:witnessData options:0 error:&witnessJsonError];
                if (!witnessJsonError) {
                    NSString *cipher = witnessDict[@"cipher"];
                    if (cipher && ![self.initializedAlgorithms containsObject:cipher]) {
                        NSLog(@"[Zkp2pGnarkModule] WARNING: Cipher '%@' not in initialized algorithms: %@", 
                              cipher, self.initializedAlgorithms);
                    }
                }
                
                NSUInteger witnessLength = [witnessData length];
                void *witnessCopy = malloc(witnessLength);
                memcpy(witnessCopy, [witnessData bytes], witnessLength);
                
                // Check if cancelled before proving
                __block BOOL isCancelledAfterCopy = NO;
                dispatch_sync(strongSelf.stateQueue, ^{
                    isCancelledAfterCopy = [strongSelf.cancelledRequests containsObject:requestId];
                    if (isCancelledAfterCopy) { [strongSelf.cancelledRequests removeObject:requestId]; }
                });
                if (isCancelledAfterCopy) {
                    NSLog(@"[Zkp2pGnarkModule] Cancellation detected before Prove for request: %@", requestId);
                    free(witnessCopy);
                    NSString *errorMsg = @"Proof generation was cancelled";
                    [strongSelf sendResponse:requestId response:nil error:@{@"message": errorMsg}];
                    dispatch_async(dispatch_get_main_queue(), ^{ reject(@"CANCELLED", errorMsg, nil); });
                    return;
                }
                
                GoSlice witnessSlice;
                witnessSlice.data = witnessCopy;
                witnessSlice.len = witnessLength;
                witnessSlice.cap = witnessLength;
                
                
                NSLog(@"[Zkp2pGnarkModule] Calling Prove function");
                
                struct Prove_return result = Prove(witnessSlice);
                
                free(witnessCopy);
                
                // Check if cancelled after proving
                __block BOOL isCancelledAfterProve = NO;
                dispatch_sync(strongSelf.stateQueue, ^{
                    isCancelledAfterProve = [strongSelf.cancelledRequests containsObject:requestId];
                    if (isCancelledAfterProve) { [strongSelf.cancelledRequests removeObject:requestId]; }
                });
                if (isCancelledAfterProve) {
                    NSLog(@"[Zkp2pGnarkModule] Cancellation detected after Prove (in-flight) for request: %@", requestId);
                    if (result.r0) {
                        Free(result.r0);
                    }
                    NSString *errorMsg = @"Proof generation was cancelled";
                    [strongSelf sendResponse:requestId response:nil error:@{@"message": errorMsg}];
                    dispatch_async(dispatch_get_main_queue(), ^{ reject(@"CANCELLED", errorMsg, nil); });
                    return;
                }
                
                if (result.r0 && result.r1 > 0) {
                    NSData *resultData = [NSData dataWithBytes:result.r0 length:(NSUInteger)result.r1];
                    
                    Free(result.r0);
                    
                    NSString *resultJson = [[NSString alloc] initWithData:resultData 
                                                                  encoding:NSUTF8StringEncoding];
                    
                    NSError *parseError;
                    NSData *rawData = [resultJson dataUsingEncoding:NSUTF8StringEncoding];
                    NSDictionary *rawDict = [NSJSONSerialization JSONObjectWithData:rawData 
                                                                            options:0 
                                                                              error:&parseError];
                    
                    if (parseError || !rawDict[@"proof"] || !rawDict[@"publicSignals"]) {
                        NSString *errorMsg = [NSString stringWithFormat:@"Failed to parse result: %@", 
                                             parseError ? parseError.localizedDescription : @"Missing proof or publicSignals"];
                        NSLog(@"[Zkp2pGnarkModule] ERROR: %@", errorMsg);
                        [self sendResponse:requestId response:nil error:@{@"message": errorMsg}];
                        reject(@"JSON_ERROR", errorMsg, parseError);
                        return;
                    }
                    
                    NSString *proofValue = rawDict[@"proof"];
                    NSString *publicSignalsValue = rawDict[@"publicSignals"];
                    
                    NSLog(@"[Zkp2pGnarkModule] Proof generated successfully");
                    
                    NSDictionary *response = @{
                        @"proof": proofValue,
                        @"publicSignals": publicSignalsValue
                    };
                    
                    [strongSelf sendResponse:requestId response:response error:nil];
                    dispatch_async(dispatch_get_main_queue(), ^{ resolve(nil); });
                } else {
                    NSString *errorMsg = @"Prove function failed: returned null or empty result";
                    NSLog(@"[Zkp2pGnarkModule] ERROR: %@", errorMsg);
                    [strongSelf sendResponse:requestId response:nil error:@{@"message": errorMsg}];
                    dispatch_async(dispatch_get_main_queue(), ^{ reject(@"PROVE_ERROR", errorMsg, nil); });
                }
                
            } else {
                NSString *errorMsg = [NSString stringWithFormat:@"Unknown function: %@", functionName];
                [strongSelf sendResponse:requestId response:nil error:@{@"message": errorMsg}];
                dispatch_async(dispatch_get_main_queue(), ^{ reject(@"UNKNOWN_FUNCTION", errorMsg, nil); });
            }
        } @catch (NSException *exception) {
            NSString *errorMsg = [NSString stringWithFormat:@"Exception: %@", exception.reason];
            NSLog(@"[Zkp2pGnarkModule] EXCEPTION: %@", errorMsg);
            [strongSelf sendResponse:requestId response:nil error:@{@"message": errorMsg}];
            dispatch_async(dispatch_get_main_queue(), ^{ reject(@"EXCEPTION", errorMsg, nil); });
        }
        }
    }];
}

// Optional preload API to warm up a specific algorithm
RCT_EXPORT_METHOD(preloadAlgorithm:(NSString *)algorithm
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    __weak __typeof(self) weakSelf = self;
    [self.gnarkQueue addOperationWithBlock:^{
        Zkp2pGnarkModule *strongSelf = weakSelf;
        if (!strongSelf) { return; }
        BOOL ok = [strongSelf initializeAlgorithmIfNeeded:algorithm];
        if (ok) {
            dispatch_async(dispatch_get_main_queue(), ^{ resolve(@{ @"success": @YES }); });
        } else {
            NSString *msg = [NSString stringWithFormat:@"Failed to initialize algorithm: %@", algorithm ?: @"(nil)"];
            dispatch_async(dispatch_get_main_queue(), ^{ reject(@"PRELOAD_FAILED", msg, nil); });
        }
    }];
}

RCT_EXPORT_METHOD(cancelProofGeneration:(NSString *)requestId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    NSLog(@"[Zkp2pGnarkModule] Cancelling proof generation for request: %@", requestId);
    
    // Mark as cancelled
    dispatch_async(self.stateQueue, ^{
        [self.cancelledRequests addObject:requestId];
    });
    
    resolve(@{@"success": @YES});
}

RCT_EXPORT_METHOD(cleanupMemory:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    NSLog(@"[Zkp2pGnarkModule] Cleaning up memory");
    
    // Clear cancelled requests
    dispatch_async(self.stateQueue, ^{
        [self.cancelledRequests removeAllObjects];
    });
    
    // Force garbage collection (note: this is just a hint to the system)
    dispatch_async(dispatch_get_main_queue(), ^{
        // This helps trigger memory cleanup
        [[NSURLCache sharedURLCache] removeAllCachedResponses];
    });
    
    resolve(@{@"success": @YES});
}

// Configure native concurrency limit for on-device proving
RCT_EXPORT_METHOD(setConcurrencyLimit:(nonnull NSNumber *)limit
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    NSInteger k = MAX(1, [limit integerValue]);
    self.concurrencyLimit = k;
    if (!self.gnarkQueue) {
        self.gnarkQueue = [[NSOperationQueue alloc] init];
    }
    self.gnarkQueue.maxConcurrentOperationCount = (int)k;
    resolve(@{ @"success": @YES, @"limit": @(k) });
}

@end
