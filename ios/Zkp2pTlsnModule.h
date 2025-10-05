#import <React/RCTBridgeModule.h>

@interface Zkp2pTlsnModule : NSObject <RCTBridgeModule>

@property(nonatomic, assign) BOOL setBridgeOnMainQueue;

@end

// TODO: Put TlsnModule and GnarkModule into a single module