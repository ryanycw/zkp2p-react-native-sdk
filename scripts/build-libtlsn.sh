#!/bin/bash

# Script to build and fix install names for libtlsnprover

echo "Fixing install names for libtlsnprover xcframework..."

# Fix iOS simulator framework
install_name_tool -id @rpath/libtlsnprover.framework/libtlsnprover ios/libtlsnprover.xcframework/ios-arm64_x86_64-simulator/libtlsnprover.framework/libtlsnprover

# Fix iOS device framework
install_name_tool -id @rpath/libtlsnprover.framework/libtlsnprover ios/libtlsnprover.xcframework/ios-arm64/libtlsnprover.framework/libtlsnprover

echo "Install name fixes completed."