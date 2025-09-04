module.exports = {
  // Ensure gnark circuits are bundled as app assets on Android/iOS
  assets: ['gnark-circuits'],
  // Explicitly choose the Android package that registers BOTH modules
  dependency: {
    platforms: {
      android: {
        packageImportPath:
          'import com.zkp2preactnativesdk.Zkp2pReactNativeSdkPackage;',
        packageInstance: 'new Zkp2pReactNativeSdkPackage()',
      },
    },
  },
};
