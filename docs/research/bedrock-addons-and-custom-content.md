# What must a server do for a vanilla Bedrock client to render custom blocks, items and entities?

Researched 2026-10-24 against Mojang/bedrock-samples at tag `v1.26.50.4` (commit `46ba6ea985fb5a92d79a9419198f10dda14c199d`), Mojang/bedrock-protocol-docs at commit `4fbe153e04e56645addc681259e398b94c60d14f` (Minecraft 1.26.70-beta.21, protocol 2238), MicrosoftDocs/minecraft-creator at commit `4432fb62a8e0ce5c785bd2bf02a6f981dcffbbe8`, and the source of PowerNukkitX, Allay, Geyser, gophertunnel, Dragonfly, Cloudburst Nukkit, PocketMine-MP, ViaBedrock and PrismarineJS/bedrock-protocol at the commits named in section 9. It covers pack containers, pack delivery and the network registration of custom content. It does not repeat the vanilla pack grammars, which are in [bedrock-data-extraction.md](bedrock-data-extraction.md) and [bedrock-blocks-items-recipes-biomes-features.md](bedrock-blocks-items-recipes-biomes-features.md), nor the Molang language itself, which is in [molang.md](molang.md). The prefix `docs:` below names a file under `creator/` in the MicrosoftDocs/minecraft-creator repository; the same page is published at `https://learn.microsoft.com/en-us/minecraft/creator/` with the path lowercased.

## Summary

- The client learns about custom content from two places and no third: a resource pack it downloads over the game connection, and NBT the server writes into `StartGamePacket.Block Properties` and `ItemRegistryPacket.Item Data`. Behavior packs never reach the client. A third-party server that reimplements both of those is indistinguishable from BDS as far as rendering goes.
- `.mcpack`, `.mcaddon`, `.mcworld` and `.mctemplate` are all plain zips with no magic bytes, distinguished only by the extension and by what is at the archive root (`docs:Documents/MinecraftFileExtensions`). `.mcaddon` holds `.mcpack` or `.mcworld` members; a `.mcworld` holds `db/`, `level.dat`, `levelname.txt` and, with add-ons, `behavior_packs/`, `resource_packs/`, `world_behavior_packs.json` and `world_resource_packs.json`. Pack folder names inside a template must be 10 characters or shorter.
- `manifest.json` is the only required file in any pack. The authoritative schema is `metadata/json_schemas/client_server/packaging/3.0.0/Manifest.json` in bedrock-samples: six optional top-level keys plus `format_version`, `header` and `modules` required, `modules` with `minItems: 1`, `settings` capped at 50 entries, dropdown and multiselect options capped at 20 and setting names forbidden from the `minecraft` namespace. `format_version` is 1 for skin packs, 2 for everything else, and 3 in preview with SemVer strings instead of `[a, b, c]` arrays.
- Pack delivery is `ResourcePacksInfo`, then per-pack `ResourcePackDataInfo` and a `ResourcePackChunkRequest`/`ResourcePackChunkData` loop, then `ResourcePackStack`. `File Hash` is the SHA-256 of the zip on disk. Nobody enforces a maximum pack size and nobody has found a client timeout, but the client does choke on bursts: chunk sizes in the wild run from 8 KiB to 256 KiB, and three projects independently added inter-chunk pacing after clients went unresponsive.
- A pack can be served from a URL instead: `PackInfoData.CDN URL` has been per-pack since protocol 748 (1.21.30, 2024-09-24). The client demands a direct link to a `.zip` or `.mcpack`, `Content-Type: application/zip` and an exact `Content-Length`, and Geyser observes that mixing URL packs and chunked packs in one session makes the client fall back to chunked delivery for all of them.
- Pack encryption is AES-256-CFB8 with a 32-byte content key and the IV taken as the first 16 bytes of that same key, applied per file with a per-file key, indexed by a `contents.json` whose 256-byte header is cleartext and whose JSON body is encrypted with the pack key. `manifest.json` and `pack_icon.png` stay in the clear. The pack key travels to the client in `PackInfoData.Content Key`, so a server that encrypts its own packs also hands over the key and gains nothing but obscurity.
- A custom block needs an entry in `StartGamePacket.Block Properties` whose NBT carries `components`, `menu_category`, `molangVersion`, `properties`, `permutations`, `traits` and `vanilla_block_data.block_id`, and its states must be in the block palette the client and server agree on. The component names in that NBT are not the JSON component names: `minecraft:light_emission` takes an `emission` byte, `minecraft:friction` takes a `value` float, `minecraft:material_instances` splits into `mappings` and `materials`, and tags are empty compounds keyed `tag:<name>`.
- With no resource pack a server can still register a custom block and get correct collision, selection, light, friction, mining time, display name and creative placement. It cannot get a texture: every texture reference in the block definition is a short name resolved against the client's `terrain_texture.json`, so a block registered without a pack renders with the missing-texture checkerboard.
- A custom item is one `ItemData` entry in `ItemRegistryPacket` with `Is Component Based` true, `Item Version` `DataDriven` (1) and a component compound containing `item_properties`. Creative placement is separate: `CreativeContentPacket` carries the groups and entries, and a custom item that is not in it is reachable only by command.
- Custom entities are the weakest case. The server sends only the identifier string in `AddActorPacket.Actor Type`, and the client looks it up in its own `entity/*.entity.json`. With no resource pack the entity exists, collides and takes damage but draws nothing. The usual workaround is to reuse a vanilla identifier, which costs the identifier's hardcoded behavior.
- `@minecraft/server` runs inside Mojang's own engine. A third-party server cannot execute a behavior pack's scripts; it can only reimplement the API. Custom components are the entire extent of per-block and per-item scripted behavior, and version 2 requires both the "Beta APIs" and "Custom Components V2" experiments.
- Mojang has broken add-ons repeatedly and on purpose. 1.26.20 made free-standing tags in a block's `components` an error, required `menu_category.category`, and stopped accepting a boolean for `material_instances.ambient_occlusion`; 1.21.80 made `minecraft:geometry` and `minecraft:material_instances` an all-or-nothing pair; 1.19.70 removed numeric `data` from `/setblock` and friends.
- PowerNukkitX, Allay and Geyser all register custom blocks by hand-building the same NBT, and all three carry comments saying they do not know what parts of it mean. All are reusable in principle: Geyser and gophertunnel are MIT, PowerNukkitX and Allay are LGPL-3.0, Cloudburst Protocol is Apache-2.0.

## 1. Pack containers and the manifest

### The four container formats

`docs:Documents/MinecraftFileExtensions` defines all four, and all four are zip archives:

| Extension | Contents | Where the client puts it |
|---|---|---|
| `.mcpack` | One behavior pack or one resource pack, with `manifest.json` at the archive root | `behavior_packs/` or `resource_packs/` |
| `.mcaddon` | One or more `.mcpack` or `.mcworld` files | Each member is imported separately |
| `.mcworld` | A playable world: `db/`, `level.dat`, `level.dat_old`, `levelname.txt`, `world_icon.jpeg` | The world list |
| `.mctemplate` | A `.mcworld` plus a `world_template` manifest and a `texts/` folder | The world template list |

Nothing about the zip itself marks the type. `docs:Documents/CreateAWorldTemplate` is explicit that a `.mcworld` is a renamed `.zip` and warns that zipping the containing folder rather than its contents makes the import fail, because the game expects `level.dat` at the archive root and not one directory down.

A world exported with add-ons active gains `behavior_packs/`, `resource_packs/`, `world_behavior_packs.json`, `world_resource_packs.json`, `world_behavior_pack_history.json` and `world_resource_pack_history.json` (`docs:Documents/CreateAWorldTemplate`, "Variation: Add-On Packs"). The same document sets a hard limit that is easy to miss: "Resource pack and behavior pack folder names in world templates must be 10 characters or shorter", because long paths stop packs loading on Xbox.

A world template manifest uses module type `world_template` and can set `allow_random_seed: true` in the header, in which case the `db/` folder is deleted and the template applies to a freshly generated world.

### The manifest schema

bedrock-samples ships a machine-readable schema at `metadata/json_schemas/client_server/packaging/3.0.0/`. It is the best source because `docs:Reference/Content/AddonsReference/PackManifest` describes version 2 and version 3 in prose but omits the limits.

`Manifest.json` requires `format_version`, `header` and `modules`:

| Key | Type | Constraint |
|---|---|---|
| `format_version` | integer | 0..255, stored as uint8. 1 for skin packs, 2 for resource, behavior and world template packs, 3 in preview from 1.21.110 |
| `header` | `Header.json` | required |
| `modules` | array of `Module.json` | required, `minItems: 1` |
| `dependencies` | array of `PackDependency.json` or `NativeModuleDependency.json` | |
| `settings` | array of 5 setting types | `minItems: 1`, `maxItems: 50` |
| `subpacks` | array of `Subpack.json` | |
| `capabilities` | array of string | |
| `metadata` | `Metadata.json` | |
| `has_education_metadata` | boolean | |

`Header.json` requires only `name`, `uuid` and `version`. The full field list is `name` (`minLength: 1`), `description`, `uuid` (matched against `^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`), `version`, `min_engine_version`, `base_game_version`, `pack_scope`, `platform_locked`, `allow_random_seed`, `lock_template_options` and `pack_optimization_version`. `SemVersion.json` carries the full SemVer 2.0 regex and caps each numeric component at five digits.

`pack_scope` is `world`, `global` or `any`, and defaults to `any`. `base_game_version`, `allow_random_seed` and `lock_template_options` are world-template only. `min_engine_version` is required for resource and behavior packs, and the docs say to "always use the highest version currently available".

`Module.json` requires `type`, `uuid` and `version`, and also accepts `description`, `language` and `entry`. The schema leaves `type` as a free string; the documented values are `resources`, `data`, `world_template`, `script`, `skin_pack`, `client_data` and `interface`. `language` is only read when `type` is `script`, and `javascript` is its only supported value. `entry` names the script file, conventionally `scripts/main.js`.

Dependencies come in two shapes. `PackDependency` is `{uuid, version}` and points at another pack's header UUID. `NativeModuleDependency` is `{module_name, version, optional}` and names a built-in script module such as `@minecraft/server`; its `version` is either a SemVer string or one of `alpha`, `beta`, `internal` (`VersionSelectType.json`). A cooperative add-on must declare exactly one dependency in each direction between its behavior pack and its resource pack, which the validation rules enforce as `CADDONREQ165`, `CADDONREQ166`, `CADDONREQ168` and `CADDONREQ169` (`docs:Reference/Content/MCToolsValReference/caddonreq`).

`Metadata.json` has `authors`, `license`, `url`, `product_type` and `generated_with`. `product_type` has one supported value, `addon`. `generated_with` maps a tool name (`[a-zA-Z0-9_-]`, at most 32 characters) to the list of its versions that touched the file. Manifest version 3 currently requires `metadata.authors` to be set, which the docs call a bug they intend to fix.

`capabilities` is five documented strings: `chemistry`, `editorExtension`, `experimental_custom_ui`, `raytraced` and `pbr`.

### Behavior pack against resource pack

