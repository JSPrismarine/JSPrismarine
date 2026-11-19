---
'@jsprismarine/packs': patch
---

Add `JavaDataTarget` and `DEFAULT_JAVA_DATA_TARGET` in `@jsprismarine/packs/javaDataTarget`. `load` takes a `java` target and gates `pack.mcmeta` ranges and overlays on its data pack format, the composed prefix cache key includes it, and `createMcdocValidator` takes a `target` whose release it gates on. Without a target, a load behaves as before, at data pack format 121.0 for Java 26.3. `DATA_PACK_FORMAT` and `DATA_PACK_RELEASE` are deprecated in favor of the target and will be removed.
