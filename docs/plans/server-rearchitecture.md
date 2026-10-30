# Server re-architecture: module kernel and multi-version protocol stack

Status: accepted direction, implementation in progress (started 2026-10-29).

Progress (2026-10-30):

- Done: Phase 0 (hygiene), Phase 1 (transport + `NetworkDispatcher` extraction), Phase 2
  (`packages/kernel` plus the bans, permissions, recipes, stations, social, ticker, and network
  modules), Phase 3 (codec layer), Phase 4 (pipeline + phase-keyed handlers), and Phase 5
  (`Codec2225` delta codec with the `protocol.negotiation` parity family).
- Phase 6: the ticker, networking (`prismarine:network`), and shutdown-interrupt extractions are
  done; the kernel-backed `getXxxManager()` getters are deprecated; the kernel and the token
  barrel are exported from `@jsprismarine/prismarine` as the module API; block changes flow
  through the typed `WorldChange` stream into the replicators.
- Phase 7: Protocol package ownership is complete. `@jsprismarine/protocol` owns the packet
  classes, wire definitions, structures, packet id tables, codec construction, codec registry,
  and handshake filtering. Prismarine creates server codecs by supplying versioned item data,
  block definitions, and captured payloads through `ProtocolContext`. Its packet handler registry
  contains handlers only; Prismarine no longer has packet classes, a packet barrel, an
  `Identifiers` facade, or a root `Protocol` export. `ServerName` receives protocol metadata
  directly from the configured codec.
- Wire layouts are declarative (`docs/adr/0003-declarative-wire-layouts.md`): a packet is one
  ordered field list in `@jsprismarine/protocol`, version differences are gated fields with the
  predicates in one file (`wire/wireGates.ts`), a codec resolves a frozen layout per protocol
  version, and `prepareOutbound` stamps the session's protocol and does nothing else. The
  `*2225` sibling classes are gone.
- Protocol's packet classes and wire vocabulary are directly importable from
  `@jsprismarine/protocol`; consumers do not need Prismarine re-export shims. Its public codec
  factory builds the packet-id lookup from Protocol's packet exports and version tables. A server
  supplies item ids, block definitions, entity identifiers, biome definitions, and other
  version-specific data through `ProtocolContext`, keeping data ownership at the server boundary.
  `Item` remains a Prismarine game object; its wire half delegates to Protocol's stack-descriptor
  codec.
- Packet ids come from the version tables in Protocol. Packet implementations are constructed
  from the matching Protocol classes; ids without a class decode to `null`. The eight packets
  1.26.60 added have layouts based on the pinned v1.26.60 release schemas
  (`docs/research/protocol-2225-added-packets.md`), which also settles two conventions: an
  integer marked `Compression` is a ZigZag varint rather than a fixed-width value, and a property
  absent from `required` travels behind a presence byte.
- Layouts are held to real server bytes: the capture pipeline records one raw payload per packet
  the Bedrock Dedicated Server sends at login (`src/jsp/v<protocol>/wire/`, 41 per version), and
  the `protocol.wire-roundtrip` parity family requires `encode(decode(bytes)) === bytes` for
  every defined packet. Coverage is reported per version and grows as packet bodies convert.
- A 2225 session gets its own item numbering (`ProtocolItemData` on the codec); the 2193 wire is
  byte-identical throughout, asserted directly.
- The published executables (`bun build --compile`, release and nightly workflows) carry the
  Java worldgen data and overlay packs, fetch the vanilla behavior pack on first run, and run
  the chunk generation pool in worker threads via embedded entrypoints; the Node single
  executable (`pnpm run package`) provisions the same data but still generates on the server
  thread. `pnpm install && pnpm dev` works from a clean clone; `pnpm run bringup --protocol <n>`
  walks a client to spawn against a real BDS of that version.
- Declarative layouts cover **95 of the 239 ids** (40%). Each conversion lands behind a
  byte-compatibility test: the bytes the hand-written encoder produced are recorded as hex
  literals *before* the class changes, so the test keeps checking the wire after the old encoder
  is gone rather than comparing the new code against itself. Packets a login exercises are held
  to captured server bytes on top of that, which is the 34-of-41 fixture figure. Across every
  wave so far no packet's encoder and decoder were found to disagree.