The two halves share nothing but UUIDs and identifiers. `docs:Documents/ComprehensivePackContents` enumerates the directories of each. The behavior pack owns `blocks/`, `items/`, `entities/`, `recipes/`, `loot_tables/`, `spawn_rules/`, `trading/`, `features/`, `feature_rules/`, `functions/`, `structures/`, `item_catalog/`, `dialogue/`, `cameras/`, `animations/`, `animation_controllers/` and `texts/`. The resource pack owns `entity/`, `attachables/`, `models/`, `textures/`, `materials/`, `render_controllers/`, `animations/`, `animation_controllers/`, `particles/`, `sounds/`, `fogs/`, `block_culling/`, `ui/`, `texts/`, plus the root files `blocks.json`, `sounds.json`, `biomes_client.json` (deprecated) and `pack_icon.png`.

Note the singular `entity/` in the resource pack against the plural `entities/` in the behavior pack, and `function` against `functions`: the document calls out that folder names are exact and a misspelling means the files are silently ignored.

Scale, from the samples repository: the vanilla behavior pack is 13 MB over 2902 files, the vanilla resource pack is 309 MB over 18233 files. `resource_pack/blocks.json` has 1352 block entries (1331 with `textures`, 1313 with `sound`, 155 with `isotropic`, 151 with `carried_textures`, 36 with `ambient_occlusion_exponent`), `textures/terrain_texture.json` has 1367 named textures and `textures/item_texture.json` has 504.

### Subpacks

`Subpack.json` requires all three of `name`, `folder_name` and `memory_performance_tier` (0..5). Files under `subpacks/<folder_name>/` override the same paths in the pack root. `docs:Documents/BuildingSubpacks` gives the tier-to-platform table: tier 1 is Nintendo Switch, 2 is PS4 and Xbox One, 3 is Xbox One X and Series S, 4 is Series X and PS5, 5 is PS5 Pro and most PCs. The game picks the highest tier that does not exceed the device, and the player may step down but not up. The same document still documents the older `memory_tier` field, which the version 3 schema no longer has.

The selected subpack travels to the client as `PackInfoData.Subpack Name` and `PackInstanceId.Sub Pack Name`, so the server, not the client, decides which subpack applies to a session.

### Versioning and upgrade rules

The header `version` decides replacement: "The new pack will replace the old one if the version is higher, and ignored if it's the same or lower" (`docs:Reference/Content/AddonsReference/PackManifest`). Pack identity is the header UUID; the module UUIDs must differ from it and from each other.

`min_engine_version` has one documented runtime effect beyond compatibility shims. A client entity definition may carry its own `min_engine_version`, and the game picks the definition with the highest `min_engine_version` that does not exceed the engine version the top resource pack was built for, discarding the rest (`docs:Reference/Content/EntityReference/Examples/ClientEntityDocumentation/ClientEntityDocumentationIntroduction`). That is the only place a pack can ship two versions of the same thing and have the game choose.

Per-file `format_version` is separate from the pack's `min_engine_version` and gates the grammar of that one file. Section 8 lists the version gates that matter.

### Pack optimization

BDS can bake a loose pack into archives. Running `bedrock_server.exe PackOptimizerConfigPath=<path>` reads `{input_directory, output_directory, verbose_logging}`, minifies the JSON, writes `__brarchive/` containers into the output pack and exits with code 7 (`ResourceProcessingError`) on failure (`docs:Documents/BedrockServer/pack-optimization`). An optimized pack sets `pack_optimization_version` in its header and will not load on a client older than 1.26.40. This is the same `.brarchive` container the vanilla behavior pack inside BDS uses, described in [bedrock-data-extraction.md](bedrock-data-extraction.md) section 2.

## 2. Delivering packs to the client

### The handshake

Packet ids from `json/MinecraftPacketIds.json`: `ResourcePacksInfo` 6, `ResourcePackStack` 7, `ResourcePackClientResponse` 8, `ResourcePackDataInfo` 82, `ResourcePackChunkData` 83, `ResourcePackChunkRequest` 84.

The sequence is:

1. Server sends `ResourcePacksInfoPacket` listing every pack the client needs.
2. Client replies `ResourcePackClientResponsePacket` with `Downloading` and the set of pack identifiers it wants, or `Cancel` if it refuses.
3. For each wanted pack the server sends `ResourcePackDataInfoPacket`, then answers each `ResourcePackChunkRequestPacket` with a `ResourcePackChunkDataPacket`.
4. Client replies `DownloadingFinished`.
5. Server sends `ResourcePackStackPacket` with the apply order.
6. Client sends `ResourcePacksReadyForValidationPacket` once its packs have loaded, then `ResourcePackClientResponsePacket` with `ResourcePackStackFinished`.
7. Server starts the join.

`ResourcePackResponse` is an int8: `Cancel` 1, `Downloading` 2, `DownloadingFinished` 3, `ResourcePackStackFinished` 4 (`json/ResourcePackResponse.json`). Only the `Downloading` alternative carries a payload, a list of pack identifier strings (`json/Resource_Pack_Client_Response_-_Downloading.json`).

### ResourcePacksInfoPacket

Fields in wire order (`json/ResourcePacksInfoPacketPayload.json`): `Resource Pack Required`, `Has Addon Packs`, `Has Scripts`, `Force Disable Vibrant Visuals`, `World Template Id And Version`, `Resource Packs` (at most 65535 entries).

Each entry is a `PackInfoData` (`json/PackInfoData.json`): `Pack Id Version` (UUID plus SemVer string), `Pack Size` as uint64, `Content Key`, `Subpack Name`, `Content Identity`, `Has Scripts`, `Is Addon Pack`, `Is Ray Tracing Capable`, `CDN URL`.

`Resource Pack Required` is the forced-pack switch. BDS exposes it as `texturepack-required` in `server.properties`, default `false`: "If the world uses specific texture packs, setting this to `true` forces the clients to use them" (`docs:Documents/BedrockServer/server-properties`). PowerNukkitX splits it into two settings and sends `forceResources && !forceResourcesAllowOwnPacks` (`src/main/java/org/powernukkitx/network/process/handler/ResourcePackClientResponseHandler.java:69`). When the flag is set and the client answers `Cancel`, the server's only move is to disconnect.

`Has Addon Packs` and `Has Scripts` are summaries of the per-entry flags. `Content Identity` is the Marketplace identity of a premium pack; a third-party server has nothing to put there and leaves it empty.

### Chunked transfer

`ResourcePackDataInfoPacketPayload` carries `Resource Name`, `Chunk Size` (uint32), `Number of Chunks` (uint32), `File Size` (uint64), `File Hash`, `Is Premium Pack`, `Pack Type` (uint8).

`Resource Name` is constrained in the schema to "A string in the format of `<uuid>_<semver>`" (`json/ResourcePackChunkRequestPacketPayload.json`), and CloudburstMC's serializer reads it with `readStringMaxLen(buffer, 100)`. gophertunnel builds it as `pack.UUID().String() + "_" + pack.Version()` with the note that "Clients generally request packs as `uuid_version`, and ResourcePackDataInfo must use that same identifier shape so the client can match the response to its request" (`minecraft/resource_pack_queue.go:37-39, 83`). The constraint is softer than it looks: Cloudburst Nukkit and PocketMine-MP send the bare UUID with no version suffix and the client still matches. PowerNukkitX splits on the first `_` and tolerates both forms (`ResourcePackClientResponseHandler.java:36-40`).

`File Hash` is the SHA-256 of the whole file on disk, not of the extracted contents and not per chunk. gophertunnel computes it with `sha256.Sum256(content)` over `os.ReadFile(path)` (`minecraft/resource/pack.go:314-321`); Geyser's `GeyserPathPackCodec` does the same and invalidates it on mtime change. For an encrypted pack this is the hash of the ciphertext archive.

`Number of Chunks` is advisory. gophertunnel's comment: "The client calculates the chunk count by itself: You could in theory send a chunk count of 0 even though there's data, and the client will still download normally" (`minecraft/conn.go:1264-1265`). ViaBedrock annotates the field "Ignored by the Bedrock client".

`Pack Type` is a `PackType` enum: `Invalid` 0, `Addon` 1, `Cached` 2, `CopyProtected` 3, `Behavior` 4, `PersonaPiece` 5, `Resources` 6, `Skins` 7, `WorldTemplate` 8 (`json/PackType.json`). Every third-party server sends `Resources` (6) for a resource pack and never sends a behavior pack at all.

`ResourcePackChunkDataPacketPayload` is `Resource Name`, `Chunk ID` (uint32), `Byte Offset` (uint64), `Chunk Data`.

### Chunk size and pacing

Chunk size is the server's choice and the numbers in the wild span a factor of 32:

| Implementation | Chunk size | Pacing |
|---|---|---|
| Cloudburst Nukkit `Player.RESOURCE_PACK_CHUNK_SIZE` | 8 KiB | none |
| gophertunnel `DefaultResourcePackChunkSize`, and Dragonfly through it | 128 KiB | 200 ms after each chunk, configurable |
| Geyser `GeyserResourcePack.CHUNK_SIZE` | 256 KiB | none since October 2026 |
| PowerNukkitX `ResourcePackManager.maxChunkSize` | 256 KiB | none |
| PocketMine-MP `ResourcePacksPacketHandler` | 256 KiB | one chunk in flight at a time |
| This repository's `ResourcePackDataInfoPacket` test | 1 MiB | not implemented |

Three projects independently hit the same client failure and three of them fixed it differently, which is the best evidence available that the client has an undocumented rate limit:

