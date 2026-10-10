---
'@jsprismarine/prismarine': patch
---

Remove the `Filesystem` world provider. `LevelDB` is the only default.

It wrote each chunk as its own file containing the network payload — the bytes the server puts on the wire, which is a format nothing else reads, not the game and not any other server. It never wrote block entities, entities or level metadata, so anything the world held beyond terrain was gone on the next load; and because a chunk that failed to read fell through to `generator.generateChunk`, a world that had silently stopped saving looked exactly like a world that was working.

`LevelDB` was already the default for a world with no `provider:` line. It is now the only one alongside `Anvil`.

A config still naming `Filesystem` is refused at startup rather than quietly switched. The two keep their chunks in different places, so loading one as the other would present an empty world where a populated one used to be, which is the one failure mode worth being loud about. The error names the providers that do exist.

`LevelDB` already warned when it found a `chunks` directory and no `db` beside it; it still does, and still touches nothing, but no longer suggests setting `provider: Filesystem` to get the old world back. There is nothing to convert those files into.

`Server.test.ts` now gives each of its two servers a world of its own. Both stub `shutdown`, so the first server is left holding its world, and LevelDB takes a directory lock — two writers on one world delete each other's files rather than racing for a stale read. Sharing a folder was invisible under a provider with no locking and is a correct refusal under this one.
