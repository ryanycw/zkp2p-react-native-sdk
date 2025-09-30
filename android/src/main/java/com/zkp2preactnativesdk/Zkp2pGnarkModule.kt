package com.zkp2preactnativesdk

import android.util.Log
import android.util.Base64
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import org.json.JSONObject
import org.json.JSONArray
import java.io.File
import java.io.InputStream

class Zkp2pGnarkModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {

    private val coroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val initializedAlgorithms = mutableSetOf<String>()
    private val algorithmIdMap = mutableMapOf<String, Int>()
    private var hasListeners = false
    private val activeProofJobs = mutableMapOf<String, Job>()
    private val cancelledTasks = mutableSetOf<String>()
    @Volatile private var concurrencyLimit: Int = 1
    @Volatile private var semaphore: Semaphore = Semaphore(1)
    
    data class AlgorithmConfig(
        val name: String,
        val id: Int,
        val fileExt: String
    )
    
    companion object {
        const val NAME = "Zkp2pGnarkModule"
        
        private val ALGORITHM_CONFIGS = arrayOf(
            AlgorithmConfig("chacha20", 0, "chacha20"),
            AlgorithmConfig("aes-128-ctr", 1, "aes128"),
            AlgorithmConfig("aes-256-ctr", 2, "aes256")
        )

        init {
            try {
                System.loadLibrary("gnarkprover")
                System.loadLibrary("gnark_bridge")
            } catch (e: UnsatisfiedLinkError) {
                Log.e(
                    NAME,
                    "FATAL: Failed to load native libraries. " +
                    "Ensure both libgnarkprover.so and libgnark_bridge.so are available.",
                    e
                )
                throw e
            }
        }
    }

    init {
        for (config in ALGORITHM_CONFIGS) {
            algorithmIdMap[config.name] = config.id
        }
    }

    override fun getName(): String = NAME

    override fun invalidate() {
        super.invalidate()
        coroutineScope.cancel()
    }
    
    private fun getConfigByName(name: String): AlgorithmConfig? {
        return ALGORITHM_CONFIGS.firstOrNull { it.name == name }
    }

    private fun ensureAlgorithmInitialized(name: String): Boolean {
        synchronized(this) {
            if (initializedAlgorithms.contains(name)) return true
        }
        val cfg = getConfigByName(name) ?: run {
            Log.e(NAME, "[Zkp2pGnarkModule] Unknown algorithm: $name")
            return false
        }
        return try {
            val pkFilename = "pk.${cfg.fileExt}"
            val r1csFilename = "r1cs.${cfg.fileExt}"

            val pkData = readAssetFile(pkFilename)
            val r1csData = readAssetFile(r1csFilename)

            if (pkData == null || r1csData == null) {
                Log.e(NAME, "[Zkp2pGnarkModule] ERROR: Circuit files not found for ${cfg.name}")
                false
            } else {
                val result = nativeInitAlgorithm(cfg.id, pkData, r1csData)
                if (result == 1) {
                    synchronized(this) { initializedAlgorithms.add(cfg.name) }
                    Log.d(NAME, "[Zkp2pGnarkModule] Initialized algorithm: ${cfg.name}")
                    true
                } else {
                    Log.e(NAME, "[Zkp2pGnarkModule] ERROR: Failed to initialize ${cfg.name} (id: ${cfg.id})")
                    false
                }
            }
        } catch (e: Exception) {
            Log.e(NAME, "[Zkp2pGnarkModule] Exception initializing ${cfg?.name ?: name}", e)
            false
        } catch (e: UnsatisfiedLinkError) {
            Log.e(NAME, "[Zkp2pGnarkModule] Native method not found for ${cfg?.name ?: name}", e)
            false
        } catch (e: Error) {
            Log.e(NAME, "[Zkp2pGnarkModule] Error initializing ${cfg?.name ?: name}", e)
            false
        }
    }
    
    private fun readAssetFile(filename: String): ByteArray? {
        return try {
            val assetPath = "gnark-circuits/$filename"
            reactApplicationContext.assets.open(assetPath).use { inputStream ->
                inputStream.readBytes()
            }
        } catch (e: Exception) {
            Log.e(NAME, "[Zkp2pGnarkModule] Failed to read asset file: $filename", e)
            null
        }
    }


