#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/gallery-network-tests.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
xcrun swiftc -parse-as-library -strict-concurrency=complete \
  GalleryReader/Models.swift GalleryReader/GalleryAPI.swift GalleryReader/GalleryStore.swift \
  Tests/NetworkTests.swift -o "$test_dir/test-runner"
"$test_dir/test-runner"