- Remaining, in rough order of value:
  - Convert remaining hand-written Protocol packet bodies to declarative layouts. Four are
    deliberately left for individual care rather than a batch -
    `CraftingData`, `AvailableCommands`, `ItemRegistry` and `CreativeContent`, whose
    hand-written codecs carry byte-level tests pinned against gophertunnel.
  - Convert the remaining straightforward `NetworkPacket` payload implementations to their
    existing declarative definitions, so each Protocol packet layout has one source. The
    hand-written cases that need individual treatment include `TextPacket` (`variantOf` and
    `BodyVariant`), `PlayerActionPacket` (five fields and private block-position helpers),
    `ResourcePackClientResponsePacket` (its `oneOf` payload), `DisconnectPacket` (conditional
    message strings), `RequestNetworkSettingsPacket`, `NetworkSettingsPacket`,
    `RequestChunkRadiusPacket`, `SetLocalPlayerAsInitializedPacket`, `ChunkRadiusUpdatedPacket`,
    `MovePlayerPacket`, `PlayStatusPacket`, `ResourcePacksInfoPacket`, `ResourcePackStackPacket`,
    and `SetHudPacket`. `StartGamePacket`, `LevelChunkPacket`, and `UpdateSubChunkBlocksPacket`
    already use their declarative layouts.
  - The version-aware `ItemStackRequest` reader (the `CraftReservedAction` renumber at 2225).
  - Commands and worlds modules; widening the `WorldChange` stream beyond block changes; the
    version-independent intent/update vocabulary; NetherNet and Java transports.
  - `bedrock-data`'s versioned captures beyond the wire fixtures (see "bedrock-data versioning"
    below); worker support for the Node single executable.
- Accepted deviation: `ServerName` advertises only the newest supported version rather than every
  registered codec version. This matches what a Bedrock Dedicated Server of that version
  advertises; as the constructor comment in `packages/raknet/src/utils/ServerName.ts` records,
  advertising the oldest told a current client it had found an older server.

## Problem

`packages/prismarine/src/Server.ts` (~1250 lines) plays three roles at once: composition root
(constructs ~12 managers plus another dozen unnamed subsystems), lifecycle sequencer
(`enable()`/`disable()` are hand-ordered call lists with the order documented in comments), and
host of inline subsystems (tick loop, RakNet wiring, packet dispatch, shutdown semantics). Every
manager takes the whole `Server`, and `getXxxManager()` accessors make `Server` a de-facto service
locator.

The original protocol stack supported only version 2193. Its packet ids were baked into
`static NetID` at import time, and packet modules loaded bedrock-data tables directly. The codec
layer now supports protocols 2193 and 2225, and Protocol receives versioned item, block, entity,
biome, and capture data through `ProtocolContext`. `bedrock-data`'s non-wire captures are still
only partially versioned, so that remains a limit on adding further server versions.

`packages/minecraft/datagen/manifest.json` has since been keyed by protocol version and declares
both 2193 and 2225, with 2193 as the default. The 2225 entry carries enums only: its block palette
and recipes need a BDS 1.26.60.6 capture that does not exist yet, which
[protocol-2225-delta.md](../research/protocol-2225-delta.md) records along with the commands that
would produce it.

Other recorded pain points:

- Before Phase 7, two packet stacks lived in `packages/prismarine/src/network/packet` and
  `packages/protocol/src/packet`, with the server and client using different packet bases. Phase 7
  moved packet classes and ids into Protocol; Prismarine now owns handler dispatch and supplies
  its captured data through `ProtocolContext`.
- Dispatch is an inline closure in `Server.bootstrap` (`Server.ts:522-586`) with a binary
  pre-login/post-login handler split (`isPreLoginHandler`).
- Gameplay code builds wire packets directly (~46 `new XxxPacket()` calls in `PlayerSession.ts`;
  18 files outside `network/` import packet modules; enums like `ActorEvent` live in packet files).
- `disable()` never disables the query/chat managers, chunk scheduler, world replicators, or
  entity runtimes; `reload()` is unsupported.
- `MinecraftSession` fuses session logic (batching, compression, ordering) with `RakNetSession`.

## Options considered

Four research tracks (current-state survey, module-kernel design, multi-protocol network design,
unconventional architectures) assessed: full ECS, actor model with worker threads, effect-ts
layers, event-sourced/CQRS core, capability microkernel, Netty-style pipelines, Fastify/NestJS/
Sponge/Paper/Minestom module models, and DI containers (tsyringe/inversify).

