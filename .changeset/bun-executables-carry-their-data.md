---
'@jsprismarine/prismarine': patch
'@jsprismarine/chunkgen': patch
'@jsprismarine/server': patch
---

Give the Bun-compiled executables the Bedrock and Java data they run on.

The release and nightly workflows compile the published executables with `bun build --compile`,
not with Node's single-executable packager, and those binaries did not start at all: `node:sea`
is imported at the top of `GenerationPool`, Bun implements no such module, and resolving it
throws `No such built-in module` before anything runs. The runtime checks that ask whether this
process is a compiled binary now answer for Bun as well, without naming a module Bun cannot
resolve, and the data a packaged binary unpacks on first run travels inside the Bun executables
too — through module source, which is what `bun build --compile` carries, since Bun has no asset
table to read back. Both packagers now collect that payload through one builder, so what the two
kinds of executable ship cannot drift apart.

Two name lookups that a bundler breaks are fixed with it. A packet's wire id and its codec
override were both resolved from `constructor.name`, and a bundler renames a class whose name
collides with another in the same chunk: the compiled binary ended up with a `DeathInfoPacket2`
and refused to register it. Both now resolve through the packet barrel's export keys, which are
property names that survive bundling. The override lookup silently missing would have sent a
2225 session the 2193 layout of every packet whose layout changed.
