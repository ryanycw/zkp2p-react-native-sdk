package com.zkp2preactnativesdk

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class Zkp2pTlsnModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "Zkp2pTlsnModule"

        init {
            System.loadLibrary("tlsnprover")
            System.loadLibrary("zkp2preactnativesdk")
        }
    }

    override fun getName(): String = NAME

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun install(): Boolean {
        try {
            val runtime = reactApplicationContext.javaScriptContextHolder?.get()
            if (runtime == null || runtime == 0L) {
                throw RuntimeException("JSI Runtime is not available")
            }
            nativeInstall(runtime)
            return true
        } catch (e: Exception) {
            throw RuntimeException("Failed to install TLSN JSI bindings: ${e.message}", e)
        }
    }

    private external fun nativeInstall(jsiRuntimePtr: Long)
}
