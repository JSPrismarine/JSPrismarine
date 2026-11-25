---
'@jsprismarine/block-behaviors': patch
'@jsprismarine/prismarine': patch
---

Place blocks in the state Java's `getStateForPlacement` gives them. A player's placement now turns ladders, buttons, levers, grindstones, bells, hoppers, dispensers, droppers, observers, barrels, command blocks, the crafter, end rods, lightning rods, amethyst buds, cocoa, tripwire hooks, beds, anvils, repeaters, comparators, carved pumpkins, glazed terracotta, looms, stonecutters, lecterns, beehives, chiseled bookshelves, vaults, shelves, dripleaves, flower beds and leaf litter the way Java does. Signs, banners, heads, coral fans and hanging signs go on a wall as their wall variant, standing signs and banners turn toward the placer, a standing head keeps its rotation in its block entity, placed leaves are persistent, and a placement Java refuses, such as a button with nothing to hold it or a bed with no room for its head, is refused. A bed now finds its other half the way it faces rather than always north or south.
