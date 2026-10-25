---
'@jsprismarine/prismarine': minor
---

Finish three of the four remaining items in section 10 of the data-driven vanilla plan.

**`World.getBlock` resolves every palette state.** It caught the registry lookup failure and
answered `minecraft:air`, and it asked by name alone, so the state the chunk held never
reached the `Block`. A lit lamp, a half slab and a stair on its side all read their default
state's facts, and a name no registry knew came back as an empty position a caller was free
to build in, which lost the block on the next write. It passes the state's properties through
now and throws, naming the block and the position, when nothing answers to the name. All
22079 states in the shipped catalog resolve, with `content-packs` on and off.

**The creative menu belongs to a server.** `CreativeInventory` built its menu into a static on
the first read, so the first server in a process decided what every other server in that
process served. It is an ordinary class now, constructed with the registries it reads.
`Server.getCreativeInventory()` hands out that server's own. The statics `getEntries`,
`getGroups`, `getItems`, `get` and `reset` are gone; the first four are instance methods.

**The block entity index is a constant.** `BlockEntityRegistry` built its id-to-class map
lazily into a mutable static with a `reset()` beside it. Its only source is a module, so there
was never anything to invalidate. `BlockEntityRegistry.reset()` is gone.

**The last eight item classes are gone.** `WoodenSword`, `GoldenSword`, `IronSword`,
`DiamondSword`, `DiamondPickaxe`, `IronChestplate`, `DiamondChestplate` and `DiamondHelmet`
were constructors that set a name; their armor points and attack damage have come from Java's
item components through `Item` since the class registry went. `item/Items.ts` goes with them,
taking the `allItems()` shim. Build `new Item({ name })` and read the list from
`ItemManager.getItems()`.

**The shipped block catalog is built once at import.** `BlockStateSchemas` loaded its 1477
schemas lazily behind a `loaded` flag that every `get`, `names` and `getRevision` paid for.
A million `get()` calls go from 12-81 ms to 1.5-7 ms, and a million `getRevision()` calls -
one per block runtime id lookup, roughly 18000 per generated chunk - from 14-207 ms to
1.4-7.7 ms. `reset()` drops only the registrations now, so the shipped schemas survive it.
