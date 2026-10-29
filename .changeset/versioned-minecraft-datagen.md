---
'@jsprismarine/minecraft': patch
---

Generated protocol data is now namespaced per protocol version. `datagen/manifest.json`
declares releases under `versions`, each generator writes to `src/generated/v<protocol>/`
(`@jsprismarine/minecraft/generated/v2193/*` today), and the version named by
`defaultProtocolVersion` is re-exported at the unversioned `generated/*` paths, so existing
imports keep working.