Rejected as the whole architecture, with the ideas kept from each:

- **Full ECS** — wrong for heterogeneous session/NBT data; keep SoA storage as a later option
  inside `EntityRuntimes` only.
- **Actor model** — no mature TS framework; keep "one writer per world" and worker offload for
  worldgen/lighting/compression behind the world boundary (`ChunkScheduler` is the seam).
- **effect-ts layers** — technically the best model of lifecycle/teardown, but it makes Effect the
  public API of every plugin; keep its shape (construction returning service + finalizer,
  dependencies visible to the kernel) hand-rolled.
- **Event sourcing/CQRS** — a tarpit at 20 TPS; keep the projection insight: a typed
  `WorldChange` stream as the single input to replicators, which also yields per-version outbound
  encoding and record/replay debugging.
- **NestJS / tsyringe / inversify** — decorators plus `reflect-metadata`, and constructor
  injection hides the dependency graph the kernel needs to order start/stop.
- **Versioned packet class sets** (full copy per protocol) and **full schema codegen** — the first
  multiplies ~170 classes per version; the second founders on upstream schema quality for exactly
  the packets this repo has hand-fixed byte-by-byte.

## Chosen architecture

A capability-based microkernel with a typed token registry as the module system, a Netty-style
per-connection pipeline as the network stack, delta protocol codecs for multi-version support, and
a formalized world-change stream feeding replicators as projections.

### Module kernel (`packages/kernel`)

The kernel owns only lifecycle, a token-keyed service registry, and the event bus. Worlds,
sessions, commands, bans, networking, and the tick loop are modules. First-party and third-party
modules use the same API.

```ts
interface ServiceToken<T> { readonly id: string } // branded phantom type, e.g. 'prismarine:worlds'

interface Module {
    readonly id: string;
    readonly dependencies?: readonly ServiceToken<unknown>[];
    register(ctx: ModuleContext): void | Promise<void>; // phase 1: construct + provide, no I/O
    start?(ctx: ModuleContext): void | Promise<void>;   // phase 2: topo order; sockets, worlds, files
    stop?(ctx: ModuleContext): void | Promise<void>;    // reverse topo order
}

interface ModuleContext {
    use<T>(token: ServiceToken<T>): T;                    // throws on undeclared dependency
    provide<T>(token: ServiceToken<T>, service: T): void; // legal only during register()
    readonly events: EventBus;   // scoped: listeners detach on stop()
    readonly logger: Logger;     // pre-scoped with the module id
    readonly config: ModuleConfig;
}
```

Decisions:

- **Token registry, not a DI container.** Declared dependency lists give the kernel the graph for
  topological start/stop ordering and cycle detection, replacing the comment-maintained ordering
  in `enable()`/`disable()`. No decorators, no `reflect-metadata`.
- **Tokens carry interfaces, not classes** (`BanService`, not `BanManager`), extending the
  existing `Pick<Server, ...>` capability pattern. Services are overridable by plugins via
  explicit `override: true`. A module cannot reach what it did not declare.
- **Two phases (register/start)**, because content and `PacketRegistry` must exist before worlds,
  `#minecraft:load` runs after worlds, console last.
- **Event bus:** keep the existing typed async/cancelable `EventEmitter`; add per-module scoping
  (listeners tagged by module id, detached wholesale on `stop()`) and an extensible event map.
  Hot reload in v1 means module restart, not live code swapping.
- **Migration bridge:** `Server` keeps its getters as deprecated façades over `kernel.get(token)`
  for one major version. Tiny managers (e.g. `ChatManager`) merge into larger modules instead of
  getting their own tokens.

### Network stack

Four layers, independently swappable:

1. **Transport** — a duplex byte-frame channel that knows nothing about Minecraft packets:
   `TransportConnection { token, sendFrame(payload), close(), capabilities }` where capabilities
   cover `encrypted`, `reliableOrdered`, `maxFrameSize`. `RakNetTransport` wraps `RakNetListener`
   (`encapsulated` → `frame`); NetherNet (WebRTC data channel) and Java (length-prefixed TCP) slot
   in later. Batching/compression/encryption move up into the session layer, parameterized by
   capabilities.
