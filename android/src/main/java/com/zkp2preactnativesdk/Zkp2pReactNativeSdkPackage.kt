package com.zkp2preactnativesdk

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import java.util.HashMap

/**
 * Single package that registers both the high-level SDK module and the Gnark module.
 * This avoids relying on autolinking to discover multiple packages.
 */
class Zkp2pReactNativeSdkPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return when (name) {
      Zkp2pReactNativeSdkModule.NAME -> Zkp2pReactNativeSdkModule(reactContext)
      Zkp2pGnarkModule.NAME -> Zkp2pGnarkModule(reactContext)
      Zkp2pTlsnModule.NAME -> Zkp2pTlsnModule(reactContext)
      else -> null
    }
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    return ReactModuleInfoProvider {
      val moduleInfos: MutableMap<String, ReactModuleInfo> = HashMap()

      // High-level SDK module (TurboModule)
      moduleInfos[Zkp2pReactNativeSdkModule.NAME] = ReactModuleInfo(
        Zkp2pReactNativeSdkModule.NAME,
        Zkp2pReactNativeSdkModule.NAME,
        false,  // canOverrideExistingModule
        false,  // needsEagerInit
        false,  // isCxxModule
        true    // isTurboModule
      )

      // Gnark proving module (Classic, not TurboModule)
      moduleInfos[Zkp2pGnarkModule.NAME] = ReactModuleInfo(
        Zkp2pGnarkModule.NAME,
        Zkp2pGnarkModule.NAME,
        false,  // canOverrideExistingModule
        false,  // needsEagerInit
        false,  // isCxxModule
        false   // isTurboModule
      )

      // TLSN proving module (Classic, not TurboModule)
      moduleInfos[Zkp2pTlsnModule.NAME] = ReactModuleInfo(
        Zkp2pTlsnModule.NAME,
        Zkp2pTlsnModule.NAME,
        false,  // canOverrideExistingModule
        false,  // needsEagerInit
        false,  // isCxxModule
        false   // isTurboModule
      )

      moduleInfos
    }
  }
}
