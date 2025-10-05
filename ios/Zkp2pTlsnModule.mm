#import "Zkp2pTlsnModule.h"
#import <React/RCTBridge+Private.h>
#import <React/RCTUtils.h>
#import <jsi/jsi.h>
#import <ReactCommon/RCTTurboModule.h>

#include "../cpp/libtlsnprover/tlsnprover.h"

using namespace facebook::jsi;
using namespace std;
using namespace tlsnprover;

@implementation Zkp2pTlsnModule

@synthesize bridge = _bridge;

RCT_EXPORT_MODULE(Zkp2pTlsnModule)

+ (BOOL)requiresMainQueueSetup {
    return YES;
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(install) {
    RCTCxxBridge *cxxBridge = (RCTCxxBridge *)_bridge;
    if (cxxBridge == nil) {
        return @false;
    }

    auto jsiRuntime = (facebook::jsi::Runtime *)cxxBridge.runtime;
    if (jsiRuntime == nil) {
        return @false;
    }

    auto &runtime = *jsiRuntime;
    [self installJSIBindings:runtime];
    return @true;
}

- (void)installJSIBindings:(facebook::jsi::Runtime &)runtime {
    // tlsn_init
    auto tlsnInit = Function::createFromHostFunction(
        runtime,
        PropNameID::forAscii(runtime, "tlsnInit"),
        0,
        [](Runtime& runtime, const Value& thisValue, const Value* arguments, size_t count) -> Value {
            try {
                int32_t result = tlsn_init();
                return Value(result);
            } catch (const std::exception& e) {
                throw JSError(runtime, e.what());
            }
        }
    );
    runtime.global().setProperty(runtime, "tlsnInit", std::move(tlsnInit));

    // tlsn_prove
    auto tlsnProve = Function::createFromHostFunction(
        runtime,
        PropNameID::forAscii(runtime, "tlsnProve"),
        12,
        [](Runtime& runtime, const Value& thisValue, const Value* arguments, size_t count) -> Value {
            try {
                if (count < 12) {
                    throw JSError(runtime, "tlsnProve requires 12 arguments");
                }

                int32_t mode = static_cast<int32_t>(arguments[0].asNumber());
                std::string url = arguments[1].asString(runtime).utf8(runtime);
                std::string cookie = arguments[2].asString(runtime).utf8(runtime);
                std::string accessToken = arguments[3].asString(runtime).utf8(runtime);
                std::string userAgent = arguments[4].asString(runtime).utf8(runtime);
                std::string providerHost = arguments[5].asString(runtime).utf8(runtime);
                uint16_t providerPort = static_cast<uint16_t>(arguments[6].asNumber());
                std::string notaryHost = arguments[7].asString(runtime).utf8(runtime);
                uint16_t notaryPort = static_cast<uint16_t>(arguments[8].asNumber());
                bool notaryTlsEnabled = arguments[9].getBool();
                uintptr_t maxSentData = static_cast<uintptr_t>(arguments[10].asNumber());
                uintptr_t maxRecvData = static_cast<uintptr_t>(arguments[11].asNumber());

                int32_t result = tlsn_prove(
                    mode,
                    url.c_str(),
                    cookie.c_str(),
                    accessToken.c_str(),
                    userAgent.c_str(),
                    providerHost.c_str(),
                    providerPort,
                    notaryHost.c_str(),
                    notaryPort,
                    notaryTlsEnabled,
                    maxSentData,
                    maxRecvData
                );

                return Value(result);
            } catch (const std::exception& e) {
                throw JSError(runtime, e.what());
            }
        }
    );
    runtime.global().setProperty(runtime, "tlsnProve", std::move(tlsnProve));

    // tlsn_verify
    auto tlsnVerify = Function::createFromHostFunction(
        runtime,
        PropNameID::forAscii(runtime, "tlsnVerify"),
        2,
        [](Runtime& runtime, const Value& thisValue, const Value* arguments, size_t count) -> Value {
            try {
                if (count < 2) {
                    throw JSError(runtime, "tlsnVerify requires 2 arguments");
                }

                std::string url = arguments[0].asString(runtime).utf8(runtime);
                std::string unauthedBytes = arguments[1].asString(runtime).utf8(runtime);

                int32_t result = tlsn_verify(url.c_str(), unauthedBytes.c_str());
                return Value(result);
            } catch (const std::exception& e) {
                throw JSError(runtime, e.what());
            }
        }
    );
    runtime.global().setProperty(runtime, "tlsnVerify", std::move(tlsnVerify));

    // tlsn_cleanup
    auto tlsnCleanup = Function::createFromHostFunction(
        runtime,
        PropNameID::forAscii(runtime, "tlsnCleanup"),
        0,
        [](Runtime& runtime, const Value& thisValue, const Value* arguments, size_t count) -> Value {
            try {
                tlsn_cleanup();
                return Value::undefined();
            } catch (const std::exception& e) {
                throw JSError(runtime, e.what());
            }
        }
    );
    runtime.global().setProperty(runtime, "tlsnCleanup", std::move(tlsnCleanup));

    // tlsn_get_last_error
    auto tlsnGetLastError = Function::createFromHostFunction(
        runtime,
        PropNameID::forAscii(runtime, "tlsnGetLastError"),
        0,
        [](Runtime& runtime, const Value& thisValue, const Value* arguments, size_t count) -> Value {
            try {
                const char* error = tlsn_get_last_error();
                if (error && strlen(error) > 0) {
                    return String::createFromUtf8(runtime, error);
                }
                return Value::null();
            } catch (const std::exception& e) {
                throw JSError(runtime, e.what());
            }
        }
    );
    runtime.global().setProperty(runtime, "tlsnGetLastError", std::move(tlsnGetLastError));
}

@end