2. **Per-connection pipeline** — a small typed handler chain (not Node streams):
   `frames → decompress → batchSplit → decode → logFilter → phaseGate → dispatch`, mirrored
   outbound. The login-gate stage replaces itself with the play dispatcher after login, removing
   `isPreLoginHandler`. A shared-batch outbound stage formalizes `broadcastPacket`'s hand-rolled
   dedupe; the compression stage is a future worker seam.
3. **Delta protocol codecs** — `@jsprismarine/protocol` owns the packet ids, version definitions,
   `ProtocolCodec` factory, packet-class lookup, codec registry, and handshake filter. Prismarine
   composes the supported codecs by supplying per-version item tables and other server-owned data
   through `ProtocolContext`. Sessions start with the Protocol handshake codec; the
   `RequestNetworkSettings` handler assigns `session.codec` from the configured registry.
   `ServerName` receives that registry's newest protocol metadata. The oldest codec is pruned when
   dropped from support.
4. **Handlers keyed by packet name + session phase** (`handshake | login | resourcePacks | play`),
   not NetID, so ID renumbering between versions never touches handlers. A version-independent
   intent/update vocabulary (Geyser-style translation) is introduced lazily, only where versions
   actually differ; Java later means a full translator set against the same vocabulary.

**World-change stream:** a typed `WorldChange` event stream becomes the single input to all
replicators (`WorldReplicators` is already documented as "the network's view of each world").
This gives per-version outbound encoding and record/replay debugging.

### Versioning decoupling (cross-cutting)

The single-version force-tie is broken at each layer it exists:

- `Identifiers.Protocol` and per-class `static NetID` → codec-owned IDs (complete; Prismarine's
  `Identifiers` facade is removed).
- The three scattered version equality checks (`RequestNetworkSettingsHandler`, `LoginHandler`,
  `LoginPacket`) → one negotiation point against the codec registry.
- Module-load imports of bedrock-data tables inside packets (`StartGamePacket`,
  `ItemRegistryPacket`, biome/actor/jigsaw tables) → data injected per codec through
  `ProtocolContext`.
- `packages/minecraft/datagen` gains a version dimension; `bedrock-data` gains versioned source
  inputs for version-sensitive tables (block runtime IDs, item table, entity metadata numbering,
  crafting layout).
- `raknet`'s `ServerName` receives protocol metadata directly from the configured codec;
  `packages/client`'s `PROTOCOL_VERSION` resolves against Protocol's version definitions.

## Phased plan

Each phase ships independently with tests green; early phases are pure extraction.

- **Phase 0 — hygiene:** fix `disable()` gaps (query/chat managers, chunk scheduler, replicators,
  entity runtimes); record the direction decision that the codec layer becomes the shared home for
  the `protocol`/`prismarine` packet-stack split.
- **Phase 1 — transport extraction:** define `Transport`/`TransportConnection`; wrap RakNet; move
  the inline dispatch closure and connection wiring into a tested `NetworkDispatcher`; lift
  batching/compression out of `MinecraftSession`'s RakNet coupling, preserving the `outbound`
  ordering chain verbatim.
- **Phase 2 — kernel package** (parallel with 1): build `packages/kernel` with tests, including a
  helper that starts a module against only its declared dependencies; wrap existing managers as
  modules one at a time behind the `Server` façade.
- **Phase 3 — codec layer (complete):** move packet ids and class lookup into Protocol codecs;
  thread `session.codec` through connections; negotiate against the codec registry; version the
  datagen manifest and inject versioned data instead of loading it from packet modules.
- **Phase 4 — pipeline + phase-keyed handlers (complete):** implement the pipeline with the self-replacing
  login gate; convert the ~71 handlers to name+phase registrations behind an adapter, taking
  narrowed capability interfaces instead of `Server`.
- **Phase 5 — Codec2225 (complete):** add the second version codec with both wire directions and
  parity coverage for dual-version negotiation.
- **Phase 6 — decompose `Server.ts` (in progress):** extract ticker, networking, and lifecycle modules (moving
  catch-up clamping, double-Ctrl+C, and reconnect-race behavior verbatim); formalize the
  `WorldChange` stream; deprecate getters; publish the module API from `packages/server`; major
  changesets per `docs/versioning.md`.
- **Phase 7 — Protocol package ownership (complete):** move packet classes, ids, wire definitions,
  structures, and codec construction into `@jsprismarine/protocol`; pass server-owned item, block,
  and capture data through `ProtocolContext`; remove Prismarine's packet and Protocol re-exports.
