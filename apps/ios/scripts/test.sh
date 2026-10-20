#!/bin/bash
# The native core's tests on the Mac: providers against saved responses (Tests/Fixtures),
# then the image and search caches against a stub transport.
set -euo pipefail
cd "$(dirname "$0")/.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/gallery-reader-tests.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
for module in KitCore KitNet; do
  deps=(); [[ $module == KitNet ]] && deps=(-I "$test_dir" -L "$test_dir" -lKitCore)
  xcrun swiftc -parse-as-library -emit-library -emit-module -module-name $module Kit/Sources/$module/*.swift ${deps[@]+"${deps[@]}"} \
    -emit-module-path "$test_dir/$module.swiftmodule" -o "$test_dir/lib$module.dylib" -Xlinker -install_name -Xlinker @rpath/lib$module.dylib
done
xcrun swiftc -parse-as-library -I "$test_dir" -L "$test_dir" -lKitCore -lKitNet -Xlinker -rpath -Xlinker "$test_dir" \
  GalleryReader/Providers.swift Tests/ProviderTests.swift -o "$test_dir/provider-tests"
"$test_dir/provider-tests" Tests/Fixtures
xcrun swiftc -parse-as-library -I "$test_dir" -L "$test_dir" -lKitCore -lKitNet -Xlinker -rpath -Xlinker "$test_dir" \
  GalleryReader/Providers.swift GalleryReader/ImageTransferGate.swift GalleryReader/Library.swift Tests/CacheTests.swift -o "$test_dir/cache-tests"
"$test_dir/cache-tests"
if [[ "${1:-}" == --live ]]; then
  xcrun swiftc -parse-as-library -I "$test_dir" -L "$test_dir" -lKitCore -lKitNet -Xlinker -rpath -Xlinker "$test_dir" \
    GalleryReader/Providers.swift GalleryReader/ImageTransferGate.swift GalleryReader/Library.swift Tests/HitomiLiveTests.swift -o "$test_dir/hitomi-live-tests"
  "$test_dir/hitomi-live-tests"
fi
