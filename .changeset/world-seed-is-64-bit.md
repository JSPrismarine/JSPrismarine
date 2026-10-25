---
'@jsprismarine/prismarine': minor
---

Carry the world seed as a 64-bit value instead of a JavaScript `number`.

A Minecraft seed is a 64-bit integer; a double is exact only below 2^53. Every seed above that
was rounded on the way in, so a server configured with `8475011743740320021` generated the world
of `8475011743740319744`. Noise, biome climate, carvers, structure placement and the decoration
seed are all pure functions of that long, so the world had nothing to do with the one the player
asked for. About 99.9% of 19-digit Java seeds lose bits that way. The rounded value also went
into `level.dat`'s `RandomSeed` record and out in `StartGamePacket`, so the saved world and the
seed the client reported agreed with each other and with nothing else.

`World.getSeed`, the `Generator` interface (`generateChunk`, `surfaceAt`, `locate`), the
`Provider` and `BaseProvider` `readChunk` signatures and `StartGamePacket.seed` all take and
return `bigint` now. Existing calls that pass a `number` no longer type-check; write the literal
as a `bigint` (`1234n`) or convert with `BigInt`.

A world's `seed` in `config.json` may be a string, and should be: neither JSON nor YAML can hold
a 19-digit integer as a number literal without rounding it. The string is read the way Java reads
the text in its world creation box, so a value that parses as a 64-bit integer is that integer
and anything else is its `String.hashCode` widened to a long. A number is still accepted and is
exact below 2^53. A new server now writes its generated seed as a string, drawn over the whole
64-bit range rather than the safe-integer one.
