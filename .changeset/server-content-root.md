---
'@jsprismarine/prismarine': minor
---

Add `src/content/`, the composition root that builds the server's content registries from a pack
stack. `buildServerContent()` resolves the stack, loads it through `@jsprismarine/packs`, registers
the 49 block and 47 item behavior families and all 170 entity goals, resolves each domain, and
flattens the hot per-state columns into typed arrays indexed by runtime id. Against the pinned BDS
pack, the `jsprismarine_vanilla` overlay and the Java 26.3 vanilla datapack it produces 1477 blocks
over 22079 states, 1613 items, 136 entity types, 2042 recipes, 1447 loot tables, 43 enchantments,
60 spawn rules and 883 tags over 20 tagged registries, in about 3.6 seconds and with no errors.

Nine content packages each declare their own injected world interface, and they overlap heavily.
`ServerWorldAdapter` is the one interface the server implements instead, and `contentWorldViews`
projects the nine out of it. Six of its groups are required and five are optional; a projection
that needs an absent group throws `NotWiredError` naming the member and the subsystem that owes it,
rather than returning a value a caller could not tell apart from a real one.

`Server` gains `getContent()` and `setContent()`, and builds content at startup when `config.yaml`
sets `content-packs`. That key defaults to false, so the existing managers keep running the server
while each subsystem moves across; `JSP_CONTENT` overrides it for a single run. Three more keys
come with it: `content-strict`, `content-world-packs` and `content-datapacks`.

Every source the build reads is injectable, so a test builds the same content out of a handful of
definitions and a two-block palette with no disk access. `src/content/testing.ts` ships that
fixture, and the one test that needs Mojang's fetched data is gated behind `JSP_CONTENT_VANILLA`.
