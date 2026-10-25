---
'@jsprismarine/mapping': minor
'@jsprismarine/packs': minor
'@jsprismarine/prismarine': minor
---

Refuse to start when a Java identifier has no Bedrock mapping and no reviewed loss.

This is the rule plan section 5 gives the loader, and the reason the mapping module can promise
totality rather than hope for it. The machinery existed and nothing ran it: `reportIdentifiers`
and `createPackIdentifierResolver` had no caller outside their own tests, the resolver covered 5
of the 21 registries the vanilla datapack references, and the one assertion about the vanilla
corpus expected every identifier to resolve as `unknown`, which is the opposite of what Phase 0
asks for.

The content build now resolves every Java identifier the pack stack references. A strict build
throws `UnmappedIdentifierError`, naming the identifier, its registry and the pack and file it
came from. A normal build keeps going and writes one `identifier.unmapped` error per identifier,
the way it already reports the defaults it had to invent, so the startup line that counts content
errors counts these too.

Closing the gap took three things. `@jsprismarine/packs` falls back to the loaded stack when the
resolver has no answer, which closes a `#tag` whose tag file the stack carries and a reference
into a registry a datapack fills, such as one loot table calling another; 359 of the vanilla
corpus's references resolve that way and never cross to a client. It also reads an `id` field from
the keys beside it rather than always as an item, because 26.3 spells five unrelated things `id`
and the other four were reaching the report as missing items.

`@jsprismarine/mapping` maps mob effects and potions, joined by name against the pinned
bedrock-samples metadata, and answers the registries with no Bedrock side from a generated Java
26.3 census: a reference into one of them resolves only when Mojang's own data publishes the
entry, so a typo still fails the load. The nine registries the server evaluates in Java's own
shape are listed with a reason each in `packRegistries.ts`. Five new per-entry losses cover the
four mob effects and the one potion Bedrock has no id for, and three registry-wide rows cover
banner patterns, goat horn instruments and painting variants, which do reach a Bedrock client but
as a short code, a data value and a texture name that no pinned source pairs with the Java id.
Each registry-wide row pins its entry count, so a version that adds an entry fails the property
test instead of widening the row in silence.

Against the real 26.3 datapack: 4088 referenced identifiers, 3977 mapped, 111 allow-listed, none
left over.

Breaking: `ReferencedIdentifier` carries `source`, `pack` and `path`, and a reference the stack
closes itself now reports `known` rather than `unknown`. `MAPPED_REGISTRIES` and the
`RegistryLoss` registry union gained `mob_effect` and `potion`, and `RegistriesTable` gained the
two tables and their Bedrock name sets.
