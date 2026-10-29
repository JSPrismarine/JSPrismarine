# Packet versioning architectures

Research note, 2026-10-29. Question: is the delta codec with sibling packet classes
(`StartGamePacket2225` beside `StartGamePacket`, swapped in per session by
`ProtocolCodec.prepareOutbound`) the right way to carry more protocol versions, or does it
accumulate into a mess 10 or 100 versions from now? Raised with two specific worries: whether a
packet ends up passing through one transform per supported version, and whether a schema
approach such as protobuf would serve better. This is a design note in the
[codebase-design](../../.agents/skills/codebase-design/SKILL.md) vocabulary; it recommends, it
does not implement.

## Summary

Keep the delta model. The two feared costs do not exist in it: packet resolution is one map
lookup and one encode, never a chain, and the class count is bounded by the support window, not
by history, provided pruning is written down as policy. The change this note recommends is
process, not architecture: adopt an explicit support window with a documented prune procedure
(fold the oldest delta into the base classes and delete it), and keep Mojang's `metadata.zip`
ordinals as the mechanical change detector they already are. Protobuf is not applicable, for
reasons given plainly in the last section.

## What the current design is

One fact worth stating before comparing anything, because the user's question assumes otherwise:
**nothing in this codebase ever transforms a packet more than once.** The seam is
`ProtocolCodec` (`packages/prismarine/src/network/codec/ProtocolCodec.ts`). A session negotiates
one codec; `MinecraftSession.ts:185` and `BatchPacket` call `prepareOutbound` exactly once per
outbound packet; `Codec2193.prepareOutbound` is a name lookup in a per-codec override map and,
when the class is substituted, a single `Object.assign` copy into the versioned class. Inbound,
`createPacket` is a wire-id lookup in a map built once per codec. There is no adapter chain, no
re-encoding, no pass through intermediate versions. `Codec2225 extends Codec2193` is *class
inheritance used as a delta description*, resolved to a flat map before any packet moves; it is
not a runtime pipeline. A hundred registered codecs would mean a hundred flat maps, each
consulted once by the sessions speaking that version.

The per-version artifacts at 2225, as shipped:

- 8 sibling packet classes, 270 lines total (average 34 lines each, most of it JSDoc citing the
  schema and gophertunnel verification). Each overrides a protected hook the base class exposes
  at the insertion point (`encodeEditorLevelMigrationVersion`, `skinLayout`), so the base class
  carries the layout knowledge once and the sibling carries only the difference.
- `v2225.ts`, 36 lines: protocol number, version strings, eight added packet ids spread over
  2193's table.
- `Codec2225.ts`, 46 lines: the override map plus the per-version item data.
- `itemData.ts`: the data half of a version, one captured item table per protocol, resolved
  through the codec the same way layouts are.
- `generated/v2225/` enums in `@jsprismarine/minecraft`, generated from the pinned
  `metadata.zip`, beside `v2193/`.

In the skill's terms: `ProtocolCodec` is a deep module. Its interface is five members
(`protocolVersion`, `ids`, `itemData`, `createPacket`, `prepareOutbound`), and behind it sit the
id tables, the class substitutions, the data tables, and the copy semantics. Gameplay code and
handlers never learn a version; they build base classes and key on `getName()`. The seam is
placed where the variation actually is, at the session's edge, and it has two real adapters
(2193, 2225) plus the layout-stable `HandshakeCodec`, which by the "two adapters means a real
seam" test makes it an earned seam, not a hypothetical one.

## Taxonomy of real deltas

From the full 2193 to 2225 diff ([protocol-2225-delta.md](protocol-2225-delta.md)) and a survey
of how upstream libraries absorbed recent bumps, the kinds of change a version brings, roughly
ordered by frequency:

