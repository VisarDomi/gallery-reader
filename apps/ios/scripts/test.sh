#!/bin/bash
# The native core's tests (on the PC; the Mac works too): providers against saved responses (Tests/Fixtures),
# then the image and search caches against a stub transport.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=../Kit/Linux/swift-env.sh
source Kit/Linux/swift-env.sh
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/gallery-reader-tests.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
build_linux_shims "$test_dir"
kit_libraries "$test_dir" "-swift-version 6" KitCore KitNet
# The programs compile first (concurrently on the PC), then run in order.
compile provider-tests ${SHIM_FLAGS[@]+"${SHIM_FLAGS[@]}"} -swift-version 6 -parse-as-library -I "$test_dir" -L "$test_dir" -lKitCore -lKitNet -Xlinker -rpath -Xlinker "$test_dir" \
  GalleryReader/Providers.swift Tests/ProviderTests.swift
compile cache-tests ${SHIM_FLAGS[@]+"${SHIM_FLAGS[@]}"} -swift-version 6 -parse-as-library -I "$test_dir" -L "$test_dir" -lKitCore -lKitNet -Xlinker -rpath -Xlinker "$test_dir" \
  GalleryReader/Providers.swift GalleryReader/ImageTransferGate.swift GalleryReader/Library.swift Tests/CacheTests.swift
if [[ "${1:-}" == --live ]]; then
  compile hitomi-live-tests ${SHIM_FLAGS[@]+"${SHIM_FLAGS[@]}"} -swift-version 6 -parse-as-library -I "$test_dir" -L "$test_dir" -lKitCore -lKitNet -Xlinker -rpath -Xlinker "$test_dir" \
    GalleryReader/Providers.swift GalleryReader/ImageTransferGate.swift GalleryReader/Library.swift Tests/HitomiLiveTests.swift
fi
finish_compiles
"$test_dir/provider-tests" Tests/Fixtures
"$test_dir/cache-tests"
if [[ "${1:-}" == --live ]]; then "$test_dir/hitomi-live-tests"; fi
