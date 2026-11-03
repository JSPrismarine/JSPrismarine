---
'@jsprismarine/packs': minor
'@jsprismarine/item-behaviors': minor
'@jsprismarine/prismarine': minor
---

Load Java's `block_transformer` registry and resolve tool transforms from it, which is what makes a hoe till, a shovel path, and an axe strip. The behaviors and the item components were already in place, but the table behind `WorldActions.transform` was an injection point nothing injected, so every tool declined every block. `@jsprismarine/packs` routes `data/<namespace>/block_transformer/` files, the server parses them into `ServerContent.blockTransformers`, and the resolver answers the rule-based providers over the real tag stack and block mapping, including `copy_properties` (a stripped log keeps its axis), the offset predicates (tilling needs air above), and `disallowed_faces` - which is why `transform` now takes the clicked face.
