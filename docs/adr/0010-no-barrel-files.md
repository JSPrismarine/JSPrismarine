# No barrel files, and each package exports an explicit list of modules

Status: accepted

A barrel is a module that only re-exports other modules. We ban them across the repository with Biome's `noBarrelFile` and `noReExportAll` rules, enforced by a baseline that only shrinks, as the packet-codec check does. Consumers import the file that defines a symbol. A package lists the modules it makes public as explicit subpath entries in its `exports` map, and the `"./*"` patterns that expose every file are replaced.

Prismarine's barrels and its `"./*"` pattern go as part of the entity re-architecture. Other packages' aggregating root entry points follow as separate work, one package at a time, and do not block that program.

A barrel hides which file owns a symbol, and `@jsprismarine/prismarine` exports `"./*"`, so every internal file is public API. Removing a class such as `Entity` is then a breaking change for anyone who imported it. This changes the convention from phase 7 of the server re-architecture plan, where Protocol's classes became importable from the package root.