    @ReactMethod
    fun executeZkFunction(
        requestId: String,
        functionName: String,
        args: ReadableArray,
        algorithm: String,
        promise: Promise
    ) {
        // Check if task was already cancelled
        if (cancelledTasks.contains(requestId)) {
            cancelledTasks.remove(requestId)
            val errorMsg = "Proof generation was cancelled"
            sendResponse(requestId, null, Exception(errorMsg))
            promise.reject("CANCELLED", errorMsg)
            return
        }
        
        val job = coroutineScope.launch(Dispatchers.IO) {
            try {
                when (functionName) {
                    "groth16Prove" -> {
                        Log.d(NAME, "[Zkp2pGnarkModule] groth16Prove called with algorithm: $algorithm")
                        // Lazy initialize requested algorithm if provided
                        if (algorithm.isNotBlank()) {
                            ensureAlgorithmInitialized(algorithm)
                        }
                        
                        // Check cancellation before starting
                        var cancelled = false
                        synchronized(this@Zkp2pGnarkModule) {
                            cancelled = cancelledTasks.contains(requestId)
                            if (cancelled) cancelledTasks.remove(requestId)
                        }
                        if (cancelled) {
                            Log.d(NAME, "[Zkp2pGnarkModule] Cancellation detected before acquiring permit (queued) for request: $requestId")
                            throw CancellationException("Proof generation was cancelled")
                        }
                        
                        // Bounded on-device concurrency (cancellable)
                        val result = semaphore.withPermit {
                            groth16Prove(args, requestId)
                        }
                        
                        // Check cancellation after proof generation
                        var cancelledAfter = false
                        synchronized(this@Zkp2pGnarkModule) {
                            cancelledAfter = cancelledTasks.contains(requestId)
                            if (cancelledAfter) cancelledTasks.remove(requestId)
                        }
                        if (cancelledAfter) {
                            Log.d(NAME, "[Zkp2pGnarkModule] Cancellation detected after execution (in-flight) for request: $requestId")
                            throw CancellationException("Proof generation was cancelled")
                        }
                        
                        sendResponse(requestId, result, null)
                        promise.resolve(null)
                    }
                    else -> throw Exception("Unsupported ZK function: $functionName")
                }
            } catch (e: CancellationException) {
                Log.d(NAME, "Proof generation cancelled for request: $requestId")
                sendResponse(requestId, null, Exception("Proof generation was cancelled"))
                promise.reject("CANCELLED", e.message)
            } catch (e: Exception) {
                Log.e(NAME, "ZK function execution failed", e)
                sendResponse(requestId, null, e)
                promise.reject("EXECUTION_ERROR", e.message, e)
            } finally {
                synchronized(this@Zkp2pGnarkModule) { activeProofJobs.remove(requestId) }
            }
        }
        synchronized(this) { activeProofJobs[requestId] = job }
    }

    private fun groth16Prove(args: ReadableArray, requestId: String): WritableMap {
        // Periodically check for cancellation
        val cancelledNow = synchronized(this) { cancelledTasks.contains(requestId) }
        if (cancelledNow) {
            throw CancellationException("Proof generation was cancelled")
        }
        
        val argString = args.getString(0) ?: throw IllegalArgumentException("Witness argument is null")
        
        val base64Value = try {
            val argObject = JSONObject(argString)
            argObject.optString("value") ?: argString
        } catch (e: Exception) {
            argString
        }
        
        val witnessBytes = try {
            Base64.decode(base64Value, Base64.DEFAULT)
        } catch (e: Exception) {
            throw IllegalArgumentException("Failed to decode base64 witness data: ${e.message}")
        }
        
        val witnessJson = String(witnessBytes, Charsets.UTF_8)
        
        // If nothing initialized yet, try to infer and initialize from witness
        if (synchronized(this) { initializedAlgorithms.isEmpty() }) {
            try {
                val argString = args.getString(0)
                val base64Value = try {
                    val argObject = JSONObject(argString)
                    argObject.optString("value") ?: argString
                } catch (e: Exception) { argString }
                val witnessBytes = Base64.decode(base64Value, Base64.DEFAULT)
                val witnessJson = String(witnessBytes, Charsets.UTF_8)
                val obj = JSONObject(witnessJson)
                val cipher = obj.optString("cipher", "")
                if (cipher.isNotBlank()) {
                    ensureAlgorithmInitialized(cipher)
                }
            } catch (_: Exception) { /* ignore */ }
        }
        
        try {
            val witnessObj = JSONObject(witnessJson)
            val cipher = witnessObj.optString("cipher", "unknown")
            
        if (!synchronized(this) { initializedAlgorithms.contains(cipher) }) {
                Log.w(NAME, "[Zkp2pGnarkModule] WARNING: Cipher '$cipher' not found in initialized algorithms: $initializedAlgorithms")
            }
        } catch (e: Exception) {
            // Ignore if witness is not JSON
        }
        
        // Check cancellation before calling native prove
        if (synchronized(this) { cancelledTasks.contains(requestId) }) {
            throw CancellationException("Proof generation was cancelled")
        }
        
        Log.d(NAME, "[Zkp2pGnarkModule] Calling Prove function")
        
        val resultJson = nativeProve(witnessJson)
        
        return try {
            val resultObj = JSONObject(resultJson)
            
            val proofValue = resultObj.optString("proof", "")
            val publicSignalsValue = resultObj.optString("publicSignals", "")
            
            if (proofValue.isEmpty() || publicSignalsValue.isEmpty()) {
                throw Exception("Missing proof or publicSignals in result")
            }
            
            Log.d(NAME, "[Zkp2pGnarkModule] Proof generated successfully")
            
            Arguments.createMap().apply {
                putString("proof", proofValue)
                putString("publicSignals", publicSignalsValue)
            }
        } catch (e: Exception) {
            if (!resultJson.startsWith("{") && !resultJson.startsWith("[")) {
                Log.e(NAME, "[Zkp2pGnarkModule] Native error: $resultJson")
                throw Exception(resultJson)
            } else {
                val errorMsg = "Failed to parse result: ${e.message}"
                Log.e(NAME, "[Zkp2pGnarkModule] ERROR: $errorMsg")
                throw Exception(errorMsg)
            }
        }
    }

