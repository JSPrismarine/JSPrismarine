---
'@jsprismarine/prismarine': patch
'@jsprismarine/entities': patch
'@jsprismarine/enchantments': patch
---

Experience orbs work as Java's `ExperienceOrb` does. A payout splits into Java's orb sizes and joins an orb of the same value lying at the spot, orbs of one value merge every 20 ticks, an orb follows the nearest player within 8 blocks, and a player standing against orbs takes one every second tick. Mending repairs damaged gear before the rest becomes experience, an orb is gone after 6000 ticks, and clients see each orb at the size its value gives it. The ender dragon's experience now drops as orbs only, instead of also being paid to the killer directly. `@jsprismarine/entities` ships the orb definition with its `jsprismarine:experience_orb` host component, and `@jsprismarine/enchantments` adds `slotGroupContains`, Java's `EquipmentSlotGroup.test`.