| Kind | 2225 instances | Cheapest representation |
| --- | --- | --- |
| Field appended at the end of a struct | `AnimatePacket` hand byte, `LevelChunkPacket` biome flag, `AddActorPacket` passenger data, `ItemReleaseInventoryTransaction` hand | A trailing hook override or a trailing `if proto >=`; equally one line either way |
| Field inserted mid-struct | `StartGamePacket` (LevelSettings ordinal 11), `ItemUseOnActorInventoryTransaction` hand, `AddPlayerPacket` passenger before device id | A hook at the insertion point; the base class must already have, or gain, a seam there |
| Field moved between structs | The PlayFab id, out of `SerializedSkin` into `PlayerListAddEntry` | No representation makes this cheap. The shared struct needs a layout flag threaded through (`SkinWireLayout`), in every candidate architecture alike |
| Enum member inserted, later members renumbered | `ItemStackRequestActionType` 18 pushes 19 and 20 | Generated per-version enums, which `generated/v2193|v2225` already are |
| Packet added | Eight at 2225 | An id-table delta; a class only when the server implements the packet |
| Data renumbered | 82 item runtime ids moved, four names added; block permutation hashes moved | Per-version captured tables selected by the codec, which `itemData.ts` already does |
| Packet removed | None at 2225; happens occasionally upstream | Omit from the id table |
| Packet id renumbered | None at 2225 | Historically Bedrock appends ids and does not renumber existing ones; the id table absorbs it if it ever happens. Handlers key on packet name, so a renumber would touch one table |

Two structural observations. First, a change to a shared struct fans out: `LevelSettings`
touched only `StartGamePacket`, but `SerializedSkin` touched `PlayerListPacket` and
`PlayerSkinPacket` at once, which is why the skin change was threaded as a layout flag on the
shared serializer rather than duplicated per packet. Second, the one genuinely expensive kind,
a field moving between structs, is also the rarest, and it is expensive in every architecture
because the knowledge ("this value now belongs to that struct") is semantic, not positional. No
schema language removes that cost; gophertunnel called the same move its 1.26.60 breaking
change.

The taxonomy holds across other recent bumps, measured from pmmp/BedrockProtocol release notes
and Mojang's changelog:

- **Protocol 712 (1.21.20):** 4 packets added, ~14 changed, overwhelmingly fields appended
  (CameraInstruction target, ChangeDimension loading screen id, MobArmorEquipment body), two
  enum-variant removals, one struct extended. No id changes.
- **Protocol 729 (1.21.30):** 2 added, ~6 changed, including one genuine mid-struct replacement
  (InventoryContent/InventorySlot swapped `dynamicContainerId` for a `FullContainerName` plus
  size) and two fields removed from ResourcePacksInfo.
- **Protocol 2225 (1.26.60):** 8 added at the next free ids, and Mojang's changelog counts 56
  changed packets, though most rows are optionality and docs corrections; the wire-layout delta
  this server had to carry was 8 packets, and gophertunnel's whole upgrade touched 35 files of
  small per-packet edits.

