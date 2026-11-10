---
"@jsprismarine/prismarine": patch
---

A second login of an account replaces the first one in every phase. The server used to look only at players who had finished joining, so a login during another login's join, or while that one waited for the encryption handshake, let both in under one UUID (#2951). A login now replaces every other connection holding the same name, the same XUID or the same UUID. One still joining is kicked once its join settles, so its record is saved before the new login reads it. A login refused for a ban or for a missing XUID in online mode replaces nobody.

Player records are read and written through `PlayerPersistence`, one per level, which `Level.getPlayerPersistence` returns. It is keyed by the XUID, or the name when there is none, which is where records have always been filed, and the saved format is unchanged byte for byte. Advancement progress and the enchantment seed are held under the same key instead of the entity runtime id.
