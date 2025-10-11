cmake_minimum_required(VERSION 3.13)
project(zkp2p_native_modules)

find_package(ReactAndroid REQUIRED CONFIG)
find_package(fbjni REQUIRED CONFIG)
find_library(LOG_LIB log)

set(JNI_LIBS ${CMAKE_CURRENT_SOURCE_DIR}/src/main/jniLibs/${ANDROID_ABI})

# Gnark bridge (JNI)
add_library(gnark_bridge SHARED src/main/jni/gnark_bridge.c)
target_include_directories(gnark_bridge PRIVATE src/main/jni)

add_library(gnarkprover SHARED IMPORTED)
set_target_properties(gnarkprover PROPERTIES IMPORTED_LOCATION ${JNI_LIBS}/libgnarkprover.so)

target_link_libraries(gnark_bridge ${LOG_LIB} gnarkprover)

# TLSN bridge (JSI)
add_library(zkp2preactnativesdk SHARED cpp-adapter.cpp)
target_include_directories(zkp2preactnativesdk PRIVATE ../cpp/libtlsnprover)

add_library(tlsnprover SHARED IMPORTED)
set_target_properties(tlsnprover PROPERTIES
  IMPORTED_LOCATION ${JNI_LIBS}/libtlsnprover.so
  IMPORTED_NO_SONAME TRUE
)

target_link_libraries(zkp2preactnativesdk
  ${LOG_LIB}
  android
  ReactAndroid::jsi
  ReactAndroid::reactnative
  fbjni::fbjni
  tlsnprover
)
