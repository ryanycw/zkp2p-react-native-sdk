#include <fbjni/fbjni.h>
#include <jsi/jsi.h>
#include <string>

#include "../cpp/libtlsnprover/tlsnprover.h"

namespace jsi = facebook::jsi;
namespace jni = facebook::jni;

struct Zkp2pTlsnBridge : jni::JavaClass<Zkp2pTlsnBridge> {
  static constexpr auto kJavaDescriptor = "Lcom/zkp2preactnativesdk/Zkp2pTlsnModule;";

  static void registerNatives() {
    javaClassStatic()->registerNatives({
      makeNativeMethod("nativeInstall", Zkp2pTlsnBridge::nativeInstall)
    });
  }

private:
  static void nativeInstall(jni::alias_ref<jni::JObject> thiz, jlong jsiRuntimePtr) {
    auto runtime = reinterpret_cast<jsi::Runtime*>(jsiRuntimePtr);
    if (!runtime) return;

    // tlsn_init
    auto tlsnInit = jsi::Function::createFromHostFunction(
        *runtime,
        jsi::PropNameID::forAscii(*runtime, "tlsnInit"),
        0,
        [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) -> jsi::Value {
            int32_t result = tlsnprover::tlsn_init();
            return jsi::Value(result);
        }
    );
    runtime->global().setProperty(*runtime, "tlsnInit", std::move(tlsnInit));

    // tlsn_prove
    auto tlsnProve = jsi::Function::createFromHostFunction(
        *runtime,
        jsi::PropNameID::forAscii(*runtime, "tlsnProve"),
        12,
        [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) -> jsi::Value {
            if (count < 12) throw jsi::JSError(rt, "tlsnProve requires 12 arguments");

            int32_t mode = (int32_t)args[0].asNumber();
            std::string url = args[1].asString(rt).utf8(rt);
            std::string cookie = args[2].asString(rt).utf8(rt);
            std::string accessToken = args[3].asString(rt).utf8(rt);
            std::string userAgent = args[4].asString(rt).utf8(rt);
            std::string providerHost = args[5].asString(rt).utf8(rt);
            uint16_t providerPort = (uint16_t)args[6].asNumber();
            std::string notaryHost = args[7].asString(rt).utf8(rt);
            uint16_t notaryPort = (uint16_t)args[8].asNumber();
            bool notaryTlsEnabled = args[9].getBool();
            uintptr_t maxSentData = (uintptr_t)args[10].asNumber();
            uintptr_t maxRecvData = (uintptr_t)args[11].asNumber();

            int32_t result = tlsnprover::tlsn_prove(
                mode, url.c_str(), cookie.c_str(), accessToken.c_str(),
                userAgent.c_str(), providerHost.c_str(), providerPort,
                notaryHost.c_str(), notaryPort, notaryTlsEnabled,
                maxSentData, maxRecvData
            );

            return jsi::Value(result);
        }
    );
    runtime->global().setProperty(*runtime, "tlsnProve", std::move(tlsnProve));

    // tlsn_verify
    auto tlsnVerify = jsi::Function::createFromHostFunction(
        *runtime,
        jsi::PropNameID::forAscii(*runtime, "tlsnVerify"),
        2,
        [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) -> jsi::Value {
            if (count < 2) throw jsi::JSError(rt, "tlsnVerify requires 2 arguments");
            std::string url = args[0].asString(rt).utf8(rt);
            std::string unauthedBytes = args[1].asString(rt).utf8(rt);
            int32_t result = tlsnprover::tlsn_verify(url.c_str(), unauthedBytes.c_str());
            return jsi::Value(result);
        }
    );
    runtime->global().setProperty(*runtime, "tlsnVerify", std::move(tlsnVerify));

    // tlsn_cleanup
    auto tlsnCleanup = jsi::Function::createFromHostFunction(
        *runtime,
        jsi::PropNameID::forAscii(*runtime, "tlsnCleanup"),
        0,
        [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) -> jsi::Value {
            tlsnprover::tlsn_cleanup();
            return jsi::Value::undefined();
        }
    );
    runtime->global().setProperty(*runtime, "tlsnCleanup", std::move(tlsnCleanup));

    // tlsn_get_last_error
    auto tlsnGetLastError = jsi::Function::createFromHostFunction(
        *runtime,
        jsi::PropNameID::forAscii(*runtime, "tlsnGetLastError"),
        0,
        [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) -> jsi::Value {
            const char* error = tlsnprover::tlsn_get_last_error();
            if (error && strlen(error) > 0) {
                return jsi::String::createFromUtf8(rt, error);
            }
            return jsi::Value::null();
        }
    );
    runtime->global().setProperty(*runtime, "tlsnGetLastError", std::move(tlsnGetLastError));
  }
};

JNIEXPORT jint JNI_OnLoad(JavaVM* vm, void*) {
  return jni::initialize(vm, [] {
    Zkp2pTlsnBridge::registerNatives();
  });
}
