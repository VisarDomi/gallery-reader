#!/bin/bash
set -eu
extension_root=/Users/visar/Developer/gallery-reader-extension
# Target+SDK works on this Hackintosh; scheme destinations incorrectly report
# the installed iOS SDK as missing. Run in the GUI session for Keychain signing.
exec /usr/bin/xcodebuild \
  -project "$extension_root/xcode/Gallery Reader Extension/Gallery Reader Extension.xcodeproj" \
  -target 'Gallery Reader Extension (iOS)' -sdk iphoneos -configuration Debug \
  SYMROOT="$extension_root/build" DEVELOPMENT_TEAM=AVQL5DLWLT \
  IPHONEOS_DEPLOYMENT_TARGET=18.0 \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration build
