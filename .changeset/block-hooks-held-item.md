---
'@jsprismarine/blocks': minor
'@jsprismarine/block-behaviors': minor
---

Carry the held item and the clicked face on the block hooks, and use them.

`BlockPlaceEvent`, `BlockBreakEvent` and `BlockPlayerInteractEvent` gain `itemStack`, under Mojang's
own field name, typed as a `HookItem`: an identifier plus a `get(name)` component reader.
`@jsprismarine/items`'s `ItemStack` satisfies it structurally, so neither package imports the other.
`BlockPlaceEvent` also gains `face` and `faceLocation`, the pair Mojang's `PlayerPlaceBlockBeforeEvent`
carries, and `faceLocation` is now a `FaceLocation` rather than a `BlockPosition` because its
components are fractions of a block.

With those, `@jsprismarine/block-behaviors` replaces the workarounds it had listed as partial:
honeycomb waxing and axe scraping across the six copper families, honeycomb sealing a sign, silk
touch on glass and ice, shears on leaves, vines and lichens, buckets and bottles against liquids and
the cauldron, flint and steel on candles, campfires and TNT, a pillar's axis from the clicked face,
and a slab's half and a stair's flip from the click position. The test harness gains `heldItem`,
`silkTouchTool`, and `face`, `faceLocation` and `itemStack` options on `place`, `breakBlock` and
`interact`.

Both bumps are `minor`. Adding required fields to the three event types is a breaking change, and
per the versioning policy a breaking change below `1.0.0` is a `minor`. Anything that builds one of
these events by hand, including a test double, has to add the new fields; `FamilyHarness.breakBlock`
now takes an options object in place of its second positional argument.
