---
'@jsprismarine/prismarine': patch
---

World generation reads the biome parameter reports and the structure templates of the Java release the content was loaded for, instead of the default release's reports and the newest extracted template folder. `findJavaWorldgenSources`, `requireJavaWorldgenSources`, `findJavaTemplateSource`, `findJavaTemplates` and `javaTemplateDirectory` take an optional release, defaulting to the default release, and `JavaWorldgenRegistries` carries an optional `release`. A level raises `JSPrismarineJavaDataVersion` in `level.dat` when it opens under a newer Java release, before any chunk of that release is saved. A generator with a terrain cache no longer throws when its registries were projected without a data pack format.
