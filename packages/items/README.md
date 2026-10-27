# @jsprismarine/items

The item definition and component runtime. It implements Java Edition 26.3's item data component
system on top of `@jsprismarine/content`, and hands the result out under Bedrock item identifiers.

Two sentences describe the whole package. An item type is a Bedrock identifier carrying the Java
default components of the Java item that maps onto it. An item stack is a reference to one of those
types, a count, and a component patch layered over the type's defaults.

## Why identity is Bedrock and properties are Java

The client decides identity. A Bedrock client knows an item by the identifier the server sends in
`ItemRegistryPacket`, and it will not render or name an item it has no entry for, so the server's
item table has to be Bedrock's. The server decides properties. Nothing in either Bedrock pack
format publishes nutrition, durability, mining speed or burn time for vanilla items, while Mojang's
Java data generator publishes all of them for all 1658 Java items. That is
[the plan's decision](../../docs/plans/data-driven-vanilla.md) in sections 2 and 4, and this package
is the join: 1658 Java items go in through `@jsprismarine/mapping`, 1605 Bedrock identifiers come
out with components attached.

Nothing here knows that two editions exist at runtime. The join runs once in the generator and the
committed table is Bedrock-keyed, so the mapping package is a development dependency rather than a
runtime one.

The item loader also keeps Bedrock behavior pack data separate: `ItemType.bedrockComponents` holds
the raw component bodies, and `ItemType.tags` plus `hasTag(name)` expose the active Bedrock tags.
`ItemStack.getTags()` and `ItemStack.hasTag(name)` read the same tags from the stack's type. These
do not replace or reinterpret Java's default components, and retaining a body does not imply that
the server executes its behavior.

## The Java component model

Java 1.20.5 replaced the `tag` NBT blob with structured components, and 26.3 registers 122 of them
in `minecraft:data_component_type`. The catalog in `src/components/` implements all 122, split the
way vanilla uses them, with each number measured from the pinned data generator output rather than
chosen:

| Group | Count | File |
| --- | --- | --- |
| A default on every one of the 1658 items | 13 | `components/universal.ts` |
| A default on some items | 56 | `components/defaults.ts` |
| Only ever on an individual stack | 53 | `components/stackOnly.ts` |

Each component is a `ComponentFactory` with a parser for its value, built from the combinators in
`schema.ts`. The parsers are strict about the fields they know and lenient about fields they do
not, because Mojang adds a field to a component within a release and a schema that rejected one
would turn a data refresh into a load failure. Two components, `minecraft:sulfur_cube_content` and
`minecraft:waxed`, have no vanilla default and appear in no vanilla data file, so their shape is
unverified against the pinned sources; they are listed in `UNVERIFIED_SHAPE_COMPONENTS`.

26.3 also moved fuel, compost and brewing numbers behind the `context_int_provider` and
`context_float_provider` registries, so `minecraft:cooking_fuel` on a boat reads
`{"burn_time": "minecraft:cooking/time_boats"}` and that file is a division by a conditional over
two more files. The generator copies the 30 definitions item components reach into the table, and
`numberProvider.ts` evaluates one: `minecraft:cooking/time_boats` is 1200 ticks in a furnace and
600 in a smoker, and `minecraft:compostable/low` is 0.3, the expected value of its weighted list.

## Item stacks and the component patch

An `ItemStack` is a `content` `Instance`: a holder for its type, a count, and a patch. Reading a
component reads the patch first and the type's defaults second, which is Java's
`PatchedDataComponentMap`. A patch entry can also remove a default, which is the `!component` marker
Java's command grammar writes, and removal is a separate entry rather than an absence so it survives
a round trip.

```typescript
import { food, ItemStack, loadItemTypes } from '@jsprismarine/items';

const { registry } = loadItemTypes();
const apple = new ItemStack(registry.holder('minecraft:apple'), 16);

apple.params(food); // { nutrition: 4, saturation: 2.4 }, from the type
apple.remove('minecraft:food'); // now undefined, and the patch records the removal
```

Equality follows from the patch, not from comparing NBT. `sameItemSameComponents` compares the item
and then the patch, which is what `ItemStack.isSameItemSameComponents` does in the pinned 26.3
server jar: it calls `Objects.equals` on two `PatchedDataComponentMap`s, whose own `equals` compares
the prototype and the patch map. One consequence is worth stating because it looks like a bug.
Setting a component to the value the type already defaults to produces a stack that reads the same
as an untouched one and does not stack with it. That is Java's behavior, verified by disassembly,
and `canStack` and `mergeStacks` inherit it.

## The hook seam

Item behavior does not live in this package. The seven hooks in `hooks.ts` are the seam the behavior
families plug into, and they carry Mojang's `ItemCustomComponent` names unchanged so a future script
host maps onto them one name at a time:

```typescript
interface ItemHooks {
    onUse: (event: ItemUseEvent) => ItemUseResult | undefined;
    onUseOn: (event: ItemUseOnEvent) => ItemUseResult | undefined;
    onMineBlock: (event: ItemMineBlockEvent) => void;
    onHitEntity: (event: ItemHitEntityEvent) => void;
    onBeforeDurabilityDamage: (event: ItemBeforeDurabilityDamageEvent) => number | undefined;
    onCompleteUse: (event: ItemCompleteUseEvent) => ItemUseResult | undefined;
    onConsume: (event: ItemConsumeEvent) => ItemUseResult | undefined;
}
```

Two deliberate differences from Mojang's interface. Each event carries this package's `ItemStack`
rather than a scripting handle, and the hooks a caller can cancel return a value instead of mutating
the event, because `HookTable.dispatchFirst` decides who handled an interaction by the first result
that is not undefined. The event types name the world with the smallest interfaces that work,
`ItemSource` and `BlockReference`, so this package depends on no world implementation and a behavior
that needs more narrows the value itself.

None of the 122 components declares a hook. Components are parsed data and behavior arrives as a
`Behavior` attached by identifier or by tag, which is how one bucket behavior covers twelve buckets.
Dispatch order is component order, then behaviors in attachment order, so the server's own code has
the last word over what a pack declared.

The research counted roughly 30 item behaviors with no data expression in either edition, among them
buckets, bows, crossbows, compasses, maps, leads, name tags, spyglasses, bone meal and fireworks.
Those are the behavior agent's work; the components cover food, tools, weapons, armor, shields,
gliders, totems, spears, fuel, compost and block transformation.

## The Bedrock projection

`projectItemToBedrock` turns one resolved type into the component compound the Bedrock client needs.
It does not send anything; `ItemRegistryPacket` belongs to the protocol package.

The two editions name the same facts differently, so every shape the projection writes is read off a
Bedrock Dedicated Server 1.26.51.1 capture, the `item_components.nbt` golden in
`@jsprismarine/bedrock-data`, rather than written from documentation. Java's `max_damage` becomes
`minecraft:durability.max_durability`. Java's absolute `food.saturation` becomes Bedrock's
`saturation_modifier`, the ratio it is computed from. Java has no enchanting category at all, so
`enchantableSlotOf` derives one from the `mineable/*` tag in the item's tool rules, the equipment
slot, or the spear, shield and glider components. The apple comes out with the same
`max_stack_size`, `use_duration`, `use_animation` and food values the real server sends.

Keys with no Java source are left out rather than guessed, so the protocol layer can tell a derived
value from a placeholder. `BEDROCK_ONLY_ITEM_PROPERTIES` lists the seven `item_properties` keys that
come from the creative catalog, the resource pack or nothing at all, and
`UNPROJECTED_BEDROCK_COMPONENTS` lists six components with a reason each, mostly because producing
them would need a Java-to-Bedrock identifier lookup this package does not depend on. One of those,
the food remainder, is available through an injected `mapIdentifier`.

## Flattened facts

`flattenItemFacts` precomputes the five numbers a hot path reads into typed arrays indexed by the
registry's dense item id: maximum stack size, maximum damage, whether the item is food, whether it
is a tool, and the burn time in ticks. A furnace tick reads `facts.burnTimeTicks[id]` instead of
walking a component list and evaluating a provider tree.

## The exception list

Mapping 1658 Java items onto 1606 Bedrock identifiers loses rows two ways, and `exceptions.ts`
accounts for both in nine reviewed rows covering 53 Java items.

Five rows are reviewed losses, the six items `@jsprismarine/mapping` already lists: the spectral
arrow, the debug stick, the knowledge book, the furnace minecart and the two test blocks. A loss
never contributes components, because writing the debug stick's properties onto the plain stick
would give the fallback item the wrong behavior.

Four rows are merges, the 47 items that share a Bedrock identifier with another: 16 structure
locator maps onto `minecraft:filled_map`, the tipped arrow onto `minecraft:arrow`, and 15 banner and
15 bed colors onto `minecraft:banner` and `minecraft:bed`. One Java item supplies each shared
identifier's properties, picked by a deterministic rule: the item whose own identifier matches, then
the lowest Bedrock damage value, then the first identifier alphabetically. The others are listed with
the damage value that selects them, so nothing is dropped silently.

That leaves `minecraft:unknown` as the one Bedrock identifier of 1606 with no row, because the only
Java items that reach it are the two test blocks.

The generator recomputes the set and refuses to emit when it disagrees with the file, so adding a row
is how a maintainer accepts a new gap, and a row that stops matching fails the build.

## Regenerating the table

`src/tables/itemTypes.json` is generated and committed. After a Java or Bedrock version bump:

```sh
pnpm --filter @jsprismarine/bedrock-data run fetch:sources
pnpm exec turbo run build --filter=@jsprismarine/mapping
pnpm --filter @jsprismarine/items run generate:item-types
```

The generator runs Mojang's data generator against the hash-verified server jar when its reports are
missing from the cache, which needs a JDK of at least version 25 (`JAVA_HOME` or `JSP_JAVA_HOME`).
It refuses to emit when a Java item has neither a mapping nor a reviewed exception, when a component
name is not in the pinned registry report, when a produced Bedrock identifier is missing from the
captured item table, or when the computed exceptions disagree with `src/exceptions.ts`.

## Tests

`vitest run` covers the catalog, the patch model, hook dispatch order, the generated table, the
flattened facts and the projection against the documented Bedrock component names. One test is
gated: setting `JSP_JAVA_REPORTS` to the absolute path of the data generator's `generated`
directory reparses all 1658 real item component files and asserts zero parse errors. From the
repository root:

```sh
JSP_JAVA_REPORTS="$PWD/node_modules/.cache/jsprismarine/java-reports/26.3/generated" \
  pnpm --filter @jsprismarine/items exec vitest run
```
