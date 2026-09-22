# September 22 recovery pass — Hitomi/Imhen build 14

Public metadata/image reads retry transient network failures and server overload;
PC requests and writes remain finite. Retries stop on cancellation. Image callers
share one transfer per URL; canceled callers release their interest, and a transfer
with no remaining callers stops, freeing capacity for the next page. An old caller
cannot erase a newer transfer. Completed image files survive process restart.

The shared userscript UI, source URL resolution and native WebKit interactionState
restoration remain unchanged. Cold scroll resets accepted by the user remain
accepted; no custom cold-restore or migration code was added.

Validation: `bash apps/ios/scripts/test-network.sh` on the Mac,
`npm run test:unit`, native typecheck and both provider builds. The URLProtocol
fixture drives actual URLSession disconnect/503/success, single-flight image
recovery, disk reuse, cancellation and finite PC/write behavior.

## Physical validation

All provider builds were installed in place using their existing paid identities.
See `robustness-verification.json` for sanitized results. Cold-launch checks passed on the iPhone. A read queued with both Wi-Fi and cellular off completed with HTTP 200 after Wi-Fi returned, using the same pending request without a reload or manual retry.

The existing monthly runner successfully renewed every delivered provider build,
retaining the same app identities/data. The scheduler is resumed and its installed-app
scan exits successfully. No new background item or power-setting change was made.
