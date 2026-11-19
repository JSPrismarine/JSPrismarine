---
'@jsprismarine/script-host': patch
'@jsprismarine/script-types': patch
'@jsprismarine/prismarine': patch
'@jsprismarine/errors': minor
'@jsprismarine/native-network': patch
---

`@jsprismarine/script-host` and `@jsprismarine/script-types` are published to npm. The script host's install script downloads the QuickJS library built for the machine, on macOS on Apple silicon, Windows on x64, and Linux on x64 and arm64 with glibc or musl, and checks its SHA-256, so scripts run on an installed server without a compiler. `JSP_SCRIPT_HOST_LIBRARY` names a library file to load instead.

`ScriptHostErrors.LibraryNotBuilt` is replaced by `LibraryNotInstalled`, whose message says how to approve the install script for npm, pnpm or Bun. New entries cover a failed or corrupt download, a malformed manifest, and a library that is not the published build.

`@jsprismarine/native-network` exports `PUBLISHED_PLATFORMS`, the platforms it publishes builds for.