- PowerNukkitX [PR #1997](https://github.com/PowerNukkitX/PowerNukkitX/pull/1997), merged 2025-06-07, raised the chunk size from 32 KiB to 256 KiB and added a four-tick (roughly 200 ms) delay, saying the old behavior was "bursting too much tiny packets to the clients making them unresponsive" and that it was "Tested with... heavy packs (more than 110Mb encrypted)". That 110 MB is the largest pack size with a primary-source success report I found.
- gophertunnel added pacing in [PR #446](https://github.com/Sandertv/gophertunnel/pull/446) (2026-07-22) and made it configurable in [PR #482](https://github.com/Sandertv/gophertunnel/pull/482) (2026-08-05). The constant's comment is "Clients after 1.26.30 may fail resource pack downloads when pack chunks are sent too aggressively".
- Geyser extended a console-only delay to all platforms in [PR #6453](https://github.com/GeyserMC/Geyser/pull/6453) (2026-06-16), citing the PowerNukkitX change, then removed it again in [PR #6754](https://github.com/GeyserMC/Geyser/pull/6754) (2026-10-09) after fixing its own batch encoder, replacing the delay with a per-pack `BitSet` that drops duplicate chunk requests.
- PocketMine-MP never paced and instead throttles concurrency: `MAX_CONCURRENT_CHUNK_REQUESTS = 1`, with the comment "Larger values allow downloading more chunks at the same time, increasing download speed, but the client may choke and cause the download speed to drop (due to ACKs taking too long to arrive)".

The right reading is that the failure is RakNet-level congestion rather than a protocol rule: either pace the writes or keep one chunk in flight, and large chunks beat small ones.

### Timeouts and size limits

No implementation enforces a maximum pack size, and `Pack Size` and `File Size` are both uint64. The only ceiling anybody has is incidental: ViaBedrock allocates `new byte[Math.toIntExact(size)]`, which caps it at 2 GiB on the JVM, and PowerNukkitX caps only its own startup probe of a URL pack at 512 MiB.

Mojang documents no size limit either. `PACKSIZE401` in the Creator Tools rules is a warning that says "Target under 100MB for best mobile compatibility", `PACKSIZE402` warns on the packaged `.mcaddon` or `.mcpack` size without naming a number, and `PACKSIZE410` is an error for a zip the tool could not read, advised as "ensure you're using standard ZIP compression without advanced features" (`docs:Reference/Content/MCToolsValReference/packsize`).

There is no handshake timeout on the server side either, at least in gophertunnel, whose `ListenConfig.LoginTimeout` documentation says outright that "The rest of the login sequence, such as resource pack downloads, is not bounded" (`minecraft/listener.go:62-66`). A server that implements this needs its own bound or a stalled download holds a session forever.

One path-length limit does exist and is corroborated from two directions. Geyser warns on any zip entry whose path is 80 characters or longer because it "will cause problems on some Bedrock platforms" (`registry/loader/ResourcePackLoader.java:198-203`), and the world template rule that pack folder names must be 10 characters or shorter gives the same reason, "an issue on Xbox where long paths may cause resource or behavior packs to not load properly".

### URL packs

`PackInfoData.CDN URL` tells the client to fetch the zip itself. The legacy changelogs date it precisely: protocol 617 (1.20.30, 2023-08-24) added `mData.getCDNUrls` as a list of pairs, and protocol 748 (1.21.30, 2024-09-24) replaced it with a per-pack `pack.mCDNUrl` string (`legacy_changelogs/changelog_617_08_24_23.md:23`, `legacy_changelogs/changelog_748_9_24_24.md:48-49`).

Geyser's `UrlPackCodec` documents the client's requirements, and its wiki adds that "It is unfortunately not possible to bypass these, as these are restrictions imposed by the Bedrock client": a direct download link ending in `.zip` or `.mcpack`, `Content-Type: application/zip`, and a correct `Content-Length`. Its own validating downloader rejects a `Content-Length` of zero or less and any other content type, with a 10 second connect and read timeout and an ETag-keyed cache under `cache/remote_packs` that expires after an hour (`util/WebUtils.java:144-204`, `registry/loader/ResourcePackLoader.java:279-315`).

Geyser also records a behavior worth knowing before mixing delivery modes: "Mixing pack codecs will result in all UrlPackCodec delivered packs to fall back to non-cdn delivery!" (`event/type/SessionLoadResourcePacksEventImpl.java:221-223`). It keeps a local mirror of every URL pack precisely so it can answer chunk requests when that happens, re-checks the remote on fallback, and guards repeated failures for 15 minutes.

ViaBedrock's downloader mimics the vanilla client's HTTP behavior exactly, which is the closest thing to a specification of what the client does: 6000 ms connect timeout, 12000 ms read timeout, `User-Agent: libhttpclient/1.0.0.0`, `Accept-Encoding: gzip, deflate`, `Cache-Control: no-cache`, follows redirects, requires a non-negative `Content-Length`.

PowerNukkitX implements URL packs as a pack type with no chunks at all: `CdnResourcePack.getPackChunk` returns an empty array and the response handler skips any pack whose `cdnUrl` is non-empty (`src/main/java/org/powernukkitx/resourcepacks/CdnResourcePack.java:63-68`, `ResourcePackClientResponseHandler.java:46-49`). Its loader optionally downloads the pack once at startup to read the UUID, version and size out of the manifest when the operator did not configure them, with a 30 second timeout. gophertunnel sends a `DownloadURL` for packs read with `resource.ReadURL` but its own client never reads the field, always falling back to the chunked path.

### Encryption and content keys

Two independent implementations describe the same scheme from opposite ends: ViaBedrock decrypts (`src/main/java/net/raphimc/viabedrock/api/resourcepack/ResourcePack.java:44-146`), Muqsit/RPEncrypter encrypts (`ResourcePackEncrypter.php:93-182`), and Allay encrypts (`server/src/main/java/org/allaymc/server/pack/PackEncryptor.java`). They agree on every detail.

A `contents.json` sits at the archive root beside a cleartext `manifest.json`. Despite the name it is binary:

| Offset | Bytes | Content |
|---|---|---|
| 0 | 4 | version, `00 00 00 00` |
| 4 | 4 | magic, `FC B9 CF 9B` |
| 8 | 8 | zero padding |
| 16 | 1 | length of the content id, `0x24` = 36 for a UUID |
| 17 | 36 | the pack UUID as ASCII |
| 53 | 203 | zero padding to offset 256 |
| 256 | rest | AES-256-CFB8 ciphertext of the JSON body |

The UUID in the header must match the `Content Identity` the server sends in `ResourcePacksInfoPacket`; ViaBedrock compares them case-insensitively and refuses the pack otherwise.

The cipher is `AES/CFB8/NoPadding` with the 32-byte content key and the IV taken as the first 16 bytes of that same key. There is no key derivation, no salt and no nonce. The decrypted body is `{"content": [{"path": "<relative path>", "key": "<32-byte key>"}, ...]}`, and every listed file is encrypted with its own 32-byte key under the same cipher and the same IV rule. The per-file keys are byte-preserving Latin-1 strings in the JSON, not base64, so a reader that decodes the file as UTF-8 corrupts them. An entry whose `key` is absent or null is plaintext.

Files that are never encrypted: ViaBedrock skips `manifest.json`, `pack_manifest.json`, `pack_icon.png`, `pack_icon.jpg` and `README.txt`; RPEncrypter skips `manifest.json` and `pack_icon.png` with the comment "these are necessary, otherwise the game won't be able to read the resource pack"; Allay skips `manifest.json`, `pack_icon.png` and `bug_pack_icon.png`. Allay additionally writes a separate `contents.json` per subpack under `subpacks/<name>/`, with paths relative to that directory.

The key must be exactly 32 bytes. PocketMine throws "Invalid encryption key length, must be exactly 32 bytes" after stripping a trailing newline, and RPEncrypter asserts the same. The file convention is `<packfile>.key` beside the zip in Geyser, PocketMine, PowerNukkitX and Nukkit alike, or an `encryption.key` entry inside a plugin jar in PowerNukkitX's case.

No server implementation decrypts; they all forward the key as `PackInfoData.Content Key` and set `Content Identity` to the pack UUID. gophertunnel does not implement the cipher at all; its `Pack.contentKey` is a pass-through string set through `WithContentKey` (`minecraft/resource/pack.go:32-34, 217-226`). Nothing in the protocol binds the key to an account, so encryption on a third-party server stops casual extraction of the zip from the client's cache and nothing more. On Marketplace packs the key comes from Mojang's entitlement service, which is what `Is Premium Pack` and `Content Identity` are for.

### Declining a required pack

A client that refuses sends `ResourcePackClientResponsePacket` with `Cancel`. gophertunnel's packet documentation describes what the player sees: "If set to true, the client gets the option to either download the resource packs and join, or quit entirely. Behaviour packs never have to be downloaded." Every server kicks on it, with different messages: Geyser disconnects with `disconnectionScreen.resourcePack`, PocketMine with "You must accept resource packs to join this server.", PowerNukkitX with `DisconnectFailReason.RESOURCE_PACK_PROBLEM`, Nukkit with `disconnectionScreen.noReason`.

### ResourcePackStackPacket

Fields (`json/ResourcePackStackPacketPayload.json`): `Texture Pack Required`, `Texture Pack List` (at most 65535 `PackInstanceId` entries of `Pack ID`, `Version`, `Sub Pack Name`), `Base Game Version`, `Experiments`, `Include Editor Packs`.

`Base Game Version` is "For clients to be able to set their stack to the right version"; vanilla sends `*`. `Experiments` is `{Toggles: [{Name, Enabled}], ExperimentsEverToggled}` and the toggles array is explicitly marked "No size compression", so its count is a little-endian uint32 while every other count in the packet is a varint. This repository's `ResourcePackStackPacket.ts` already documents that trap.

### What the client does with the packs

The client extracts each pack into its cache keyed by `<uuid>_<version>`, applies the stack in order with the first entry on top, reads `manifest.json` to decide which folders exist, and builds the terrain and item atlases from `textures/terrain_texture.json` and `textures/item_texture.json`. Behavior pack content in a resource pack is ignored. Once the packs have loaded it sends `ResourcePacksReadyForValidationPacket` (id 203 in this repository's `Identifiers`), which has no fields, and then `ResourcePackClientResponsePacket(ResourcePackStackFinished)`.

BDS serves packs from two places: `resource_packs/` and `behavior_packs/` at the server root apply to every world, and the same folders inside `worlds/<level-name>/` apply only to that world (`docs:Documents/BedrockServer/getting-started`, "Shared resource and behavior packs"). Presence in a folder is not activation. `world_resource_packs.json` at the root of the world folder lists what the world actually applies, as an array of `{pack_id, version}` where `pack_id` is the pack manifest's `header.uuid` and `version` is a three-element array, plus an optional integer `priority` where lower values load first (`content/forms/world/world_packs.form.json:5, 26-63` in the creator docs repository). The matching validation rules are `WPACKREFS201` through `WPACKREFS207`. This repository's own `datagen/README-palette.md` uses the behavior pack equivalent to enable a capture pack.

`texturepack-required` is the only pack-related key in the whole 55-entry `server.properties` reference. BDS has no equivalent of Java Edition's `resource-pack` URL, `resource-pack-sha1` or `resource-pack-prompt`; activation is per world through JSON and nothing else.

This repository serves no packs at all today. `ResourcePackChunkRequestHandler.handle` logs the request and disconnects with `DisconnectReason.RESOURCE_PACK_PROBLEM`, and `LoginHandler` lists no packs in `ResourcePacksInfoPacket`.

## 3. Custom blocks end to end

### The behavior pack side

The block JSON grammar, its 39 components and the `states`, `traits` and `permutations` model are covered in [bedrock-blocks-items-recipes-biomes-features.md](bedrock-blocks-items-recipes-biomes-features.md) section 1 and are not repeated here. Two facts from it bear on the network side: `permutations[].condition` is a Molang expression limited to `query.block_state`, and `states` values may be booleans, integers, strings or an integer `{min, max}` range.

The permutation cap is a documented hard limit: "A cap of 65,536 permutations that all blocks on a map can generate has been placed due to performance concerns", and exceeding it produces the warning "Worlds with over 65536 block permutations may degrade performance. Current world has XXXXXX permutations." which blocks Marketplace ingestion (`docs:Reference/Content/BlockReference/Examples/BlockStatesAndPermutations`). That page also still carries the note "To use custom block states, the _Holiday Creator Features_ experiment must be toggled ON", which has been false since 1.19.70 released block states and permutations from that experiment (`docs:Documents/Update1.19.70`).

### The resource pack side

`docs:Documents/AddCustomDieBlock` walks the minimum. A rendering custom block needs:

- `textures/blocks/<name>.png`, with power-of-two dimensions and 16x16 for a `minecraft:geometry.full_block` block.
- An entry in `textures/terrain_texture.json` under `texture_data` mapping a short name to the path. The short name, not the path, is what the block definition references.
- An optional entry in the root `blocks.json`. Since the behavior pack components override everything visual, `blocks.json` is reduced to the `sound` field: "components in Behavior Packs, specifying `minecraft:geometry` and `minecraft:material_instances`, will override configurations here ... leaving **blocks.json** as just a sound configuration system" (`docs:Reference/Content/BlockReference/Examples/BlocksJsonFileStructure`).
- `models/blocks/<name>.geo.json` for a non-cube shape, exported from Blockbench with `format_version` 1.12.0 or later.
- `texts/en_US.lang` with `tile.<namespace>:<name>.name=<display name>`.
- `block_culling/<name>.json` for oversized geometry, against the `client/block/1.21.80/Culling.json` schema in bedrock-samples.

From 1.21.80 `minecraft:geometry` and `minecraft:material_instances` are an all-or-nothing pair: "when using a minecraft:geometry component or minecraft:material_instances component, you must include both" (`docs:Reference/Content/BlockReference/Examples/BlockComponents/minecraftBlock_geometry`). The tutorial restates it as "all custom blocks need their geometry explicitly defined to prevent your Resource Pack from conflicting with vanilla block values".

`material_instances` takes per-face keys `up`, `down`, `north`, `south`, `east`, `west`, plus `*` for the default, plus arbitrary named instances that a face key can reference as a string. `*` is mandatory when the component is present.

Render method decides render distance, which is a limit worth knowing before designing a block: `opaque` is a "far block" drawn to the full render distance, and `double_sided`, `blend`, `alpha_test` and `alpha_test_single_sided` are "near" blocks drawn to half of it. Water is `blend` and still far, and the docs say "This functionality currently can't be replicated by custom blocks" (`docs:Documents/CustomBlockRenderDistance`).

### The network side

`StartGamePacket` field 13 is `Block Properties`, an array of `ServerBlockProperty` (`json/StartGamePacketPayload.json`, `json/ServerBlockProperty.json`). Each entry is a `Block Name` string and a `Block Definition` whose schema is left untyped with the comment "Map of block states. { key (component name):[label,value] } (Can be left empty.)". In practice it is a network NBT compound, and its shape is known only from reverse engineering.

Three independent implementations agree on the top-level keys. Taking Allay's `encodeCustomBlockDefinition` (`server/src/main/java/org/allaymc/server/network/protocol/Protocol.java:510-583`), Geyser's `generateBlockPropertyData` (`core/src/main/java/org/geysermc/geyser/registry/populator/CustomBlockRegistryPopulator.java:344-390`) and PowerNukkitX's `CustomBlockDefinition.Builder` (`src/main/java/org/powernukkitx/block/customblock/CustomBlockDefinition.java:180-217`):

| Key | Type | Content |
|---|---|---|
| `components` | compound | The block-wide components, in network form |
| `menu_category` | compound | `category` string, `group` string, `is_hidden_in_commands` byte |
| `molangVersion` | int | The Molang dialect the conditions are written in |
| `properties` | list of compound | One `{name, enum}` per custom state |
| `permutations` | list of compound | One `{condition, components}` per permutation |
| `traits` | list of compound | `minecraft:placement_direction` and `minecraft:placement_position` |
| `vanilla_block_data` | compound | `block_id` int, and optionally `material` string |

`menu_category` is not optional in practice. Geyser's comment is "this is required or the client will crash".

`vanilla_block_data.block_id` is a numeric id the server allocates. Geyser's comment dates the requirement: "Since 1.20.60, custom blocks need a block_id in their nbt tag", and it allocates from 10000 upward (`CustomBlockRegistryPopulator.java:84-88`). PowerNukkitX uses the same 10000 base (`CustomBlockDefinition.java:57`). PowerNukkitX also writes `material: "dirt"` with the comment "No one knows what it's for, but it's required for making the blocks work"; Allay omits the field entirely and works, so that comment is probably stale for 1.26.

`molangVersion` differs between implementations: Geyser and Allay send 1, PowerNukkitX sends 9. The values come from `MolangVersion` in `json/MolangVersion.json`, whose int16 members run `BeforeVersioning` 0, `Initial` 1, through `QueryBlockPropertyRenamedToState` 9, `DeprecateOldBlockQueryNames` 10, `DeprecatedSnifferAndCamelQueries` 11, `LeafSupportingInFirstSolidBlockBelow` 12, `Latest` 13. 9 is the first version where `query.block_state` is the real name rather than an alias for `query.block_property`, which matches `query.block_property` being marked `last_version: 1.20.10` in `metadata/molang_modules/mojang-molang-queries.json`. Geyser's comment on its own value is "meaning of this version is unknown, but it's required for tags to work and should probably be checked periodically".

### Component names on the wire

The network component names are not the JSON names. The differences, taken from Allay's and Geyser's encoders:

| Network component | NBT shape |
|---|---|
| `minecraft:display_name` | `{value: string}` |
| `minecraft:geometry` | `{identifier, bone_visibility: {<bone>: {expression, version}}, culling, culling_layer, uv_lock (boolean or list of string), ignoreGeometryForIsSolid, needsLegacyTopRotation, useBlockTypeLightAbsorption}` |
| `minecraft:material_instances` | `{mappings: {}, materials: {<face>: {texture, render_method, ambient_occlusion (float), packed_bools (byte), tint_method}}}` |
| `minecraft:collision_box` | `{enabled: bool, boxes: [{minX, minY, minZ, maxX, maxY, maxZ}]}` in sixteenths, horizontal origin shifted by 8 |
| `minecraft:selection_box` | `{enabled: bool, origin: [f,f,f], size: [f,f,f]}`, one box only |
| `minecraft:light_emission` | `{emission: byte}` |
| `minecraft:light_dampening` | `{lightLevel: byte}` |
| `minecraft:friction` | `{value: float}` |
| `minecraft:destructible_by_mining` | `{value: float}` |
| `minecraft:transformation` | `{RX, RY, RZ: int quarter turns, SX, SY, SZ, TX, TY, TZ: float}` |
| `minecraft:placement_filter` | `{conditions: [{allowed_faces: byte bitmask, block_filters: [{name} or {tags, tags_version}]}]}` |
| tags | one empty compound per tag, keyed `tag:<name>` |

Three details are easy to get wrong. `ambient_occlusion` changed type: Geyser's comment reads "Bedrock stopped accepting a byte here in 1.26.20; it must be a float", which matches the 1.26.20 release note that `ambient_occlusion` "does not accept booleans as valid input. It must be a float between 0.0 - 10.0 inclusive". `packed_bools` is a bitfield, not a boolean: Allay packs face dimming at bit 0, random UV rotation at bit 1 and texture variation at bit 2, while Geyser writes only face dimming and leaves a TODO. And Allay inverts friction before sending it, `clamp(1 - friction, 0, 0.9)`, because the client's scale runs the other way from its own.

`properties` entries are `{name: string, enum: list}` where the list element type encodes the domain: `BYTE` with values 0 and 1 for a boolean, `INT` with every value in range for an integer, `STRING` for an enum. Allay filters out any property in the `minecraft:` namespace on the grounds that the placement traits already describe those, which is the right call since the trait states and the intrinsic block states are the same names.

`traits` entries are `{name: "minecraft:placement_direction", enabled_states: {cardinal_direction, facing_direction, corner_and_cardinal_direction}, y_rotation_offset: float, blocks_to_corner_with: []}` and `{name: "minecraft:placement_position", enabled_states: {block_face, vertical_half}}`.

### Runtime ids and the palette

The client has to turn a block state into a number. Two schemes exist, selected by `StartGamePacket.BlockNetworkIds Are Hashes` (field 21).

With hashes on, the runtime id is FNV-1a 32 over the little-endian NBT compound `{name, states}` with the states sorted by key. This repository already implements it in `packages/prismarine/src/block/state/BlockRuntimeIds.ts`, and PowerNukkitX's `HashUtils.computeBlockStateHash` is the same algorithm with offset basis `0x811c9dc5` and prime `0x01000193` (`src/main/java/org/powernukkitx/utils/HashUtils.java:25-55`). A custom block needs nothing extra: hash its compound and both sides agree. `minecraft:unknown` is a special case that hashes to `-2`.

With hashes off, the runtime id is an index into a palette both sides build in the same order, and that order is the FNV-1 64 hash of the block *name*. Geyser sorts the merged vanilla-plus-custom state list with `Long.compareUnsigned(fnv164(a.getString("name")), fnv164(b.getString("name")))` (`core/src/main/java/org/geysermc/geyser/registry/populator/BlockRegistryPopulator.java:190`). Inserting a custom block renumbers vanilla blocks, which is why the hashed scheme is the better choice for a server that adds blocks.

`StartGamePacket` field 18 is `Server Block Type Registry Checksum`, a uint64 described as "Checksum for detecting mismatches in block types between server and client". Sending 0 disables the check, which is what every third-party implementation does.

### Vanilla is now data-driven too

From 1.26.50 the vanilla behavior pack itself defines 98 blocks in JSON rather than code, as counted in [bedrock-blocks-items-recipes-biomes-features.md](bedrock-blocks-items-recipes-biomes-features.md). Those blocks have to be declared in `Block Properties` like any other data-driven block. Geyser ships a captured NBT dump for exactly this, `bedrock/data_driven_blocks.<palette>.nbt`, gzip-compressed, loaded straight into `BlockPropertyData` entries, with the comment "TODO Make this throw once we drop any version below 26.50, as it's required in 26.50+" (`BlockRegistryPopulator.java:165-178`). A server that omits them on a 1.26.50 or later client is sending an incomplete block registry.

### What works with no resource pack

Everything in the block definition NBT that is not a texture or a model reference. A block registered through `Block Properties` alone gets:

- a working identifier for `/setblock`, `/fill` and `/give`
- collision and selection boxes, light emission and dampening, friction, mining time, map colour
- a display name, if `minecraft:display_name` carries a literal rather than a translation key, since an unresolved key renders as the key
- creative menu placement through `menu_category` plus a `CreativeContentPacket` entry
- placement traits and permutation switching

It does not get a texture. `minecraft:material_instances.texture` is a short name looked up in the client's `terrain_texture.json`, so without a pack it resolves to nothing and the block draws as the missing-texture checkerboard. Allay's fallback is honest about this: it defaults a custom block to `minecraft:geometry.full_block` with a single material instance whose texture is `"missing_texture"` (`Protocol.java:515-527`). The same applies to the geometry identifier: `minecraft:geometry.full_block` is built in, anything else must be in the pack's `models/`.

## 4. Custom items end to end

### The item JSON and resource pack

The item grammar and its 44 components are in [bedrock-blocks-items-recipes-biomes-features.md](bedrock-blocks-items-recipes-biomes-features.md) section 3. The resource pack side, from `docs:Documents/AddCustomItems`, is smaller than for blocks:

- `textures/items/<name>.png`
- an entry in `textures/item_texture.json` under `texture_data`, whose key is what `minecraft:icon.texture` references. The tutorial uses a namespaced key (`"demo:goo"`), which is allowed but not required.
- `texts/en_US.lang` with `item.<namespace>:<name>.name=<display name>` when `minecraft:display_name` is not used.
- `attachables/<name>.player.json` and `models/entity/<name>.geo.json` only when the item should render as a 3D model in hand. An attachable is a `minecraft:attachable` document with `identifier`, `item` (a map from item name to a Molang condition), `materials`, `textures`, `geometry`, `animations`, `scripts.animate` and `render_controllers`, and it reuses the entity rendering pipeline.

### ItemRegistryPacket

Packet id 162 (`0xa2`). It replaced the packet previously known as `ItemComponentPacket` at the same id; there is no separate item component packet in protocol 2238 (`json/MinecraftPacketIds.json`).

The payload is one array, `Item Data` (`json/ItemRegistryPacketPayload.json`), with a runtime constraint of "Verify that specified items exist". Each `ItemData` (`json/ItemData.json`) is:

| Field | Type | Meaning |
|---|---|---|
| `Item Name` | hashed string | The namespaced identifier |
| `Item Id` | int16 | "Block id's < 256 (can be negative); Item id's >= 257" |
| `Is Component Based` | boolean | True for a data-driven item |
| `Item Version` | int32 enum | `Legacy` 0, `DataDriven` 1, `None` 2 |
| `Item Component Data` | untyped | Network NBT |

A custom item is `Is Component Based: true` and `Item Version: DataDriven`. Both Geyser and Allay construct it as `new SimpleItemDefinition(identifier, runtimeId, ItemVersion.DATA_DRIVEN, true, components)` (`CustomItemRegistryPopulator.java:170`, `Protocol.java:354-359`).

The component NBT is a compound with a single `components` key. Inside it, documented-looking component names sit beside a flat `item_properties` compound that carries the client-only rendering and handling facts. Geyser writes these `item_properties` keys: `minecraft:icon` (`{textures: {default, dyed}}`), `creative_category` (int), `creative_group` (string), `allow_off_hand`, `hand_equipped`, `max_stack_size`, `damage`, `can_destroy_in_creative`, `foil`, `use_duration`, `use_animation`, `mining_speed`, `enchantable_slot`, `enchantable_value`, `frame_count`, `render_offsets`. Allay writes `max_stack_size`, `allow_off_hand`, `can_destroy_in_creative`, `minecraft:icon`, `wearable_slot`, `use_duration`, `use_animation`, `foil`, `hand_equipped` and `damage` (`Protocol.java:283-352`).

Alongside `item_properties`, the components compound takes `minecraft:display_name` (`{value}`), `item_tags` (a string list), `minecraft:durability`, `minecraft:wearable`, `minecraft:armor` (`{protection}`), `minecraft:food`, `minecraft:cooldown` (`{category, duration}`), `minecraft:render_offsets`, and in Geyser's case `minecraft:block_placer`, `minecraft:compostable`, `minecraft:digger`, `minecraft:dyeable`, `minecraft:enchantable`, `minecraft:entity_placer`, `minecraft:fuel`, `minecraft:glint`, `minecraft:kinetic_weapon`, `minecraft:piercing_weapon`, `minecraft:projectile`, `minecraft:repairable`, `minecraft:shooter`, `minecraft:swing_duration`, `minecraft:throwable`, `minecraft:use_modifiers`. Allay applies raw caller-supplied components last so they can replace anything derived.

Geyser adds a `geyser:is_custom` item tag to everything it registers "allowing Molang queries", which is a usable trick: `query.equipped_item_any_tag` and friends can then branch on it in a render controller.

### The creative menu

`CreativeContentPacket` (id 145) is separate from the item registry, and an item missing from it is only reachable through `/give`. The payload is `Groups` then `Entries` (`json/CreativeContentPacketPayload.json`).

A `CreativeGroupInfoPayload` is `Creative Category` (uint8, `Construction` 1, `Nature` 2, `Equipment` 3, `Items` 4, `ItemCommandOnly` 5), `Name` (a localized name, empty for an anonymous non-collapsing group) and `Group Icon Item`. A `CreativeItemEntryPayload` is `Creative Net Id`, `Item Instance` and `Group Index`, where `0xFFFFFFFF` (`CreativeItemRegistry::INVALID_INDEX`) means ungrouped.

The behavior pack's `item_catalog/crafting_item_catalog.json` is the authoring form of this and is described in [bedrock-blocks-items-recipes-biomes-features.md](bedrock-blocks-items-recipes-biomes-features.md) section 4; a block's or item's `menu_category` merges into it. A third-party server skips the catalog and builds `CreativeContentPacket` directly. Note the category enum mismatch: the JSON uses the names `construction`, `nature`, `equipment`, `items`, `none`, and the wire uses 1 through 5 with `ItemCommandOnly` in place of `none`.

`docs:Documents/TroubleshootingAddons` names the symptom of getting this wrong: "Item not in creative inventory. Symptom: Can only get item via commands."

### What works with no resource pack

Less than for blocks. The item registers, stacks, has a display name and durability, and can be given and dropped, but `minecraft:icon.texture` resolves against the client's `item_texture.json` and without a pack there is no icon. Geyser has one escape hatch: an item with a `block_placer` component set to use its block as the icon sends no `minecraft:icon` at all, "This makes bedrock use a 3D render of the block this item places as icon" (`CustomItemRegistryPopulator.java:463-472`). That is the only way to get a correct-looking custom item with no pack, and it only works for block items.

## 5. Custom entities

### Two files, two halves

An entity is split the same way a block is, but the split is sharper. The behavior pack's `entities/<name>.json` holds `minecraft:entity` with components, component groups and events, and drives nothing on the client. The resource pack's `entity/<name>.entity.json` holds `minecraft:client_entity` and drives everything the client draws.

The client entity description, from `docs:Reference/Content/EntityReference/Examples/ClientEntityDocumentation/ClientEntityDocumentationIntroduction` and the vanilla `resource_pack/entity/chicken.entity.json`:

| Key | Purpose |
|---|---|
| `identifier` | Must match the behavior pack identifier exactly, case-sensitive |
| `min_engine_version` | Selects among several definitions of the same identifier |
| `materials` | Named material aliases |
| `textures` | Named texture paths |
| `geometry` | Named model identifiers from `models/` |
| `animations` | Named animation identifiers from `animations/` |
| `animation_controllers` | Named controllers from `animation_controllers/` |
| `scripts` | `pre_animation` Molang statements, `animate` entries, `scale` |
| `particle_effects` | Named particles created when the entity spawns |
| `render_controllers` | The controllers that pick geometry, material and texture |
| `locators` | Model-space attachment points, for example `lead` |
| `spawn_egg` | Either `{texture, texture_index}` or `{base_color, overlay_color}` |
| `enable_attachables` | Whether armor and weapons render on it |
| `hide_armor`, `held_item_ignores_lighting` | Rendering switches |

A render controller is a separate document in `render_controllers/` whose entries pick one `geometry`, a list of `materials` keyed by bone glob, and a list of `textures`, each as a Molang-resolvable reference into the named sets. `resource_pack/render_controllers/chicken.render_controllers.json` is three lines of exactly that. The vanilla resource pack has 180 client entity files, 173 render controllers, 198 models, 143 animations, 73 animation controllers and 55 attachables.

bedrock-samples also carries a beta `minecraft:client_entity` successor at `metadata/json_schemas/client/entity/beta/AtomicClientEntityDocument.json`, with flat component storage and a single component so far, `minecraft:collision_box`. It is worth watching but is not usable today.

### What the network carries

`AddActorPacket` field 2 is `Actor Type`, a plain string (`json/AddActorPacketPayload.json`). There is no definition payload. The client looks the string up in the client entity definitions it has and, finding nothing, draws nothing.

`AvailableActorIdentifiersPacket` gives the client the id list as a compound of `ActorInfo` entries with `rid` (runtime id, int), `id` (string), `bid` (base id, string), `hasspawnegg` (bool) and `summonable` (bool) (`json/AvailableActorIdentifiersPacketPayload.json`). This is what makes `/summon` complete a custom id and what gives a spawn egg its entry. PowerNukkitX sends it straight from its entity registry (`src/main/java/org/powernukkitx/network/process/PlayerSessionHolder.java:851-855`).

`SyncActorPropertyPacket` carries entity property definitions as `{type: actor identifier hash, properties: <compound>}` for properties flagged for client sync, and `StartGamePacket` field 17 does the same for `minecraft:player` specifically.

### What a server can do for an entity the client cannot draw

Four options, in descending order of fidelity:

1. Ship a resource pack with a client entity definition. This is the only way to get a genuinely new-looking mob.
2. Reuse a vanilla identifier and change its appearance in a resource pack. This costs whatever is hardcoded against that identifier, which the docs warn about: "if the identifier (or runtime_identifier) of an entity is `minecraft:axolotl`, it can have additional behaviors built into Minecraft's code specifically for axolotls" (`docs:Documents/UniqueEntityBehaviors`). The cooperative add-on guidelines say flatly "You should not use `runtime_identifier` when creating new entities because as versions change, a mob's behavior can change significantly, potentially leading to frequent breaks."
3. Build the entity out of things the client already draws: an armor stand or player with equipment, a falling block with a custom block state, a text display. This is the static-entity trick that custom blocks were introduced to replace in 1.19.40.
4. Leave it invisible and give it a nameplate and a collision box. The entity still exists server-side for every purpose except rendering.

Note that `runtime_identifier` is behavior-pack-only, so option 2 on a third-party server means sending the vanilla identifier in `AddActorPacket` and doing the behavior yourself.

## 6. The Script API

### Where it runs

`@minecraft/server` is a set of native bindings inside Minecraft's own process, exposed to a JavaScript engine the game embeds. A behavior pack opts in with a module of `type: "script"`, `language: "javascript"` and `entry: "scripts/main.js"`, plus a `dependencies` entry naming `@minecraft/server` and a version (`docs:Documents/scripting/introduction`).

The host that runs them is whichever process owns the world: BDS, or the client hosting a local or Realms world. A third-party server is the host, so it would have to supply both the JavaScript engine and a complete reimplementation of the API. Nothing in the protocol lets the server hand a script to the client to run, and `ResourcePacksInfoPacket.Has Scripts` and `PackInfoData.Has Scripts` are only announcements that a pack contains client scripts, not a delivery channel for server logic.

### Size and shape of the API

bedrock-samples ships the full binding metadata at `metadata/script_modules/@minecraft/`. The scale is the point: `server-bindings_2.11.0-beta.json` is 1.88 MB of JSON, up from 12 KB at 1.0.0. There are 28 stable `@minecraft/server` versions from 1.0.0 to 2.10.0 plus 2.11.0-beta, and separate modules for `server-ui`, `server-admin`, `server-net`, `server-gametest`, `server-graphics`, `debug-utilities`, `diagnostics` and `common`.

`docs:Documents/scripting/versioning` maps module versions to game versions: `@minecraft/server` 1.0.0 is 1.19.70, 1.17.0 is 1.21.60, and the 2.x line started at 1.21.70 preview. Stable versions follow semver with the `^` rule, so a pack depending on 1.3.0 is satisfied by 1.8.0. Beta versions do not: "even minor version increments can include backwards-compatibility breaking changes", and using any `-beta` module requires the "Beta APIs" experiment.

### Custom components

Custom components are the one place where a pack author attaches behavior to a specific block or item. Version 1 lists component names in a `minecraft:custom_components` array on the block or item; the reference page now says "This type is now deprecated, and no longer in use in the latest versions of Minecraft" (`docs:Reference/Content/BlockReference/Examples/BlockComponents/minecraftBlock_custom_components`). Version 2 flattens them so a namespaced component name sits beside the vanilla components and can take parameters, and requires both "Beta APIs" and "Custom Components V2" (`docs:Documents/scripting/v2-overview`).

The event sets bound the whole feature. A block custom component can receive `beforeOnPlayerPlace`, `onBlockStateChange`, `onBreak`, `onEntity`, `onEntityFallOn`, `onNamedTick`, `onNeighborChanged`, `onPlace`, `onPlayerBreak`, `onPlayerInteract`, `onRandomTick`, `onRedstoneUpdate`, `onStepOff`, `onStepOn`, `onTick`. An item custom component can receive `onBeforeDurabilityDamage`, `onCompleteUse`, `onConsume`, `onHitEntity`, `onMineBlock`, `onUse`, `onUseOn`. That is 15 block hooks and 7 item hooks, and nothing else.

Registration happens in `system.beforeEvents.startup` through `initEvent.blockComponentRegistry.registerCustomComponent(name, component)`. In version 2 startup moved earlier so that components are registered before block JSON is parsed, which is also why the API is heavily restricted during that window.

### Is it worth imitating?

As an extension model for this project, the custom component shape is worth copying and the API itself is not. The shape is good: a named, namespaced, parameterized behavior attached from data to a specific block or item, with a fixed event set, registered before content loads. It maps cleanly onto the named block and item behavior families that [bedrock-blocks-items-recipes-biomes-features.md](bedrock-blocks-items-recipes-biomes-features.md) section 9 already proposes.

Adopting `@minecraft/server` wholesale is a different proposition. The binding metadata is approaching 2 MB per version, there are 29 versions to be compatible with, and compatibility is the whole value: a partial implementation runs nobody's existing pack. Endstone, which does have Mojang's implementation available because it loads into BDS, still does not expose custom block or item registration in its own API; `include/endstone/block/` is `block.h`, `block_data.h`, `block_face.h`, `block_state.h`, `block_type.h` and nothing more.

The one genuinely useful piece for this project is the versioning discipline: stable versus beta tracks, semver with the caret rule, and a published table mapping module version to game version.

## 7. Molang across the client and server line

[molang.md](molang.md) covers the language. What matters here is which side evaluates what for custom content.

bedrock-samples' `metadata/molang_modules/mojang-molang-queries.json` lists 318 queries and 61 math functions, each with `version_ranges` carrying a `query_sets` list. The sets are thin: 310 queries are in `default`, 6 in `world_gen` (`above_top_solid`, `heightmap`, `noise` and relatives), 2 in `tags`. The file does not say which side evaluates a query, so the division has to be read off the context each expression appears in.

The client evaluates:

- Render controller expressions: which geometry, material and texture a client entity uses this frame.
- Client entity `scripts.pre_animation`, `scripts.animate` and `scripts.scale`.
- Animation controller transitions and animation keyframe expressions.
- Attachable `description.item` conditions, for example `query.is_owner_identifier_any('minecraft:player')`.
- Particle emitter and particle lifetime expressions.
- `minecraft:geometry.bone_visibility` inside a custom block's network definition. Allay sends each one as `{expression: string, version: short}` so the client knows which Molang dialect to parse it with (`Protocol.java:630-637`).
- Block permutation `condition` expressions, since the permutations are in the network definition and the client has to pick the right components to draw.
- The three resource pack setting queries, which are explicitly client-only. `query.get_pack_setting`, `query.is_pack_setting_enabled` and `query.is_pack_setting_selected` all carry "Available on the Client (Resource Packs) only." in their descriptions.

The server evaluates:

- Entity filters and component conditions in behavior pack JSON.
- Feature and feature rule placement expressions, which use the `world_gen` query set.
- Item component expressions such as `repairable.repair_items[].repair_amount`.
- Block permutation conditions, to decide which components apply to the block it has placed.

Permutation conditions are therefore evaluated twice, once on each side, against two independently parsed copies of the same expression. That is the reason `molangVersion` is in the block definition NBT at all: the server has to tell the client which dialect it wrote the conditions in. `query.block_property` was renamed to `query.block_state` at `MolangVersion` 9, and the old name's `version_ranges` show `last_version: 1.20.10`.

For permutation conditions the docs restrict the vocabulary hard: "For permutation conditions you are limited to using one Molang query: `query.block_state()`" (`docs:Reference/Content/BlockReference/Examples/BlockStatesAndPermutations`). A server implementing custom blocks therefore needs a Molang evaluator that handles comparison, logical operators and `query.block_state` and nothing more, which is a far smaller job than the full language.

## 8. Limits, gating and failure modes

### Numbers

| Limit | Value | Source |
|---|---|---|
| Block permutations across all blocks in a world | 65536, warning and Marketplace rejection above | `docs:Reference/Content/BlockReference/Examples/BlockStatesAndPermutations` |
| Manifest `settings` entries | 50 | `metadata/.../packaging/3.0.0/Manifest.json` |
| Dropdown and multiselect options | 2 to 20 | `DropdownSetting.json`, `MultiSelectSetting.json` |
| Subpack `memory_performance_tier` | 0 to 5 | `Subpack.json` |
| Resource packs per `ResourcePacksInfoPacket` | 65535 | `ResourcePacksInfoPacketPayload.json` |
| Packs per `ResourcePackStackPacket` texture list | 65535 | `ResourcePackStackPacketPayload.json` |
| Pack folder names in a world template | 10 characters | `docs:Documents/CreateAWorldTemplate` |
| Add-on size for mobile | under 100 MB, advisory | `docs:Reference/Content/MCToolsValReference/packsize` PACKSIZE401 |
| Block light emission and dampening | 0 to 15, strictly enforced from 1.26.20 | `docs:Documents/Update1.26.20` |
| `material_instances.ambient_occlusion` | 0.0 to 10.0 float, default 1.0 | `docs:Documents/Update1.26.20` |
| Block entity dynamic properties | 1 KB per block entity | `docs:Documents/Update1.26.30` |
| Custom block render distance | half the configured distance for any render method other than `opaque` | `docs:Documents/CustomBlockRenderDistance` |
| `ActorDefinition.Event Name` | 256 characters | `json/ActorDefinition.json` |

### Experimental toggles

`docs:Documents/ExperimentalFeaturesToggle` was last revised for 1.21.80 and 1.21.90 preview, and lists for add-on creators: Custom Biomes, Upcoming Creator Features, Beta APIs, Custom Components V2, Experimental Creator Camera Features, Data-Driven Jigsaw Structures, Render Dragon Features for Creators. The page itself warns that "The Experiments toggle list is subject to frequent changes".

Custom blocks and items do not need an experiment today. Geometry and material instances left experimental in 1.19.40, which the release note frames as "custom blocks is now a non-experimental feature and will have backwards compatibility and support for Marketplace creators" (`docs:Documents/Update1.19.40`). Block states and permutations left in 1.19.70. `minecraft:chest_obstruction` left in 1.26.20 for `format_version` 1.26.20 and up. What still needs a toggle is Beta APIs for any `-beta` script module, Custom Components V2, and `minecraft:geometry.culling_shape`.

The experiment names on the wire are not the names in the UI. Allay sends `data_driven_items`, `upcoming_creator_features` and `experimental_molang_features` as always-enabled on every connection, plus `y_2025_drop_3` on newer protocols (`server/src/main/java/org/allaymc/server/network/protocol/v766/PacketEncoder_v766.java:3437-3439`, `v827/PacketEncoder_v827.java:36`). `data_driven_items` is the old "Holiday Creator Features" toggle.

### How Mojang has broken add-ons

Documented breaks, newest first:

- **1.26.20, tags.** "There is a breaking change to how tags are defined. As of version 1.26.20, tags cannot freely live as top level entities in the components array. They must live inside the `minecraft:tags` component", with values of the form `<namespace>:<tag_name>` and no `tag:` prefix (`docs:Documents/Update1.26.20`). Note that this is the JSON form only; the network form is still one empty compound per tag keyed `tag:<name>`.
- **1.26.20, block validation.** `menu_category.category` became required and an empty `group` became invalid. `placement_direction.y_rotation_offset` lost its 0.5 tolerance and must be a multiple of 90 in 0 to 360. `blocks_to_corner_with` now requires `minecraft:corner_and_cardinal_direction` among the enabled states. `minecraft:flower_pottable` became root-only. `ambient_occlusion` stopped accepting booleans.
- **1.26.20, entity friction.** `minecraft:friction_modifier` was corrected to match its documentation, which reverses its meaning. Mojang shipped `minecraft:uses_legacy_friction` and auto-applies it to any entity with a `format_version` below 1.26.20, which is the cleanest version-gated fix in the whole changelog set.
- **1.21.80, geometry.** `minecraft:geometry` and `minecraft:material_instances` must now both be present if either is.
- **1.21.20, custom components.** Block and item scripted events replaced "the block event scenarios that were originally part of Holiday Creator Features". The legacy `on_interact`, `on_fall_on`, `on_placed`, `on_player_destroyed`, `on_player_placing`, `on_step_off`, `on_step_on`, `queued_ticking` and `random_ticking` components are forbidden in the current block schema.
- **1.19.80, rotation.** `minecraft:transformation` replaced the block rotation component and `bone_visibility` replaced `part_visibility`.
- **1.19.70, block data values.** `data` was removed from `/clone`, `/execute`, `/fill`, `/setblock` and `/testforblock`, so `/setblock ~ ~ ~ minecraft:wool 1` stopped working in favour of `/setblock ~ ~ ~ minecraft:wool ["color":"orange"]`.

The pattern is that `format_version` on the individual file gates grammar changes and `min_engine_version` on the pack gates engine behavior, but neither has saved authors from validation tightening: the 1.26.20 changes apply to files written at `format_version` 1.26.20 and up, which means the fix is to leave the file at an older version and lose the new components.

### Silent failures

`docs:Documents/TroubleshootingAddons` catalogues what the client ignores rather than reports. The ones that matter for a server:

- A texture name with no `terrain_texture.json` or `item_texture.json` entry gives the checkerboard, not an error.
- An identifier that differs in case between the behavior pack and the resource pack gives an untextured entity, because the lookup simply misses.
- A file in a misspelled folder (`function` against `functions`, `entity` against `entities`) is not loaded and not reported.
- An item without `menu_category` is absent from the creative menu and reachable only by command.
- A non-power-of-two texture fails to atlas.

The content log is the only place most of these surface, and it is off by default.

## 9. Prior art

All of the following register custom blocks by hand-assembling the same NBT. Commits and licences:

| Project | Commit | Date | Licence |
|---|---|---|---|
| PowerNukkitX/PowerNukkitX | `37caa9e66690f2d327b33d8a72e7621377ab96c5` | 2026-10-24 | LGPL-3.0 |
| AllayMC/Allay | `f223a12164f2fe0b594a6b83d950307012f23c64` | 2026-10-24 | LGPL-3.0 |
| GeyserMC/Geyser | `dd1fab334b5591012e9f41d1e17f50297ec51a69` | 2026-10-23 | MIT |
| Sandertv/gophertunnel | `be557e33fe6f8d0c0db7ef05b5fd068725c325ad` | 2026-10-19 | MIT |
| df-mc/dragonfly | `1bf4e242c81f1f66ba6bdf8fcdcc80c70125a499` | | MIT |
| PrismarineJS/bedrock-protocol | `de199f0fe7ade6477c5637851ea814a65cffabe9` | | MIT |
| CloudburstMC/Nukkit | `b3caad67d86be34aeca3937e64e8176f6760a2d4` | | GPL-3.0 |
| pmmp/PocketMine-MP | `6a7cc02e9dff59b69241aa0bcffdb9903ce86beb` | | LGPL-3.0 |
| ViaVersionAddons/ViaBedrock | `480073274658835246280ce89f5fa7f3cfdb2a16` | | GPL-3.0 |
| Muqsit/RPEncrypter | `300c61ff85ff7af4065b70b59262d2e1f5900845` | | see repository |
| CloudburstMC/Protocol | HEAD | | Apache-2.0 |
| EndstoneMC/endstone | HEAD | | Apache-2.0 |
| LiteLDev/LeviLamina | HEAD | | LGPL-3.0 |

Licences come from `gh api repos/<owner>/<repo> --jq .license.spdx_id`. Only the MIT and Apache-2.0 projects are safely copyable into this repository, which rules out lifting code from PowerNukkitX, Allay, PocketMine or ViaBedrock; their NBT field names and header offsets are facts about Mojang's formats rather than expression, so reading them to learn the format is fine.

### PowerNukkitX

`CustomBlockDefinition.Builder` assembles the NBT directly (`src/main/java/org/powernukkitx/block/customblock/CustomBlockDefinition.java`). The builder starts with `{components: {}}`, adds a default geometry, `menu_category`, `molangVersion: 9`, a `properties` list and `vanilla_block_data`. Block ids are allocated from 10000 in a static `AtomicInteger`. `toNetwork()` returns a Cloudburst `ServerBlockProperty(identifier, nbt.toNetwork())`. `customBuild(Consumer<CompoundTag>)` lets a plugin edit the compound before building, which is an admission that the builder does not cover everything the client accepts.

The reverse-engineering admission is in the `vanilla_block_data` line: `.putString("material", "dirt") // No one knows what it's for, but it's required for making the blocks work`.

`HashUtils` credits its source with a comment pointing at a gist: `//https://gist.github.com/Alemiz112/504d0f79feac7ef57eda174b668dd345` above the FNV constants.

Items go through `CustomItemDefinition` (1964 lines) and reach the client in a single `ItemRegistryPacket` built from a cached registry (`src/main/java/org/powernukkitx/network/process/PlayerSessionHolder.java:846-849`). `AvailableActorIdentifiersPacket` and `CreativeContentPacket` are built the same way, from registries, and all three are pre-encoded once at startup.

PowerNukkitX does not generate a resource pack. `CustomItemDefinition.texture()` carries the note "this texture must be defined on Resource Pack/Client Side", and that is the whole story: the operator supplies the pack.

### Allay

`server/src/main/java/org/allaymc/server/network/protocol/Protocol.java` is the most complete encoder of the three. It builds one permutation per block state rather than per author-written permutation, with a condition generated from the state values, and attaches server-derived physics to each: collision box, selection box, light emission, light dampening, inverted friction, and `destructible_by_mining` pinned to `Float.MAX_VALUE` because the server owns mining time. Block tags become `tag:<name>` empty compounds inside each permutation's components.

It encodes `uv_lock` as either a boolean or a bone list "because the client accepts either", and documents the legacy single-box collision encoding separately for older protocols, which is a useful record of how the format changed.

Allay's `PackEncryptor` is the reference implementation of pack encryption described in section 2. Its `docs/advanced/custom-block-api.md` shows the plugin-facing shape: a `CustomBlockStateDefinition` per state built by a function over the block's properties, resolved once at registration rather than per packet.

### Geyser

Geyser is the instructive one because it has to map Java Edition content onto a Bedrock client that was never told about it. `CustomBlockRegistryPopulator.java` (620 lines) and `CustomItemRegistryPopulator.java` (863 lines) carry the most candid comments:

- `// this is required or the client will crash` on `menu_category`
- `// meaning of this version is unknown, but it's required for tags to work and should probably be checked periodically` on `molangVersion: 1`, and again on `tags_version: 6` inside a placement filter's block filter
- `// Bedrock stopped accepting a byte here in 1.26.20; it must be a float` on `ambient_occlusion`
- `// todo this is actually an bitset, we should add the other properties some day` on `packed_bools`
- `// allowed_faces on the network is represented by 6 bits for the 6 possible faces`
- `// place_air is not an actual component / We just apply a dummy event to prevent the client from trying to place a block / This mitigates the issue with the client sometimes double placing blocks`, which sends `minecraft:on_player_placing` with `triggerType: "geyser:place_event"` purely as a no-op

Geyser does not generate a resource pack either; its custom block and item features require the server operator to ship one whose texture names match the mappings. It does ship the captured vanilla data-driven block definitions as `bedrock/data_driven_blocks.<palette>.nbt`, which is the single most reusable artifact in the set for this project, and it is MIT.

### gophertunnel and Dragonfly

gophertunnel owns the transport, not the content. `minecraft/resource/pack.go` and `manifest.go` model a pack: read from a path or a URL, compile a directory into a temporary zip, SHA-256 it, count chunks, carry an optional content key. Its `Manifest` struct is a reduced version of the real schema, with only `name`, `description`, `uuid`, `version`, `min_engine_version` in the header and no `settings`, `subpacks` or `capabilities` objects beyond a `Capability` string type documenting just `experimental_custom_ui` and `chemistry`.

`minecraft/resource_pack_delivery.go` is where the two operational numbers live: `DefaultResourcePackChunkSize = 1024 * 128` and `DefaultResourcePackChunkSendDelay = 200 * time.Millisecond`. It also carries a `protocol.PackURL` struct documenting that "the manifest cannot be in the root of the zip file", which no current packet references.

Dragonfly is the one project that generates a resource pack server-side rather than asking the operator for one. `server/internal/packbuilder/resource_pack.go:18-50` builds a pack from the server's registered custom blocks and items and derives the pack UUID from `dirhash.HashDir`, so the UUID changes exactly when the content does and the client re-downloads only then. That is the trick this project would want if it ever auto-generates a pack from its own block registry. Everything else about pack transport Dragonfly delegates to gophertunnel; it has no resource pack code of its own. Its config exposes `Resources []*resource.Pack` and `ResourcesRequired bool`, defaults the folder to `resources/` and loads every file in it with `resource.ReadPath` regardless of extension.

### Endstone and LeviLamina

Both load into Mojang's own BDS, so neither needs to reverse engineer anything. Endstone's README positions itself against the add-on system rather than extending it: "Bedrock's official addon and script APIs let you add content, but can hardly modify core gameplay." Its public API has no custom block or item registration at all. LeviLamina is a mod loader with the same relationship to BDS. Neither is a source of protocol knowledge, and LeviLamina's LGPL-3.0 licence rules out copying anyway.

### PrismarineJS/bedrock-protocol

The closest project to this one in language and scope implements no pack transfer at all. Its client replies to `resource_packs_info` and `resource_pack_stack` with an empty id list and a `completed` response, and there is no handler for `resource_pack_data_info`, `resource_pack_chunk_request` or `resource_pack_chunk_data` anywhere in the tree. The packets serialize, because the schemas come from `minecraft-data`, but nothing uses them. This repository is in the same position today.

## 10. What a third-party server cannot do

Rendering is not the gap. Everything the client draws comes from the resource pack plus the block and item registration packets, and all three of those are reproducible. The gaps are everywhere the Mojang engine is the authority.

- **Run behavior pack scripts.** `@minecraft/server` is native code inside Mojang's process. A third-party server can implement the API but cannot load the module, so no existing scripted add-on runs unmodified.
- **Run behavior pack JSON at all.** BDS reads `entities/`, `blocks/`, `items/`, `loot_tables/`, `recipes/`, `spawn_rules/`, `features/` and executes them. A third-party server gets no benefit from the behavior half of an add-on unless it reimplements every component in it. [bedrock-blocks-items-recipes-biomes-features.md](bedrock-blocks-items-recipes-biomes-features.md) section 9 sizes that at roughly 25 block components, 30 item components and about 90 named behavior families.
- **Serve Marketplace packs.** `Content Identity` and `Is Premium Pack` depend on Mojang's entitlement service. A third-party server has no way to grant an entitlement, so a premium pack stays locked.
- **Use the pack optimizer.** `__brarchive` baking is a BDS command-line mode, and the format is undocumented outside the binary.
- **Add engine behavior to a vanilla identifier.** `runtime_identifier` works because the engine has a class behind each identifier. A third-party server that sends a vanilla identifier gets the client's rendering and has to write the behavior itself.
- **Change gameplay the client predicts without reimplementing the prediction.** This is not add-on-specific, but it is why a wrong `minecraft:friction` value on a custom block is visible as rubber-banding rather than as a slightly different slide.

Against that, there are things a third-party server can do that BDS with add-ons cannot: send a different block registry, item registry and pack list to each connecting player, choose the pack URL and the subpack per connection, and change any of it between connections without touching the world. All of it is still bounded by the same client rule Geyser documents, that "Bedrock edition only allows removing and adding packs when connecting initially", so none of it can change for a player already in the world.

For this project specifically, the shortest path to "the Bedrock niceties" is: implement `ResourcePacksInfoPacket` through `ResourcePackStackPacket` with chunked delivery at 128 or 256 KiB, pacing the writes or keeping one chunk in flight, and bounding the download with a timeout of the server's own since the protocol has none; add a `Block Properties` writer that emits the network component NBT from this project's own block model; add `ItemRegistryPacket` with `item_properties`; and ship Geyser's MIT-licensed vanilla data-driven block dump or regenerate an equivalent from a BDS capture. Custom entities need a resource pack and nothing else from the server beyond `AvailableActorIdentifiersPacket`. Dragonfly's content-hash pack UUID is the right design for generating that pack from the block registry rather than asking the operator for one.

## Open questions

- Is `vanilla_block_data.material` still required in 1.26? PowerNukkitX sends `"dirt"` and Allay omits it; both claim to work. Testing against a real 1.26.51 client would settle it.
- What does `molangVersion` actually change in the client's parse? Geyser and Allay send 1 and PowerNukkitX sends 9, apparently with the same result. The `MolangVersion` enum suggests 9 is the first version where `query.block_state` is not an alias, so 1 may work only because the alias still resolves.
- What are the remaining two bits of `packed_bools` in a material instance? Allay names face dimming, random UV rotation and texture variation; Geyser writes only face dimming. The vanilla `blocks.json` has `isotropic` and `ambient_occlusion_exponent` as separate fields, so the mapping is not one to one.
- What exactly fails when chunks arrive too fast? Four projects observed the client going unresponsive and fixed it four ways, but nobody has characterised the failure. Is it RakNet ACK starvation, a client-side decode queue, or a batch size limit? Measuring it against 1.26.51 with varying chunk size and spacing would turn four heuristics into one number.
- Does the client enforce a maximum pack size? Nothing documents one, the fields are uint64, and the largest reported working pack is about 110 MB encrypted (PowerNukkitX PR #1997). The answer matters because a pack carrying textures for a few hundred custom blocks passes 100 MB easily.
- What is the exact wire list of experiment toggles in 1.26.51, and which of them a third-party server must assert for custom blocks to load? Allay's three names predate 1.26 and were not re-derived here.
- Does `ResourcePacksReadyForValidationPacket` expect any server response, and what does the client validate? The packet has no fields and this repository's handler only logs it.
- Is the `minecraft:client_entity` successor at `metadata/json_schemas/client/entity/beta/` going to replace render controllers, and on what timeline?
- Can a custom block carry a `block_entity` with dynamic properties on a third-party server, given that the 1 KB storage and the `minecraft:dynamic_properties` component are script-API concepts?

## Reproduction

All downloads go into their own empty directory and are treated as untrusted. Python runs with `-I`.

```bash
# Mojang sources
mkdir -p /tmp/addon-research && cd /tmp/addon-research
git clone --depth 1 https://github.com/Mojang/bedrock-samples.git bedrock-samples
git -C bedrock-samples log -1 --format='%H %ad'   # 46ba6ea985fb5a92d79a9419198f10dda14c199d, tag v1.26.50.4

mkdir -p /tmp/addon-research2 && cd /tmp/addon-research2
git clone --depth 1 --filter=blob:none https://github.com/MicrosoftDocs/minecraft-creator.git creator-docs
git -C creator-docs log -1 --format='%H %ad'      # 4432fb62a8e0ce5c785bd2bf02a6f981dcffbbe8

mkdir -p /tmp/addon-research3 && cd /tmp/addon-research3
git clone --depth 1 https://github.com/Mojang/bedrock-protocol-docs.git protocol-docs
git -C protocol-docs log -1 --format='%H %ad'     # 4fbe153e04e56645addc681259e398b94c60d14f
```

Manifest schema:

```bash
cd /tmp/addon-research/bedrock-samples/metadata/json_schemas/client_server/packaging/3.0.0
for f in Manifest Header Module Metadata PackDependency NativeModuleDependency Subpack \
         SemVersion UUID VersionSelectType SettingType LabelSetting SliderSetting \
         ToggleSetting DropdownSetting MultiSelectSetting DropdownOption; do
  echo "### $f"; cat "$f.json"
done
```

Protocol schemas for pack delivery and registration:

```bash
cd /tmp/addon-research3/protocol-docs/json
for f in ResourcePacksInfoPacketPayload ResourcePackStackPacketPayload \
         ResourcePackDataInfoPacketPayload ResourcePackChunkRequestPacketPayload \
         ResourcePackChunkDataPacketPayload ResourcePackClientResponsePacketPayload \
         ResourcePackResponse PackInfoData PackIdVersion PackInstanceId PackType \
         Experiments ExperimentToggle ItemRegistryPacketPayload ItemData ItemVersion \
         ServerBlockProperty MolangVersion CreativeContentPacketPayload \
         CreativeGroupInfoPayload CreativeItemEntryPayload CreativeItemCategory \
         AvailableActorIdentifiersPacketPayload AddActorPacketPayload ActorDefinition; do
  echo "### $f"; cat "$f.json"
done

python3 -I -c "
import json
d=json.load(open('MinecraftPacketIds.json'))
for n,v in zip(d['enum'], d['x-enum-binary-value']):
    if 'Resource' in n or 'Item' in n or 'StartGame' in n or 'Creative' in n:
        print(f'{v:>4} 0x{v:02x} {n}')
"

python3 -I -c "
import json
d=json.load(open('StartGamePacketPayload.json'))
for k,v in sorted(d['properties'].items(), key=lambda kv: kv[1].get('x-ordinal-index',99)):
    print(v.get('x-ordinal-index'), k, v.get('type') or v.get('\$ref'))
"
```

Molang query sets and the client-only queries:

```bash
cd /tmp/addon-research/bedrock-samples/metadata/molang_modules
python3 -I -c "
import json, collections
d = json.load(open('mojang-molang-queries.json'))
print('queries', len(d['queries']), 'math', len(d['math_functions']))
c = collections.Counter()
for e in d['queries']:
    for vr in e['version_ranges']:
        for s in vr.get('query_sets') or []:
            c[s] += 1
print(c.most_common())
for e in d['queries']:
    if 'pack_setting' in e['name'] or e['name'] in ('query.block_state','query.block_property'):
        print(json.dumps(e))
"
```

Vanilla resource pack scale:

```bash
cd /tmp/addon-research/bedrock-samples
du -sh behavior_pack resource_pack
find resource_pack -type f | wc -l
find behavior_pack -type f | wc -l
for d in entity render_controllers attachables models particles animations animation_controllers; do
  printf '%-24s %s\n' "$d" "$(find resource_pack/$d -type f -name '*.json' | wc -l)"
done
python3 -I -c "
import json, re
def load(p):
    return json.loads(re.sub(r'^\s*//.*\$', '', open(p, encoding='utf-8').read(), flags=re.M))
d = load('resource_pack/blocks.json')
keys = [k for k in d if k != 'format_version']
import collections
c = collections.Counter()
for k in keys:
    if isinstance(d[k], dict):
        c.update(d[k].keys())
print(len(keys), d['format_version'], c.most_common())
for f in ('resource_pack/textures/terrain_texture.json', 'resource_pack/textures/item_texture.json'):
    print(f, len(load(f)['texture_data']))
"
```

Prior art:

```bash
mkdir -p /tmp/prior-art-mine && cd /tmp/prior-art-mine
git clone --depth 1 https://github.com/PowerNukkitX/PowerNukkitX.git pnx
git clone --depth 1 https://github.com/AllayMC/Allay.git allay
git clone --depth 1 --filter=blob:none --sparse https://github.com/GeyserMC/Geyser.git geyser
git -C geyser sparse-checkout set core/src/main/java/org/geysermc/geyser/registry/populator api
for r in pnx allay geyser; do git -C $r log -1 --format="$r %H %ad"; done

sed -n '180,220p;686,715p' pnx/src/main/java/org/powernukkitx/block/customblock/CustomBlockDefinition.java
sed -n '20,145p'          pnx/src/main/java/org/powernukkitx/utils/HashUtils.java
sed -n '30,80p'           pnx/src/main/java/org/powernukkitx/network/process/handler/ResourcePackClientResponseHandler.java
grep -n 'maxChunkSize'    pnx/src/main/java/org/powernukkitx/resourcepacks/ResourcePackManager.java

sed -n '505,900p'         allay/server/src/main/java/org/allaymc/server/network/protocol/Protocol.java
sed -n '195,260p'         allay/server/src/main/java/org/allaymc/server/pack/PackEncryptor.java
grep -n 'ExperimentData(' -r allay/server/src/main --include='*.java'

sed -n '330,620p'         geyser/core/src/main/java/org/geysermc/geyser/registry/populator/CustomBlockRegistryPopulator.java
sed -n '155,200p;455,500p' geyser/core/src/main/java/org/geysermc/geyser/registry/populator/BlockRegistryPopulator.java

for r in EndstoneMC/endstone LiteLDev/LeviLamina CloudburstMC/Protocol df-mc/dragonfly \
         Sandertv/gophertunnel AllayMC/Allay PowerNukkitX/PowerNukkitX GeyserMC/Geyser; do
  printf '%-28s ' "$r"; gh api repos/$r --jq '.license.spdx_id'
done
```

gophertunnel pack delivery constants:

```bash
mkdir -p /tmp/gt && cd /tmp/gt
GT=be557e33fe6f8d0c0db7ef05b5fd068725c325ad
for f in minecraft/resource_pack_delivery.go minecraft/resource/pack.go minecraft/resource/manifest.go; do
  echo "### $f"
  curl -sS -A "Mozilla/5.0" "https://raw.githubusercontent.com/Sandertv/gophertunnel/$GT/$f"
done
```

Pack delivery across the other implementations:

```bash
mkdir -p /tmp/pack-delivery && cd /tmp/pack-delivery
git clone --depth 1 https://github.com/df-mc/dragonfly.git dragonfly
git clone --depth 1 https://github.com/PrismarineJS/bedrock-protocol.git bedrock-protocol
git clone --depth 1 https://github.com/CloudburstMC/Nukkit.git nukkit
git clone --depth 1 https://github.com/pmmp/PocketMine-MP.git pmmp
git clone --depth 1 https://github.com/ViaVersionAddons/ViaBedrock.git viabedrock
for r in dragonfly bedrock-protocol nukkit pmmp viabedrock; do git -C $r log -1 --format="$r %H %ad"; done

grep -n 'RESOURCE_PACK_CHUNK_SIZE'       nukkit/src/main/java/cn/nukkit/Player.java
grep -n 'MAX_CONCURRENT_CHUNK_REQUESTS'  pmmp/src/network/mcpe/handler/ResourcePacksPacketHandler.php
grep -rn 'CHUNK_SIZE'                    geyser/core/src/main/java/org/geysermc/geyser/pack/GeyserResourcePack.java
sed -n '18,50p'                          dragonfly/server/internal/packbuilder/resource_pack.go
sed -n '44,146p'                         viabedrock/src/main/java/net/raphimc/viabedrock/api/resourcepack/ResourcePack.java
curl -sS -A "Mozilla/5.0" \
  "https://raw.githubusercontent.com/Muqsit/RPEncrypter/300c61ff85ff7af4065b70b59262d2e1f5900845/ResourcePackEncrypter.php" \
  -o /tmp/pack-delivery/ResourcePackEncrypter.php
```

The pull requests cited for chunk pacing:

- https://github.com/PowerNukkitX/PowerNukkitX/pull/1997
- https://github.com/Sandertv/gophertunnel/pull/446
- https://github.com/Sandertv/gophertunnel/pull/482
- https://github.com/GeyserMC/Geyser/pull/6453
- https://github.com/GeyserMC/Geyser/pull/6754
- https://geysermc.org/wiki/geyser/packs/

Creator documentation pages cited, under `/tmp/addon-research2/creator-docs/creator/`:

- `Reference/Content/AddonsReference/PackManifest.md`
- `Reference/Content/BlockReference/Examples/BlockStatesAndPermutations.md`
- `Reference/Content/BlockReference/Examples/BlocksJsonFileStructure.md`
- `Reference/Content/BlockReference/Examples/BlockComponents/minecraftBlock_geometry.md`
- `Reference/Content/BlockReference/Examples/BlockComponents/minecraftBlock_custom_components.md`
- `Reference/Content/EntityReference/Examples/ClientEntityDocumentation/ClientEntityDocumentationIntroduction.md`
- `Reference/Content/MCToolsValReference/packsize.md`, `caddonreq.md`
- `Documents/MinecraftFileExtensions.md`, `ComprehensivePackContents.md`, `CreateAWorldTemplate.md`, `BuildingSubpacks.md`
- `Documents/AddOns/CustomPackSettings.md`
- `Documents/AddCustomDieBlock.md`, `AdvancedCustomBlocks.md`, `CustomBlockRenderDistance.md`, `AddCustomItems.md`
- `Documents/ExperimentalFeaturesToggle.md`, `TroubleshootingAddons.md`
- `Documents/scripting/introduction.md`, `versioning.md`, `v2-overview.md`, `custom-components.md`
- `Documents/BedrockServer/getting-started.md`, `server-properties.md`, `pack-optimization.md`
- `content/forms/world/world_packs.form.json`, `Reference/Content/MCToolsValReference/wpackrefs.md`
- `Documents/Update1.19.40.md`, `Update1.19.70.md`, `Update1.19.80.md`, `Update1.21.20.md`, `Update1.26.20.md`, `Update1.26.30.md`

This repository's own files referenced: `packages/protocol/src/packet/ResourcePacksInfoPacket.ts`, `packages/protocol/src/packet/ResourcePackStackPacket.ts`, `packages/protocol/src/packet/StartGamePacket.ts`, `packages/prismarine/src/network/packet/ResourcePackDataInfoPacket.ts`, `packages/prismarine/src/network/handler/ResourcePackChunkRequestHandler.ts`, `packages/prismarine/src/network/handler/ResourcePacksReadyForValidationHandler.ts`, `packages/prismarine/src/block/state/BlockRuntimeIds.ts`, `packages/minecraft/datagen/README-palette.md`.
