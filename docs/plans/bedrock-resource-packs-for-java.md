# Bedrock resource packs for Java clients

Plan, 2026-11-27. Builds on [#3777](https://github.com/JSPrismarine/JSPrismarine/pull/3777), which
installs every pack an addon archive holds and sends the resource packs to Bedrock clients, and on
[Java Edition clients over one world](java-multiprotocol.md), whose section 10 left resource packs
for Java clients out of scope. The facts this plan rests on are in
[bedrock-resource-packs-for-java.md](../research/bedrock-resource-packs-for-java.md); this page
cites its sections rather than repeating them. Values are as they were on this date and stay
unmarked, as the repository rules say for dated plans.

## Goal

A server owner installs a Bedrock addon once. Bedrock players get its resource packs as they do
after #3777, and Java players get a Java resource pack the server converts from the same packs,
builds once per change and caches. The addon's content shows on Java wherever a vanilla Java client
can draw it: retextured vanilla blocks and items, custom items, custom blocks, custom entities,
translated names and custom sounds.

What done looks like:

- A Java client joining a server with resource packs installed is offered one converted pack during
  configuration, downloads it from the server's own port, and applies it. `texturepack-required`
  applies to Java clients too.
- The converted pack is built from the whole Bedrock stack in its stack order, once per stack and
  Java release, and a restart with the same stack serves the same bytes, so a returning client's
  cache skips the download.
- An addon installed or removed while the server runs reaches Java players at once: the server
  pushes the new pack in the play phase, which Bedrock cannot do.
- A custom item shows its icon and name, a custom block its model, a custom entity its geometry,
  and custom sounds play, on a vanilla Java 26.3 client with no mods.
- The console says, per addon, what did not convert and why, in the same voice as #3777's install
  report.

What a Java client can never get, so the plan does not try (research section 4): Molang animations,
animation and render controllers as assets, particles, JSON UI, materials, shaders, Vibrant Visuals
data and cameras. A custom block cannot become a new Java block type, and no new item, entity, sound
or particle type can reach the client's registries (research section 2, "Data that is not in the
pack").

## What exists today

- `ServedResourcePacks` zips each installed Bedrock resource pack, keys it by `<uuid>_<version>` and
  orders the stack top first (`packages/prismarine/src/resourcePacks/ServedResourcePacks.ts`).
- `AddonManager.resourcePacks()` lists the installed resource packs and returns a new list only when
  the installed set changes, so a consumer can cache on the list's identity.
- The Java edition sends no resource pack. `beginConfiguration` sends the brand, feature flags and
  known packs, then the registries (`packages/prismarine/src/editions/java/handler/configurationHandlers.ts`).
- Java item stacks travel without data components (`Slot` in `packages/protocol/src/java/packet/play.ts`,
  and the Java plan's PR 10c), so no stack can carry `minecraft:item_model` yet.
- A Bedrock block the mapping does not know, which every custom block is, reaches a Java client as
  stone (`EditionTranslation`, Java plan section 7).
- `TcpTransport` reads only Java frames. Nothing in the server answers HTTP.
- `writeZip` writes the same bytes for the same files in the same order, with every entry dated
  1980-01-01 and stored uncompressed by default (`packages/packs/src/zip.ts`).
- `javaSkin.ts` already reads PNG for skins.

## Decisions

### A pure converter in its own package

The conversion is a function from Bedrock pack files to Java pack files. It reads no server state,
opens no file and keeps no cache. A new package, `@jsprismarine/java-packs`, created with
`pnpm exec turbo gen Package`, owns it:

```ts
convertResourcePacks(stack: readonly BedrockPackFiles[], target: JavaPackTarget, assignments: JavaAssignments): {
    files: Map<string, Uint8Array>; // the Java pack, ready for writeZip
    report: ConversionReport;       // per pack: what converted, what was lossy, what was dropped and why
    needs: JavaAssignmentRequests;  // custom content the assignments do not cover yet
}
```

`target` names the Java release, its pack format range and its vanilla asset names. Keeping the
converter pure makes it testable against `bedrock-samples` and the research corpus without a server,
and lets the server cache its output by a key of its inputs alone.

Why not in `@jsprismarine/packs`: that package reads Bedrock packs into definitions for the content
build. Writing Java assets is a second product with its own dependencies (image transcoding,
model geometry), and Bedrock-only consumers should not carry it.

### One converted pack per stack and Java release

Bedrock resolves texture short names, `blocks.json` entries and lang keys across the whole stack, so
the server converts the stack as one, top first, as ViaBedrock does (research section 7). Two packs
that override the same vanilla texture resolve as Bedrock resolves them: the higher pack wins. A
Java client gets one pack, not one per Bedrock pack, so its own stack order cannot disagree with
the server's.

The pack format changes every Java release (97.1 for 26.3, 104.0 for 26.4-pre-1, research section
2). The download request carries `X-Minecraft-Pack-Format`, so one URL can answer each client with
the pack built for its release once the server accepts more than one Java release. Until then the
server builds for its pinned release and declares that release's `min_format` and `max_format`.

### Assignments are server state that never moves

Custom content rides on vanilla carriers (research sections 4 and 6):

- each custom block state borrows a spare vanilla block state, from the `note_block` states first,
  then mushroom blocks and tripwire for other shapes;
- each custom item gets a model key under the addon's namespace, sent as `minecraft:item_model`;
- each custom entity geometry part gets a model key for its `item_display` part.

The converter writes the pack for these assignments, and the server sends the same assignments in
every chunk, stack and entity. If they moved between restarts, every placed custom block would draw
as something else and every cached pack would go stale. So the server keeps them in a file it owns,
`java-content.json` beside `levels.json`, the way a save keeps its dimension numbers: an assignment
is made once, on first sight, and never changed or reused. A removed addon's assignments stay
reserved, so reinstalling it gives the same states back. When the spare pools run out, the content
that did not get a state falls back to its substitute (see
[Custom blocks fill the borrowed pools](#custom-blocks-fill-the-borrowed-pools-with-no-display-entities-yet))
and the console says so.

Each pool keeps one state of its vanilla block for the real block. Every real block of that kind
reaches a Java client as that state, whatever its own state, and the pack leaves that state's
vanilla model alone, so a real note block or mushroom block never draws as a custom one. All 1350
`note_block` states share one vanilla model (research section 6, "Blocks"), so sending a real note
block as `instrument=harp, note=0, powered=false` changes nothing it shows; its sound and particles
come from the server's block events, not from its state. That leaves 1349 note block states to
borrow, and the same rule holds for each other pool. A pool whose real block draws differently by
state, such as a mushroom block's faces, keeps every state the real block can show, and only the
rest are lent.

### Built once, cached on disk, keyed by its inputs

The cache key is a SHA-256 over the converter's version, the target pack format, the ordered list
of the stack's Bedrock pack SHA-256s, which `ServedResourcePacks` already computes, and the version
of the assignments the pack uses. The output is the zip from `writeZip`, so the same inputs give the
same bytes and the same SHA-1 on every restart, and a returning client skips the download (research
section 7, "How others cache").

Converted packs live under `cache/java-packs/<key>.zip` in the server's folder, beside a small index
of key, SHA-1, size and last use. The cache can be deleted at any time: the next join rebuilds what
it needs. What stays is decided by use, never by age:

- the current pack for each Java release;
- every pack pushed to a player who is still online, who may still be downloading it, the same
  reason `ServedResourcePacks` keeps every offered pack;
- the pack of the one stack before the current one, so reverting or reinstalling an addon costs no
  conversion.

Everything else is deleted at startup and after each rebuild. A test checks this by counting the
packs kept and deleted, as no time-to-live could be checked.

Conversion runs outside the tick, at startup after the addon sync and again when the installed
list changes, as `ServedResourcePacks` zips its packs. A join that arrives while a build runs waits
for it, with a bound, and joins without the pack when the bound passes and the packs are optional.

### Hosted on the Java port

A Java client downloads a pack from an `http` or `https` URL (research section 1). The server
answers HTTP on the port Java clients already reach, by reading the first bytes of each TCP
connection: a Java frame starts with a VarInt length and packet id `0x00` or the legacy ping's
`0xFE`, and an HTTP request starts with a method such as `GET `. This is Polymer's autohost pattern
(research section 1, "What other servers do"), and it needs no second port, no firewall rule and no
public address setting. The URL is built from the address and port the client put in its handshake,
so it is the address that reached the server.

The listener answers `GET /resource-packs/<sha1>.zip` and nothing else, serves only packs in the
cache, and sends `Content-Type: application/zip` and `Content-Length`. The URL names the pack's
SHA-1, so a URL always serves the same bytes, and a client still downloading an older pack gets
that pack.

A `java-resource-pack-url` setting replaces the server's own address with a base URL, for a server
behind a CDN or a proxy that strips HTTP, and the server then offers `<base>/<sha1>.zip`. The
owner uploads each new pack beside the old ones, under that name, and removes an old one only once
the server's cache has let it go, which happens when no online player was offered it (see
[Built once, cached on disk, keyed by its inputs](#built-once-cached-on-disk-keyed-by-its-inputs)).
The server pushes a pack only once it is published: before a push it fetches the new pack's URL,
and if the bytes there do not hash to its SHA-1, it keeps offering the old pack and logs which file
to upload under which name. The new pack goes out on the first check after the upload, so with the
override a stack change reaches players when the owner has published it, not at once.

### Delivered in configuration, updated in play

During configuration, after the known packs, the server sends `resource_pack_push` with the pack's
UUID (derived from the cache key, so it is stable), URL, SHA-1, `texturepack-required` as the
forced flag, and a prompt only when the owner sets one. It waits for the client's final status
before `FinishConfiguration`. A declined or failed pack ends the join when the packs are required,
as on Bedrock, and is logged and ignored when they are not.

When the stack changes while players are online, each Java player gets `resource_pack_push` for the
new pack in the play phase, and keeps the old one while the new one downloads. The client applies
packs by UUID, so both are loaded at once for that time, and the old pack still draws everything the
player sees, since assignments never move. Only when the client reports the new pack loaded does
the server send `resource_pack_pop` for the old UUID and start showing that player content that
only the new pack draws. Until then, and for as long as a player who declined an optional pack
plays, such content reaches them as its substitute. Each session records which pack its client
has loaded, and each block, stack and entity the presenter sends is checked against it.

### The vanilla texture name table is generated

Retexturing a vanilla block or item needs a table from Bedrock texture paths to Java ones. GeyserMC
PackConverter's MIT table has 2060 entries (research section 5), but
[ADR 0019](../adr/0019-bedrock-data-comes-from-bds.md) keeps third-party data dumps out of the
repository's generated data. So a generator in `@jsprismarine/java-packs` builds the table from the
two pinned primary sources, `bedrock-samples`' vanilla resource pack and the pinned Java client
jar's assets, by matching textures pixel for pixel, and a reviewed list covers the textures whose
layout differs between the editions (chests, beds, signs, conduits and several mobs, research
section 4). PackConverter's table is a cross-check in the generator's test, not a source. The
client jar download joins the generator's own fetch step and stays out of `prepare`, `start` and CI,
as the server jar does.

No GPL, AGPL or LGPL code is copied (research section 5, "License compatibility"). ViaBedrock,
CubeConverter and Polymer are read for behavior only.

## Asset conversion

From research section 4, in the order the slices take them:

| Bedrock | Java | Fidelity |
| --- | --- | --- |
| `manifest.json` name and description, `pack_icon.png` | `pack.mcmeta`, `pack.png` | Direct |
| Vanilla texture overrides | `assets/minecraft/textures/...` through the generated table | Direct for one-to-one names, a transformer per layout change |
| TGA textures | PNG | Direct (transcode) |
| `flipbook_textures.json` | `<texture>.png.mcmeta` animation | Direct; `blend_frames` becomes `interpolate` |
| `overlay_color` | Baked into the PNG | Lossy |
| `texts/*.lang` | `assets/<ns>/lang/<locale>.json`, Bedrock keys kept | Direct |
| `sound_definitions.json`, OGG files | `assets/<ns>/sounds.json`, OGG | Lossy for distances and categories |
| `font/glyph_XX.png` | Bitmap font provider over `0xXX00`-`0xXXFF` | Direct |
| Custom item icons | Item model, `items/` definition, `item_model` component | Direct |
| Attachables | Item model from geometry; armor as `equipment/` layers | Lossy |
| Custom block geometry and `material_instances` | Block model elements on a borrowed state's `blockstates/` override | Lossy |
| Client entity geometry | Item models on `item_display` parts | Lossy, one static model per geometry and texture pair |
| Fog and client biome data | Biome environment attributes in registry data | Lossy, and registry data rather than pack files |
| WAV and FSB audio | none | Dropped and reported; Java plays Ogg Vorbis only (see Decided after review) |
| Subpacks | The default tier | Lossy |
| Animations, controllers, particles, JSON UI, materials, cameras | none | Reported as not converted |

Lang keys stay Bedrock's, and the server sends names as `translatable` components with those keys,
so a converted name and its Bedrock original never drift apart.

## The server side of custom content

Converted assets only show when the server points at them. Three pieces of the Java presenter, each
gated on the assignments:

- **Items.** A custom item goes out as a vanilla base item, `minecraft:paper` unless its Bedrock
  components need a base with hardcoded client behavior (see Decided after review), with `item_model`,
  `custom_model_data` when one definition covers several looks, `item_name` as a `translatable`
  component, and the components the client predicts from: `max_stack_size`, `max_damage`, `food`,
  `consumable`, `tool`, `equippable`, `use_cooldown`. This needs data components on Java slots first.
- **Blocks.** `EditionTranslation.toJava` sends a custom block state as its assigned borrowed state
  instead of stone. Mining time comes from the server, as Polymer does it: the client's
  `block_break_speed` attribute goes to -9999 while it mines a borrowed state, and the server sends
  the crack stages and breaks the block (research section 6, "Blocks"). The client plays a block's
  step, place, break and hit sounds from its vanilla sound type, so the pack silences the sound
  events of every sound type a used pool's block has, and the server plays sounds for every block
  of those types: the custom block's own for a borrowed state, and the vanilla ones for every real
  block, wood and stone included when a pool shares their type. Which sound types are silenced
  follows from which pools hold assignments, so a server with no custom blocks silences none.
- **Entities.** A custom entity becomes an `interaction` entity sized to its collision box plus one
  `item_display` per geometry part, moved with it. Animation is out of scope for the first entity
  slice; a later one can move parts from the server.

## Slices

Each lands on its own with the Bedrock and Java client suites green.

| PR | Slice |
| --- | --- |
| 1 | This plan and its research. |
| 2 | `@jsprismarine/java-packs`: the package, `pack.mcmeta`, the icon, TGA to PNG, flipbooks, lang, OGG sounds, glyph fonts and the conversion report, tested against fixtures and `bedrock-samples`. |
| 3 | The generated vanilla texture name table and the layout transformers, with PackConverter as a cross-check in the test. |
| 4 | The cache, HTTP on the Java port, `resource_pack_push` in configuration with `texturepack-required`, and re-pushing in play when the stack changes. A Java client-e2e scenario joins with a required pack and checks the server served it. Vanilla overrides reach Java players from here. |
| 5 | Data components on Java slots, for the components custom items need. This is the Java plan's inventory follow-up and may land there instead. |
| 6 | `java-content.json` assignments, custom items: models, `items/` definitions and the stacks that name them. |
| 7 | Custom blocks: the borrowed state pools, block model conversion from geometry, server-side mining and the sound patch. |
| 8 | Custom entities: geometry to item models, the `interaction` and `item_display` composition. |
| 9 | Fog and client biome data as registry data, once the Java plan sends registry entries with data. |

Issues for slices 2 to 9 are opened when this plan merges and linked from this table.

## Verification

- The converter is tested as a function: fixture Bedrock packs in, Java files out, compared with
  checked-in expectations, plus the conversion report. Determinism is asserted directly: the same
  stack converted twice gives the same bytes.
- The cache is tested by counting: conversions run per stack change, cache hits per join, and
  downloads served per client with a cached hash, following
  [Measuring performance](../../AGENTS.md#measuring-performance). No test asserts a duration.
- The HTTP sniffing is tested on the transport with a Java handshake, a legacy ping and an HTTP
  request on one listener.
- Each slice from 4 on adds a scenario under `tools/client-e2e/src/java-scenarios/`, run by the pull
  request's Client E2E job, which checks what the Java client was sent and applied.
- Where a conversion is a parity question, such as which vanilla Java texture a Bedrock texture
  becomes, the table's test is the check; `packages/parity` gets a family only if a slice adds a
  data-driven comparison against Java's own data.

## Decided after review

These were the plan's open questions, settled on 2026-11-27.

### A custom item's base is paper, unless a component needs another

In 26.3 data components carry most of an item's behavior whatever its base: eating (`consumable`,
`food`), tools (`tool`), armor (`equippable`), durability (`max_damage`) and cooldowns
(`use_cooldown`). The base matters only for behavior Java hardcodes in an item's class: drawing a
bow, charging a crossbow, throwing, blocking with a shield, fishing, buckets and spawn eggs. So the
converter keeps a short table from Bedrock item components to the base each needs, such as
`minecraft:shooter` to `minecraft:bow` and `minecraft:throwable` to `minecraft:snowball`, and every
other item uses `minecraft:paper`. The chosen base is part of the item's assignment in
`java-content.json`, so it never changes for a stack a player already holds.

A custom block's item does not get a block item base. The client could not predict the borrowed
state it would place, so placing stays server-decided and the block appears one round trip later.

### WAV and FSB audio are reported, not converted

A Java client plays Ogg Vorbis only, so both formats would need a Vorbis encoder in the server.
There is no good pure JavaScript one, and a native dependency is too much for a format the corpus
barely uses: no addon in it ships FSB, and most ship OGG, which passes through unchanged. The
conversion report names each dropped sound per addon. When an addon people use needs one, an issue
reopens the question.

### The cache keeps what is in use

The cache keeps the current pack per Java release, every pack pushed to a player still online, and
the pack of the stack before the current one, and deletes the rest at startup and after each
rebuild. See [Built once, cached on disk, keyed by its inputs](#built-once-cached-on-disk-keyed-by-its-inputs).

### Custom blocks fill the borrowed pools, with no display entities yet

A display entity per placed block grows with how much of the world players build, and has no
collision, so the first blocks slice does not use them. Custom block states fill the pools by
shape: full cubes take the spare `note_block` states, and thin, plant-like and non-colliding
shapes take the `tripwire`, mushroom block and `chorus_plant` pools. A state that fits no pool, or
finds its pool full, takes a free state from the pool of the nearest shape, with its own texture
where that shape allows. When no pool with a usable shape has a free state left, the custom block
state gets its substitute: the vanilla block its Bedrock definition names as its Java look when it
names one, and otherwise the plain vanilla block of its shape: `minecraft:stone` for a full cube,
and for a block with no collision, `minecraft:short_grass`, which a player can still aim at, use
and break, or `minecraft:air` for a block its definition gives no selection box, which a player
could not aim at on Bedrock either. A substitute is a vanilla block shown as vanilla,
with no custom texture, since every borrowed state already carries another block's model. The
console reports each one. Display entities can come later as an opt-in with a cap per
chunk, if real addons depend on odd-shaped decorative blocks.

## Out of scope

- Java resource packs as addons in their own right, and converting Java packs for Bedrock clients,
  which GeyserMC's tools do.
- Client mods, shaders and core shader replacement.
- Behavior pack logic beyond what the server already runs for both editions. Scripts run on the
  server, so their effects reach Java players through the same intents and presenters as today.
