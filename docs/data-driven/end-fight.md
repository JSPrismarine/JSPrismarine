---
title: The End dragon fight
group: Documents
category: Guides
---

# The End dragon fight

The End fight is managed by each End world's `DragonFight` service. When a player enters the
arena around (0, 128, 0), the service checks for the exit podium, creates it if needed, and spawns
the dragon if the world has not recorded a kill. The End's generated spike pillars and crystals
are part of the arena, and the server sends a boss bar while the player is nearby.

When the dragon dies, the server opens the podium's portal, places a gateway block, and drops the
dragon egg on the world's first kill. It pays the first-kill experience and hides the boss bar.
Entering the exit portal starts credits on a player's first exit from that save. The transfer to
the player's respawn point waits for the client to finish or skip the credits. Later exits skip the
credits screen.

## Respawning the dragon

Place four end crystals on obsidian or bedrock at the four cardinal positions, three blocks from
the exit portal's center. The block above each base must be air, and the crystal's spawn volume
must be clear of entities. A valid arrangement starts the saved respawn sequence: the crystals
beam toward the center, each of the ten pillars resets over 40 ticks, and the dragon is summoned
after the final 100-tick phase. The full sequence takes 601 game ticks. Destroying a driving
crystal aborts the sequence and restores the active exit podium. A reload resumes only while all
four saved crystals are present.

The gateway block is placed at dragon death, but stepping into a gateway does not teleport yet.

## Light in the End and Nether

Gameplay rules read a dimension-aware `blocks.light` value: the maximum of block light,
dimension-scaled sky light, and ambient light. Vanilla End ambient light gives a minimum value of
3; Nether ambient light gives a minimum of 1. This fixes server-side light checks for behaviors
such as spawning and growth. Bedrock packets do not carry light arrays, so this does not change the
client's rendered brightness.

See [dimensions.md](dimensions.md) for portal travel and dimension configuration, and
[engine-systems.md](engine-systems.md#light) for the light engine.