    private fun sendResponse(requestId: String, response: WritableMap?, error: Exception?) {
        if (!hasListeners) return
        val body = Arguments.createMap().apply {
            putString("id", requestId)
            putString("type", if (error != null) "error" else "response")
            if (error != null) {
                putMap("error", Arguments.createMap().apply {
                    putString("message", error.message ?: "Unknown error")
                })
            } else if (response != null) {
                putMap("response", response)
            }
        }
        reactApplicationContext.runOnUiQueueThread {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("GnarkRPCResponse", body)
        }
    }

    private external fun nativeInitAlgorithm(algorithmId: Int, provingKey: ByteArray, r1cs: ByteArray): Int
    private external fun nativeProve(witnessJson: String): String

    @ReactMethod
    fun addListener(eventName: String) {
        hasListeners = true
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        hasListeners = false
    }
    
    fun supportedEvents(): Array<String> {
        return arrayOf("GnarkRPCResponse")
    }
    
    @ReactMethod
    fun preloadAlgorithm(algorithm: String, promise: Promise) {
        coroutineScope.launch {
            val ok = ensureAlgorithmInitialized(algorithm)
            if (ok) {
                promise.resolve(Arguments.createMap().apply { putBoolean("success", true) })
            } else {
                promise.reject("PRELOAD_FAILED", "Failed to initialize algorithm: $algorithm")
            }
        }
    }

    @ReactMethod
    fun cancelProofGeneration(requestId: String, promise: Promise) {
        Log.d(NAME, "[Zkp2pGnarkModule] Cancelling proof generation for request: $requestId")
        
        // Mark as cancelled
        synchronized(this) { cancelledTasks.add(requestId) }
        
        // Cancel the coroutine job if it exists
        synchronized(this) {
            val job = activeProofJobs[requestId]
            if (job != null) {
                Log.d(NAME, "[Zkp2pGnarkModule] Found active job; cancelling immediately for request: $requestId")
                job.cancel()
                activeProofJobs.remove(requestId)
            } else {
                Log.d(NAME, "[Zkp2pGnarkModule] No active job; cancellation will apply when queued/in-flight for request: $requestId")
            }
        }
        
        promise.resolve(Arguments.createMap().apply {
            putBoolean("success", true)
        })
    }
    
    @ReactMethod
    fun cleanupMemory(promise: Promise) {
        Log.d(NAME, "[Zkp2pGnarkModule] Cleaning up memory and cancelling all active tasks")
        
        // Cancel all active jobs
        synchronized(this) {
            activeProofJobs.forEach { (requestId, job) ->
                cancelledTasks.add(requestId)
                job.cancel()
            }
            activeProofJobs.clear()
            cancelledTasks.clear()
        }
        
        // Suggest garbage collection (note: this is just a hint to the system)
        System.gc()
        
        promise.resolve(Arguments.createMap().apply {
            putBoolean("success", true)
        })
    }
    
    @ReactMethod
    fun setConcurrencyLimit(limit: Int, promise: Promise) {
        val k = if (limit < 1) 1 else limit
        concurrencyLimit = k
        semaphore = Semaphore(k)
        promise.resolve(Arguments.createMap().apply {
            putBoolean("success", true)
            putInt("limit", k)
        })
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        Log.d(NAME, "[Zkp2pGnarkModule] Catalyst instance destroying, cleaning up resources")
        
        // Cancel all active jobs
        activeProofJobs.forEach { (requestId, job) ->
            cancelledTasks.add(requestId)
            job.cancel()
        }
        activeProofJobs.clear()
        cancelledTasks.clear()
        
        // Cancel the coroutine scope
        coroutineScope.cancel()
    }
} 
