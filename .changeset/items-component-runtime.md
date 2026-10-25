---
'@jsprismarine/items': patch
---

New package: the item definition and component runtime. It implements all 122 of Java 26.3's item
data component types as parsed components for `@jsprismarine/content`, with the value shapes checked
against Mojang's own per-item reports, and evaluates the `context_int_provider` trees 26.3 moved
fuel, compost and brewing numbers behind. `ItemStack` is Java's model, a type reference plus a
component patch over the type's defaults, with the `!component` removal marker representable and
stacking decided by the patch rather than by NBT comparison. A committed table maps the 1658 Java
items onto 1605 of Bedrock's 1606 item identifiers, each carrying its Java-sourced components, with
the 53 items that lose a row listed in a reviewed exception list the generator checks.
`projectItemToBedrock` turns a type into the component compound `ItemRegistryPacket` carries, shaped
against a Bedrock Dedicated Server capture, and `flattenItemFacts` precomputes stack size, damage,
food, tool and burn time into typed arrays. The seven `ItemCustomComponent` hook names are declared
for the behavior families that come next.