Across all surveyed bumps, packet id renumbering was observed zero times: Bedrock's ids are
append-only and removals leave gaps. The observed layout delta, ~6 to 14 changed packets per
bump against ~171 implemented here, is the number the architectures below are sized against.
Mojang appends far more than it rearranges, and preview-chain noise (the preview.21 "enum value
changed" rows that were documentation fixes) does not reach retail.

## Candidate architectures

### a. Status quo: delta codec plus sibling classes

What a version costs: one `v<proto>.ts` id delta, one codec class, one sibling class per changed
packet (~34 lines each including verification notes), one data table where captures differ, plus
round-trip tests. At 2225 that was roughly 350 lines of non-test code for the whole version.

Projected without pruning, at the observed rate: 10 versions add ~60 to 80 sibling classes and
~2,500 to 3,000 lines beside the ~171-class base stack, ten 40-line codec files, ten id deltas.
Runtime cost stays flat: each session still does one lookup. The real accumulation is in the
base classes, which grow one protected hook per historical insertion point; `StartGamePacket`
would carry ten tiny `encodeXxx` methods whose only purpose is to be overridable. That is the
honest long-run smell of this design, and it is linear and local, not combinatorial.

Pruning: dropping the oldest protocol means the base class becomes the next layout up. For each
sibling of the dropped delta, fold its override into the base class body, delete the sibling,
delete the codec, the `v<proto>.ts` file, the data table, and the generated enum directory.
Mechanical, local to the packets that changed, and roughly the same size as adding a version
was. Nothing outside `network/codec` and the folded packet files moves, because gameplay code
never named a version.

Type safety: a field that exists only at 2225 exists only on `StartGamePacket2225`, checked by
the compiler. Debugging a codec bug means reading one subclass against one base class, both of
which cite the schema ordinal and the gophertunnel line they were verified against.

### b. gophertunnel style: one class, version conditionals inside encode/decode

One `StartGamePacket` with `if (this.codecProtocol >= 2225) this.writeSignedByte(...)` at each
divergence. Marginal cost per version is the same set of edits to the same ~6 to 8 files, minus
the sibling-file ceremony. N versions later, each hot packet's encode body carries one branch
per surviving divergence; pruning means grepping for `>= <dropped proto>` and deleting branches,
which is comparably cheap.

The trade is in the interface. Version-specific fields live on the one class at every version,
so the compiler can no longer say "this field is not a 2193 concept", and `prepareOutbound`
loses its meaning (nothing to substitute; every packet must be stamped and every encode must
consult the stamp). Divergence knowledge moves from "which class am I" to "which branch did I
take", which is worse to debug when the bug is a wrong layout: the 2225 Terracotta diagnosis
turned exactly on being able to say "this instance is the 2193 class, so these are 2193 bytes".

Worth noting what gophertunnel itself actually does: it supports *one* protocol, the latest, and
exposes a `Protocol` interface that community libraries (Flonja/multiversion, now archived;
ethaniccc/legacy-version; oomph-ac/mv, archived) implement for older clients, mostly by
translation. The in-class-conditional style is how those forks and pre-archival pmmp handled
small windows. Two of the three multiversion libraries for it are abandoned, which says
something about who ends up holding that maintenance.

### c. Schema-driven codegen

The attractive version of this: define each packet's layout once per version range in a
declarative schema and generate the codecs, hand-writing only the packets the schema
underspecifies. Three candidate schema sources:

- **Mojang's `metadata.zip`.** Already pinned per version, already diffed mechanically by
  `x-ordinal-index`, and the provenance every 2225 sibling class cites. But as a *generator
  input* it underspecifies exactly the packets that matter: `LevelEventGenericPacket`'s body is
  declared opaque, `ItemStackRequest` and `CraftingData` are the packets this repo has
  byte-level gophertunnel-verified tests for because no published schema gets them right, the
  preview.21 release corrected swathes of wrong optionality, gophertunnel PR #545 fixed four
  packets *against Endstone dumps* because the docs were wrong, and the docs' own tracker
  (issue #57) records 18 enums present in the HTML but absent from the JSON schemas and only 8
  of 13 NBT tag types modeled. Generating from them is being tried: bedrock-mc/protocolgen emits
  Go and Rust packet code from Mojang's docs cross-checked against Endstone's dumps, explicitly
  because "the two doc sources disagree with each other and are each individually wrong
  sometimes", resolving disagreements through a hand-maintained corrections file. That is the
  shape this option converges on, a generator plus a corrections layer plus byte-level tests,
  which is more machinery than the 270-line-per-version delta it would replace. A generator is
  only as good as its schema, and this schema is good enough to diff and verify against, not to
  generate from unattended.
- **A hand-authored DSL (ProtoDef, as minecraft-data/bedrock-protocol use).** This works; it is
  also a whole second implementation surface. PrismarineJS maintains full per-version
  `protocol.json` trees with compiled read/write paths and still hand-writes the compound types,
  and the update lag is visible from here: 1.26.60 support is an open issue (#840) while this
  repo shipped 2225. Adopting it means porting ~171 packet layouts into a DSL, debugging through
  generated code, and keeping the DSL's semantics honest for NBT, optional-trailing fields and
  the skin, for a delta that is currently 270 lines a version.
- **Kaitai.** Read-only in practice for this use (serialization support is partial), and its
  type system does not model Bedrock's optional-trailing and context-dependent fields without
  opaque escapes. Not a candidate for a server that must write every packet.

The server-rearchitecture plan already weighed full schema codegen and rejected it on schema
quality grounds; this survey confirms that call. Where the schemas *do* earn their keep is as an
oracle: the mechanical ordinal diff found every 2225 layout change including the one that caused
the Terracotta disconnect, and the right investment is keeping that diff cheap to run per bump,
not generating code from it.

### d. Transform chains (ViaVersion style)

Write only the latest layout and chain per-version adapters downward: a 1.10 client's packet is
translated to 1.9.4, then 1.9.3, until it reaches the server version. This is the architecture
the user fears, and the fear is justified where it is used: ViaVersion's own developers describe
the internal translator list, the cost grows with chain length, and old clients cost more per
packet. It is the right design *for a proxy between two fixed endpoints it does not control*,
because the proxy cannot ask the server to speak anything else.

It is the wrong design for a server that owns both the gameplay representation and every codec.
Nothing in this codebase chains even once (see "What the current design is" above), and nothing
proposed here would introduce a chain: a new codec adds one more flat map, not one more hop.
Adopting chains deliberately would convert O(1) encodes into O(window) re-encodes and smear
layout knowledge across adapter pairs. No candidate below considers it further.

### e. Hybrids

Two were considered. Schema-generated field readers consumed by hand-written packet classes buys
little here, because the field-level primitives (`readSignedByte`, the struct serializers) are
already shared and the per-version delta is not in the primitives. A version-range annotation
that collapses sibling classes ("this hook applies for 2225..2286") is option (b) wearing
option (a)'s clothes, and inherits (b)'s type-safety loss without removing the hooks. Neither
beats the status quo plus a pruning policy, which is itself the honest hybrid: delta classes for
the live window, folded flat as the window slides.

## Comparison

| | a. Delta + siblings (status quo) | b. In-class conditionals | c. Schema codegen | d. Transform chains |
| --- | --- | --- | --- | --- |
| Marginal cost per version | ~350 lines: 6-8 siblings, id delta, codec, data table, tests | Same edits, fewer files | Schema delta, plus hand code for underspecified packets | One adapter per packet that changed, both directions |
| Cost at N versions, no pruning | ~6-8 classes and a hook per insertion point per version; linear, local | One branch per divergence in hot encode bodies | Linear schema growth; generated code volume | O(window) re-encodes per packet at runtime |
| Pruning the oldest | Fold delta into base, delete files; local, roughly the size of adding it | Grep and delete branches | Delete a schema version | Delete the last adapter |
| Type safety | Version fields exist only on their class | All fields on one class at all versions | Depends on generator; casts at the seams | Weakest; adapters are untyped byte surgery |
| Debugging a codec bug | One subclass vs one base, both citing schema ordinals | One body, branch archaeology | Through generated code | Across adapter pairs |
| Migration from today | None | Rewrite 8 siblings into branches, drop `prepareOutbound` semantics | Port ~171 layouts into a DSL, build or adopt a generator, keep byte-level tests as the oracle | Full rearchitecture |
| Item-table and enum versioning | Already folded in: codec carries `ProtocolItemData`, enums generate per version | Same mechanism works | Data is outside the schema anyway; unchanged | Data must version per hop |

Prior art maps onto the columns. CloudburstMC/Protocol is architecture (a) at scale: per-version
codec builders deltaing the previous version, `*_v291` serializer class packages, and it is what
Geyser rides. Notably it has *not* pruned: codecs back to v291 (1.7.0, 2018) are still listed,
and its issue tracker shows users requesting more old versions rather than maintainers
complaining about class proliferation, which is evidence that (a)'s accumulation stays
manageable even without a window, let alone with one. gophertunnel's README says it "supports
only one version at a time" and exposes a `Protocol` interface for others to implement; the
community multiversion libraries built on it are translation layers, and two of the major three
are archived. pmmp/BedrockProtocol targets exactly one game version per release and its
community MultiVersion plugin is discontinued. bedrock-protocol (npm) is architecture (c); its
1.26.60 update took days and consisted of transcribing gophertunnel's and Cloudburst's work into
ProtoDef JSON, and its users meanwhile hit raw decode errors ("Invalid tag: 80 > 20") instead of
a version refusal, the debuggability cost of a generated codec in one line. Nobody serving
Bedrock clients runs (d) inside a server.

## The deprecation axis

The 100-protocol accumulation is a non-problem because no Bedrock server carries 100 protocols.
BDS supports exactly one. Geyser's stated policy is the latest stable release plus "maybe a
minor revision or two for a limited time", enforced by a rolling window (adding 1.26.60 dropped
1.26.30 in the same build), with the explicit rationale that Bedrock auto-updates on every
platform so old versions have no audience. A realistic window for this server is two to four
protocols.

At that window, steady state for the status quo is roughly 12 to 30 sibling classes and two to
four codec files, total, forever. What makes the window real rather than aspirational is that
pruning must be cheap, and in this architecture it is, with one current caveat: a future sibling
should extend the newest previous sibling of the same packet (a `StartGamePacket2286` extending
`StartGamePacket2225`), so that the inheritance chain mirrors the codec chain and folding the
oldest layout into the base stays a local edit. That convention is not yet written anywhere
because no third version exists; it should be, before one does.

Dropping protocol 2193 today, concretely: fold the eight 2225 overrides into their base classes
(delete the hooks that no longer vary), delete the eight siblings, `Codec2193`'s registration,
`v2193.ts`, the 2193 item table wiring, and `generated/v2193/`; repoint
`defaultProtocolVersion`. Comparable in size to the commit series that added 2225.

## Answers to the questions asked

**"Do packets go through 100 transforms 100 protocols in?"** No. They never go through more than
one today, and the architecture has no mechanism by which they could: `prepareOutbound` is a
single map lookup at the session seam, and each codec resolves to a flat id-to-class table. One
hundred protocols in, a packet is still encoded exactly once, by the one class the session's
codec chose. The thing that *would* accumulate, sibling classes, is bounded by the support
window instead, and the window is an industry norm (Geyser prunes continuously, BDS supports
one version).

**"Protobuf, or something similar?"** Not applicable, and it is worth being precise about why.
The wire format is Mojang's; this server must emit and consume Bedrock's exact bytes (its
varints, its little-endian fixed ints, its length-prefixed strings, its network NBT, its
optional-trailing fields). Protobuf, FlatBuffers and friends are wire formats, not just schema
languages; they cannot produce Bedrock bytes, so protobuf-the-format is dead on arrival. The
salvageable reading, protobuf-the-IDL feeding a custom Bedrock-bytes generator, is architecture
(c) with a schema language that models none of Bedrock's quirks, strictly worse than generating
from Mojang's own `metadata.zip`, which this note also recommends against as a generator (the
schemas are wrong exactly where it hurts) while keeping it as the diff and verification oracle
it already is.

## Recommendation

Keep the delta codec with sibling classes. Change process, not architecture, in three slices:

1. **Write the support-window and pruning policy down** (a short section in
   `docs/plans/server-rearchitecture.md` or a versioning doc): the server supports a sliding
   window of two to four protocols; dropping the oldest folds its successor's layouts into the
   base classes and deletes the version's codec, id delta, siblings, data table and generated
   enums; a sibling class extends the newest previous sibling of its packet. Docs-only slice.
2. **Script the ordinal diff.** The 2193-to-2225 layout delta was derived mechanically from the
   two pinned `metadata.zip` files by `x-ordinal-index`; capture that as a small script under
   `packages/minecraft/datagen` (or a documented command) so the next bump starts from a
   machine-produced change list instead of re-deriving the method. One slice; the pinning and
   download machinery already exists.
3. **Nothing else.** Do not port to a DSL, do not generate codecs, do not introduce adapters.
   Revisit only if the observed delta rate changes shape, for example if Mojang starts
   restructuring packets wholesale rather than appending, at which point the per-packet byte
   tests and the parity suite are the regression net a bigger move would stand on.

Estimated effort: one documentation slice and one small tooling slice. Estimated effort of the
alternatives it declines: a multi-week port (c) or a rearchitecture (d), for a problem whose
measured size is 270 lines per protocol version.

## Sources

- This repository: `packages/prismarine/src/network/codec/` (`ProtocolCodec.ts`, `Codec2193.ts`,
  `Codec2225.ts`, `itemData.ts`, `v2193.ts`, `v2225.ts`), the eight `*2225.ts` packet classes,
  `MinecraftSession.ts`, [protocol-2225-delta.md](protocol-2225-delta.md),
  [server-rearchitecture.md](../plans/server-rearchitecture.md).
- [CloudburstMC/Protocol](https://github.com/CloudburstMC/Protocol): per-version codecs built as
  deltas, `*_v291` serializer classes, 3.0's `BedrockCodec` builders; the
  [README](https://github.com/CloudburstMC/Protocol/blob/develop/README.md) still lists support
  back to v291, and [ProxyPass issue #60](https://github.com/CloudburstMC/ProxyPass/issues/60)
  is users asking for more versions, not fewer.
- [Geyser supported versions](https://geysermc.org/wiki/geyser/supported-versions/) and the
  [Geyser README](https://github.com/GeyserMC/Geyser): the rolling window, 1.26.30 dropped when
  1.26.60 landed, and the stated latest-stable-only policy.
- [Sandertv/gophertunnel](https://github.com/Sandertv/gophertunnel): latest-protocol-only with a
  `Protocol` interface; [PR #545](https://github.com/Sandertv/gophertunnel/pull/545) fixing four
  packets against Endstone dumps where Mojang's docs were wrong. Community multiversion
  implementations: [Flonja/multiversion](https://github.com/Flonja/multiversion) (archived),
  [ethaniccc/legacy-version](https://github.com/ethaniccc/legacy-version),
  [oomph-ac/mv](https://github.com/oomph-ac/mv) (archived).
- pmmp: [supported MCPE versions](https://galactic.readthedocs.io/en/latest/supportedMCPEversions.html)
  (one protocol per release), the
  [MultiVersion plugin](https://github.com/AkmalFairuz/MultiVersion) (discontinued), and the
  [pmmp protocol-update internals doc](https://doc.pmmp.io/en/rtfd/developers/internals-docs/updating-minecraft-protocol.html).
- PrismarineJS: [bedrock-protocol CONTRIBUTING](https://github.com/PrismarineJS/bedrock-protocol/blob/master/docs/CONTRIBUTING.md),
  [minecraft-data bedrock doc](https://github.com/PrismarineJS/minecraft-data/blob/master/doc/bedrock.md),
  [minecraft-data PR #1321](https://github.com/PrismarineJS/minecraft-data/pull/1321) (adding
  1.26.51), [bedrock-protocol issue #840](https://github.com/PrismarineJS/bedrock-protocol/issues/840)
  (1.26.60 support, open).
- ViaVersion: [ProtocolPipeline API](https://jd.viaversion.com/us/myles/ViaVersion/api/protocol/ProtocolPipeline.html)
  and the developer's description of chained per-version translators
  ([SpigotMC thread](https://www.spigotmc.org/threads/how-via-version-actually-work.175044/)).
- [Mojang/bedrock-protocol-docs releases](https://github.com/Mojang/bedrock-protocol-docs/releases):
  the pinned `metadata.zip` schemas whose `x-ordinal-index` fields the mechanical diff reads;
  [issue #57](https://github.com/Mojang/bedrock-protocol-docs/issues/57) on the schemas' gaps;
  the [machine-readable changelog](https://mojang.github.io/bedrock-protocol-docs/changelog/).
- [bedrock-mc/protocolgen](https://github.com/bedrock-mc/protocolgen): Go and Rust packet
  codegen from Mojang's docs cross-checked against Endstone dumps, with a corrections layer.
- [pmmp/BedrockProtocol releases](https://github.com/pmmp/BedrockProtocol/releases): the per-bump
  change lists the protocol 712 and 729 survey numbers come from.
- [bedrock-protocol issue #841](https://github.com/PrismarineJS/bedrock-protocol/issues/841):
  the raw decode error a lagging generated codec shows users during a version gap.
