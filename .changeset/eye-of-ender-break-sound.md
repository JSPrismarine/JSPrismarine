---
"@jsprismarine/prismarine": patch
---

Play the eye of ender's own sounds instead of the client's fallbacks. The actor `DEATH` and `LAUNCH` sound events have no entry for the eye in the client's sound tables, so the eye ended with the player's hurt sound and left the hand with a firework launch. It now plays `block.itemframe.break` when it finishes and `random.bow` at half volume and a low pitch when thrown, by name, as vanilla Bedrock does; `World.playNamedSoundAt` plays a named sound at an exact point with an optional volume and pitch.