- **Later:** worker offload behind the world boundary, SoA mob hot data in `EntityRuntimes`,
  NetherNet transport, Java transport + full translator vocabulary.

## Known costs

Tokens are ceremony (mitigated by merging small managers); dependency lists can drift from
`use()` calls (mitigated by throwing on undeclared use plus the test helper); dependency errors
surface at kernel start, not compile time (typed-tuple `Module<Deps>` inference can tighten this
later); delta codecs accumulate version-conditional subclasses until the oldest codec is pruned;
the migration itself is the dominant cost, which is why Phases 1-2 are pure extraction.

## Data pipeline status

The version dimension in `packages/minecraft`'s datagen pipeline is implemented:
`datagen/manifest.json` declares protocol versions under `versions`, each generator writes to
`src/generated/v<protocol>/`, and the version named by `defaultProtocolVersion` is re-exported at
the unversioned `src/generated/` paths so existing imports keep resolving.

## bedrock-data versioning

`packages/bedrock-data` is not fully versioned yet. Its upstream dumps are now pinned per
protocol version; the captures taken from a running server are not, so this section records
what is in place and what the rest needs.

### What is version-sensitive

Every generated or converted table tracks one Bedrock release and would need a copy per
protocol version:

- `item_table.json` - joined from `jsp/required_item_list.json` (a capture from BDS 1.26.51.1)
  and the dump's `runtime_item_states.json`. Item runtime ids and the item list change
  across releases.
- `item_components.json` - converted from the dump's `item_components.nbt`; the set of
  data-driven items changes across releases.
- `creativeitems.ts` - generated from the dump's `creative_items.json`; the creative
  menu changes almost every release.
- `entity_identifiers.json` - converted from the dump's `entity_identifiers.dat`.
- `biome_definitions_network.json` and `jigsaw_structure_data.json` - converted from captures
  under `src/jsp/`.
- The `src/jsp/` captures themselves (`required_item_list.json`, `block_definitions.json`,
  `biome_definitions_network.nbt`, `jigsaw_structure_data.nbt`) and the BDS/bedrock-samples
  pins in `sources.json`.

Version-stable: the vendor files (`r16_to_current_item_map.json`, `item_tags.json`) describe
pre-flattening legacy names and move only when Mojang renames items, and the Java-side data
under `src/jsp/java/` tracks Java releases on its own schedule.

### Required input layout

- Done: the CloudburstMC/Data dumps are no longer a submodule. A submodule is one checkout at
  one commit, so it could never serve two Bedrock versions. `sources.json` now carries the
  same `versions` table `packages/minecraft/datagen/manifest.json` has - protocol version to
  `minecraftVersion`, `commit`, `url` and `sha256`, plus `defaultProtocolVersion` - and the
  existing pinned-download machinery in `utils/fetch/` caches each version under
  `cloudburst-data/v<protocol>/`. Protocol 2193 (1.26.51) and 2225 (1.26.60) are pinned.

  Two choices are worth recording. First, the selected version is linked to `src/resources`
  rather than read through a new path, which left `build.js`, the parity goldens and the
  blocks generators untouched. Second, an `extract` allowlist keeps the unpack to the seven
  files anything reads, `LICENSE` included for the Apache-2.0 attribution.

- Still missing: per-version captures under `src/jsp/v<protocol>/` for the files captured from
  a BDS of that version (`required_item_list.json` first; the NBT captures as they are
  refreshed), and per-version BDS and bedrock-samples pins. The 2225 dump exists upstream, but
  nothing captures a 2225 BDS yet, so `item_table.json` cannot be built for it. The same capture
  is what `packages/minecraft`'s 2225 entry waits on for its block palette and recipes, so one
  BDS 1.26.60.6 run unblocks both.

### build.js changes, once the inputs exist

Mirror the minecraft datagen shape: loop over the declared versions, read each version's
inputs from its `resources`/`jsp` directories, write to `src/generated/v<protocol>/`, and
re-export the default version at the unversioned `src/generated/` paths (for JSON payloads,
`src/index.ts` imports the default version's file directly, as `packages/minecraft` does for
`recipes.json`). Until a second version's inputs land, restructuring `build.js` would only
move files around, so it stays single-version.
