---
'@jsprismarine/native-worldgen': patch
'@jsprismarine/script-host': patch
---

In a checkout, the install script loads the installer from the package's TypeScript sources even when a build is present. Loading the build failed, because its `@jsprismarine/native-library` import resolved to that package's sources, which Node cannot load without tsx. The script reported the error, `pnpm install` still succeeded, and the native library stayed missing.
