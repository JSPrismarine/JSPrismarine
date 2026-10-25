---
'@jsprismarine/prismarine': minor
---

Mark `BlockManager.registerBlock` and `ItemManager.registerItem` as `@deprecated`. Blocks and
items come from the pack stack, so an instance registered through either has no component list,
no hooks and no row in the flattened property tables; all it can still do is answer for its own
identifier ahead of the stack's. A plugin that defines content ships a Bedrock behavior pack and
registers the behavior families its components name.

Both methods keep working in this release. [The migration plan](../docs/plans/data-driven-vanilla.md)
section 10 has them going through one deprecation release before they are removed, and no
published release has carried the marker until now.
