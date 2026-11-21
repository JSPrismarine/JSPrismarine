---
'@jsprismarine/script-host': patch
'@jsprismarine/bedrock-data': patch
'@jsprismarine/prismarine': patch
---

Report the legacy block states BDS's Script API still lists, such as an oak log's `old_log_type` and a slab's `top_slot_bit`, in `BlockPermutation.getAllStates` and `getState`, and accept them in `BlockPermutation.resolve`. The captured `block-types` table records how each state follows another, and `ScriptWorld` gains an optional `legacyStates` the script host reads them from.
