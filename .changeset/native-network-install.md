---
'@jsprismarine/native-network': patch
'@jsprismarine/server': patch
---

`@jsprismarine/native-network` downloads the build of its library for the machine it is installed on, from a GitHub release, in its install script, checks the file's SHA-256 against its manifest, and stores it in the package. Loading checks the file again and downloads nothing; without a build it fails with how to let npm, pnpm or Bun run the install script. `JSP_NATIVE_NETWORK_LIBRARY` names another file to load, checked the same way.

The single executables carry their platform's library and write it to their cache directory on the first start.
