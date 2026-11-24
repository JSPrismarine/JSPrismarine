---
'@jsprismarine/native-network': patch
---

In a checkout, `ensure:native` loads the installer from the package's TypeScript sources even when a build is present. Loading the build failed, because its `@jsprismarine/native-library` import resolved to that package's sources, which Node cannot load without tsx. The script reported the error and left the old library in place, so `pnpm dev` stopped with a checksum error after a pull that moved the pin.
