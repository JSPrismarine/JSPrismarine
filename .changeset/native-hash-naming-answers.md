---
'@jsprismarine/native-library': patch
'@jsprismarine/native-network': patch
'@jsprismarine/script-host': patch
---

The native source hash now covers what `@jsprismarine/native-library`'s naming helpers return instead of the text of their module, and leaves out the modules that only compute the hash. Editing those modules without changing a build no longer publishes new builds, and in a checkout no longer makes the library build locally. `nativeSourceHash` takes the helpers' output as a third argument, from the new `namingAnswers` in `@jsprismarine/native-library/platform`.
