# What can a server convert from a Bedrock resource pack for a vanilla Java client?

Researched 2026-11-27 against the Java Edition 26.3 client jar (`client.jar`, SHA-1 `e877b6a07acd633fb3bb475002175cec036e7b87`, from the 26.3 version manifest), read with `javap` since 26.x jars ship unobfuscated; the 26.3 asset index `34` (SHA-1 `f3df28b441565ca4e5deb9cda856d90df62e1433`); this repository's generated 26.3 tables under `packages/protocol/src/java/versions/26.3/`; Mojang/bedrock-samples at tag `v1.26.60.5` (archive `15701fa9c13923f12662984c32c124327e40e3d3`); MicrosoftDocs/minecraft-creator at commit `80b7b1713df821debb4a8022e32e6b0ad840a273`; and the source of ViaBedrock, CubeConverter, GeyserMC PackConverter, GeyserMC Rainbow, Kas-tle java2bedrock.sh, Patbox Polymer, PaperMC Paper, PaperMC Velocity and 3vorp convert-pack at the commits in section 7. The prefix `docs:` names a file under `creator/Documents/` in the minecraft-creator repository. It builds on [bedrock-addons-and-custom-content.md](bedrock-addons-and-custom-content.md) (Bedrock pack containers, delivery and custom content registration) and [java-to-bedrock-translation.md](java-to-bedrock-translation.md) (the reverse direction's state mapping) and does not repeat them. Minecraft Wiki content is not used. Nothing here is legal advice.

Version facts verified from primary sources, not memory: the current Java release is 26.3 and the current snapshot is 26.4-pre-1 (`https://launchermeta.mojang.com/mc/game/version_manifest_v2.json`, read 2026-11-27). The 26.3 jar's `version.json` says protocol 777, resource pack format 97.1 (`resource_major` 97, `resource_minor` 1) and data pack format 121.0. The 26.4-pre-1 server jar's `version.json` says resource pack format 104.0, so the number moves with each release.

## Summary

1. Java delivery is one packet per pack: `resource_pack_push` (configuration id 9, play id 82 in 26.3) carries a UUID, an `http` or `https` URL, a SHA-1 hash of at most 40 characters, a `required` boolean and an optional prompt component. The client answers with `resource_pack` (configuration id 6, play id 50) carrying the UUID and one of eight actions, of which `ACCEPTED` and `DOWNLOADED` are the only non-terminal ones. Packs are keyed by UUID, so a server can push several, and `resource_pack_pop` removes one by UUID or all of them.
2. The client downloads with its own HTTP client, caps a pack at 262144000 bytes (250 MiB), and sends `X-Minecraft-Username`, `X-Minecraft-UUID`, `X-Minecraft-Version`, `X-Minecraft-Version-ID` and `X-Minecraft-Pack-Format` with the request. It reuses a cached file whose SHA-1 matches the pushed hash and skips the download.
3. There is no in-protocol transfer, so the server must answer HTTP somewhere. It does not need a second port: Polymer's AutoHost sniffs the first bytes of each TCP connection on the game port and switches the pipeline to an HTTP server for requests under `/eu.pb4.polymer.autohost/`, building the URL from the host name and port the client put in its handshake. ViaBedrock runs a separate Netty HTTP server. Vanilla, Paper and Velocity only push URLs and host nothing.
4. A 26.3 pack declares `pack.min_format` and `pack.max_format`; `pack.pack_format` is needed only when the supported range reaches back to format 64 or below, the last resource pack format before minor versions. Overlays live under `overlays.entries`, each with a `directory` and a format range.
5. Java 26.3's renderable custom content comes from item stacks and display entities, not from new blocks, items or entities: the block, item, entity type, sound event and particle type registries are not among the 32 registries the server sends during configuration, so a vanilla client cannot learn a new one. What a server can vary per stack is `minecraft:item_model` (any `assets/<ns>/items/<path>.json`), `minecraft:custom_model_data` (lists of floats, flags, strings and colors), `minecraft:equippable`, `minecraft:item_name` and the rest of the data components.
6. Most Bedrock resource pack content has a direct or lossy Java equivalent: textures (TGA must become PNG), flipbooks (to `.mcmeta`), item icons (to item models), `.lang` (to `.json`, keeping Bedrock's keys), OGG sounds and `sound_definitions.json` (to `sounds.json`), glyph sheets (to bitmap font providers) and `pack_icon.png`. Entity geometry converts to item models shown on `item_display` entities, which ViaBedrock already does, but Bedrock's Molang animations, animation controllers and render controllers do not run on Java. Particles, JSON UI, scripts and Bedrock materials have no Java equivalent.
7. Custom blocks have no Java form. The working technique, used by Polymer, is to give each custom block an unused vanilla block state whose model the pack replaces: all 1350 `minecraft:note_block` states share one model in the vanilla blockstate file, so 1349 of them can carry custom full-cube models. The client then predicts collision, sounds and mining from the vanilla block, so the server has to override mining with the `minecraft:block_break_speed` attribute and drive the break animation itself, and has to silence and replace the vanilla block's sounds in the pack.
8. ViaBedrock is the only maintained Bedrock-to-Java resource pack converter found, and it is narrow: four rewriters (glyph sheets, custom item textures, attachables, custom entities), custom blocks fall back to a placeholder state, translations stay server-side, custom sounds are not converted, and it converts on every download with an empty hash. It is GPL-3.0, as is the geometry library it uses (CubeConverter). Neither can be vendored into an `MIT OR MPL-2.0` package.
9. The reverse-direction projects supply the reusable data: GeyserMC PackConverter (MIT) has a 2060-entry Java-to-Bedrock texture name table and a 592-entry sound path table that invert into a Bedrock-to-Java table, plus per-texture transformers for the atlas-shaped textures. Rainbow (LGPL-3.0-or-later), java2bedrock.sh (AGPL-3.0), Polymer (LGPL-3.0) and convert-pack (AGPL-3.0) are reference reading only.
10. A converted pack's bytes depend on the Bedrock pack bytes, the whole stack's order (short names resolve across the stack), the target Java pack format, the converter's version and the server's assignment of block states and model keys. Real addon resource packs in this repository's addon corpus run from 0.01 MB to 19.4 MB, far under the client's 250 MiB cap. A deterministic zip, which `@jsprismarine/packs/zip` already writes, gives a stable SHA-1, which is what lets returning clients skip the download.

## 1. Delivering a pack to a Java client

### The packets

`packages/protocol/src/java/versions/26.3/packets.ts` gives the 26.3 ids: clientbound `resource_pack_pop` 8 and `resource_pack_push` 9 and serverbound `resource_pack` 6 in the configuration phase, and clientbound `resource_pack_pop` 81 and `resource_pack_push` 82 and serverbound `resource_pack` 50 in play. The classes are in `net.minecraft.network.protocol.common`, which both phases share.

`ClientboundResourcePackPushPacket` is a record of five fields, encoded in this order by its `STREAM_CODEC`:

| Field | Type | Codec |
|---|---|---|
| `id` | `UUID` | `UUIDUtil.STREAM_CODEC` |
| `url` | `String` | `ByteBufCodecs.STRING_UTF8` |
| `hash` | `String` | `ByteBufCodecs.stringUtf8(40)` |
| `required` | `boolean` | `ByteBufCodecs.BOOL` |
| `prompt` | `Optional<Component>` | `ComponentSerialization.TRUSTED_CONTEXT_FREE_STREAM_CODEC`, wrapped optional |

The constructor throws `IllegalArgumentException` when `hash` is longer than `MAX_HASH_LENGTH` (40).

`ClientboundResourcePackPopPacket` carries one `Optional<UUID>`. The client's `ClientCommonPacketListenerImpl.handleResourcePackPop` calls `DownloadedPackSource.popPack(uuid)` when it is present and `DownloadedPackSource.popAll()` when it is not.

`ServerboundResourcePackPacket` writes the UUID and then the action with `FriendlyByteBuf.writeEnum`, so the action is the enum ordinal as a VarInt. The `ServerboundResourcePackPacket$Action` constants, in ordinal order:

| Ordinal | Action | Terminal |
|---|---|---|
| 0 | `SUCCESSFULLY_LOADED` | yes |
| 1 | `DECLINED` | yes |
| 2 | `FAILED_DOWNLOAD` | yes |
| 3 | `ACCEPTED` | no |
| 4 | `DOWNLOADED` | no |
| 5 | `INVALID_URL` | yes |
| 6 | `FAILED_RELOAD` | yes |
| 7 | `DISCARDED` | yes |

`isTerminal()` returns false for exactly `ACCEPTED` and `DOWNLOADED`.

### What the client does with a push

`ClientCommonPacketListenerImpl.handleResourcePackPush` parses the URL with `parseResourcePackUrl`, which builds a `java.net.URL` and accepts it only when `getProtocol()` is `http` or `https`. Any other URL gets an immediate `resource_pack` answer with `INVALID_URL`. Otherwise it checks the server entry's `ServerData.ServerPackStatus` (the player's per-server "Server Resource Packs" setting), shows the `multiplayer.texturePrompt.serverPrompt` screen built by `addOrUpdatePackPrompt` with the `required` flag and the prompt when it has to ask, and hands the pack to `DownloadedPackSource.pushPack(UUID, URL, String)`.

`DownloadedPackSource.pushPack` passes the hash through `tryParseSha1Hash`, which matches it against `^[a-fA-F0-9]{40}$`, so an empty or malformed hash becomes a null `HashCode` and the download is not checked. `ServerPackManager` keeps every pushed pack by UUID and has `pushPack`, `pushLocalPack`, `popPack` and `popAll`, so several packs can be live at once.

The download goes through `DownloadQueue.downloadBatch` with a `BatchConfig` built in `DownloadedPackSource$4`: SHA-1 hashing, a maximum size of 262144000 bytes, and these headers from `createDownloadHeaders`:

- `X-Minecraft-Username`: the player's name.
- `X-Minecraft-UUID`: the profile UUID without dashes (`UndashedUuid.toString`).
- `X-Minecraft-Version` and `X-Minecraft-Version-ID`: `WorldVersion.name()` and `WorldVersion.id()`.
- `X-Minecraft-Pack-Format`: the client's resource pack format.
- `User-Agent`: built from `WorldVersion.name()`.

`HttpUtil.downloadFile` opens the URL through a `HttpURLConnection` with the configured proxy, reads `getContentLengthLong()` and refuses a declared length above the maximum, counts bytes as it copies so an undeclared length is also capped, logs `HTTP response error` with the body on an error response, and writes to a temporary file before moving it. Before downloading it checks the cache: "Returning cached file since actual hash matches requested" is the path taken when a file with the requested SHA-1 is already on disk. `DownloadQueue` keeps its files under a `download-queue` directory with a `log.json`; the jar also has a `DownloadCacheCleaner`, whose policy this research did not read. Loaded packs get the id `server/%08X/%s` (a serial number and the UUID).

The `X-Minecraft-Pack-Format` header lets one URL serve a pack built for the requesting client's release, which matters for a server that accepts several Java releases.

### What vanilla's server does

`DedicatedServerProperties` reads `resource-pack`, `resource-pack-id`, `resource-pack-sha1` (and the older `resource-pack-hash`), `require-resource-pack` and `resource-pack-prompt`: one pack, at a URL somebody else hosts. `ServerResourcePackConfigurationTask` (type `server_resource_pack`) sends the push during configuration, and `ServerConfigurationPacketListenerImpl.handleResourcePackResponse` finishes the task when the answer's action `isTerminal()`. `ServerCommonPacketListenerImpl.handleResourcePackResponse` disconnects with `multiplayer.requiredTexturePrompt.disconnect` only when the action is `DECLINED` and the pack is required; a `FAILED_DOWNLOAD` on a required pack does not disconnect.

### What other servers do

- PaperMC Paper (`paper-api/src/main/java/org/bukkit/entity/Player.java` at `894b2e1eafd3630abe89d9701508834aa5a33977`) exposes `setResourcePack(UUID id, String url, byte[] hash, Component prompt, boolean force)`, `sendResourcePacks(ResourcePackRequest)` and `removeResourcePacks()`. It hosts nothing; plugins bring a URL.
- PaperMC Velocity (`proxy/.../resourcepack/handler/ModernResourcePackHandler.java` at `183c59d78e6ba8b736c5a8f467761f744555b95d`) tracks outstanding, pending and applied packs per player by UUID for 1.20.3+ clients, and also hosts nothing.
- Patbox Polymer AutoHost (`polymer-autohost/` at `c607f2a48fa3b9ea3a8dc71c08a4a7fb8b126e9b`, LGPL-3.0) has three providers. `NettyProvider` serves from the game port: `ProtocolSwitcher` peeks at the first bytes of an inbound connection, and when they look like an HTTP request for a path starting `/eu.pb4.polymer.autohost/`, it strips the Minecraft pipeline and installs `HttpServerCodec`, `HttpObjectAggregator`, `ChunkedWriteHandler` and `CustomHttpServerHandler`, which answers with `Content-Type: application/zip`. Anything else continues as a Minecraft connection. `ServerHandshakePacketListenerImplMixin.storeConnectionData` saves the handshake's `hostName` and `port`, and `NettyProvider.getAddress` builds `http://<that host:port>/eu.pb4.polymer.autohost/<file>`, with a `forced_address` override for proxies. `AbstractProvider.getFilePath` puts the pack's hash in the file name when `includeHashInName` is on. `StandaloneWebServerProvider` runs a separate server and `ExternalProvider` points at a URL.
- ViaBedrock (`ResourcePackHttpServer.java` at `163f9377d86575519bf3da2a291ee010584c7faf`) runs its own Netty HTTP server on `resource-pack-host` and `resource-pack-port` (default `127.0.0.1` and a random port, `viabedrock.yml`), with a `resource-pack-url` override. Each push gets a URL with a per-connection `?token=<uuid>`, an empty hash and `required` false (`ResourcePackPackets.java:91-101`). The handler converts the pack on the request, sends `Content-Type: application/octet-stream` with a `Content-Length`, and closes.

The game port works for HTTP only because Java's protocol starts with a VarInt length and a `0x00` handshake id, which no HTTP method starts with. JSPrismarine's Java listener (`packages/prismarine/src/editions/java/JavaConnections.ts`) reads frames off its own TCP transport, so the same sniffing would sit in front of its frame decoder.

## 2. The Java 26.3 resource pack format

### `pack.mcmeta`

`PackMetadataSection` reads a `pack` object with `description` and the format range from `PackFormat.packCodec(PackType)`. `PackFormat$IntermediaryFormat` has three optional fields: `min_format`, `max_format` and `pack_format`, plus the older `supported_formats`. A format is written as an integer or as `[major, minor]`; `PackFormat` formats them as `%d.%d` and a bare major as `%d.*`. `PackFormat.lastPreMinorVersion` returns 64 for resource packs and 81 for data packs, and the validation message "Multi-version packs cannot support minimum version of less than 15" names the floor. A pack built only for 26.3 declares:

```json
{ "pack": { "description": "...", "min_format": [97, 1], "max_format": [97, 1] } }
```

`OverlayMetadataSection` reads `overlays.entries`, each entry with a format range and a `directory` matching `[-_a-zA-Z0-9.]+`. An overlay directory mirrors the pack root and applies when the client's format is in its range, so one pack can carry per-release variants.

ViaBedrock writes `min_format` and `max_format` as `ProtocolConstants.JAVA_PACK_VERSION`, which is 88 at the commit read, while its `JAVA_VERSION` is 26.3 (`ProtocolConstants.java:29-31`). The 26.3 jar's own format is 97.1. This research did not check what the 26.3 client does with a server pack whose declared range excludes its format.

### Asset layout

File counts under `assets/minecraft/` in the 26.3 client jar:

| Directory | Files | What it holds |
|---|---|---|
| `atlases/` | 12 | Sprite sources for each texture atlas |
| `blockstates/` | 1288 | Block state to model mapping (`variants` or `multipart`) |
| `equipment/` | 45 | Worn equipment layers by `asset_id` |
| `font/` | 7 | Font provider lists |
| `items/` | 1658 | Item model definitions, one per item |
| `lang/` | 2 | `en_us.json` (8559 keys) and `deprecated.json` |
| `models/` | 4192 | Block and item models |
| `particles/` | 115 | Texture lists for vanilla particle types |
| `post_effect/` | 5 | Post-processing chains |
| `shaders/` | 89 | Core and post shaders |
| `textures/` | 4182 | PNG textures |
| `texts/` | 4 | Credits, end poem, splashes |
| `waypoint_style/` | 2 | Locator bar styles |

The other 143 languages and `sounds.json` come from asset index 34, not the jar. The index lists 5149 objects, 4961 of them `.ogg`. `minecraft/sounds.json` is 635867 bytes with 1991 events.

`atlases/blocks.json` builds the block atlas from a `directory` source over `block/` plus a few single sprites, and `atlases/items.json` uses a `directory` source over `item/` plus `paletted_permutations` for armor trims. Textures in those directories are stitched automatically, under any namespace.

### Item model definitions

Since `minecraft:item_model` became a data component, the model for an item stack is `assets/<ns>/items/<path>.json` named by that component. `ItemModels` registers eight model types: `empty`, `model`, `range_dispatch`, `special`, `composite`, `bundle/selected_item`, `select` and `condition`. `SelectItemModelProperties` registers ten select properties: `custom_model_data`, `main_hand`, `charge_type`, `trim_material`, `block_state`, `display_context`, `local_time`, `context_entity_type`, `context_dimension` and `component`. `items/diamond_sword.json` is a plain `{"model": {"type": "minecraft:model", "model": "minecraft:item/diamond_sword"}}`; `items/compass.json` is a `condition` on `minecraft:lodestone_tracker` over `range_dispatch` entries.

`CustomModelData` (component `minecraft:custom_model_data`) holds four lists: `floats`, `flags`, `strings` and `colors`. ViaBedrock keys its converted models by one string (`ItemModelResourceRewriter.getCustomModelData`).

### Models

`CuboidModelElement$Deserializer` reads `from`, `to`, `rotation`, `faces`, `light_emission` (0 to 15) and `shade_direction_override`. Coordinates are bounded to -16 and 32 (both constants appear in the deserializer, so a model fits in a 3x3x3 block space centered on the block). `rotation` takes either `axis` and `angle` (`CuboidRotation$SingleAxisRotation`) or `x`, `y` and `z` (`CuboidRotation$EulerXYZRotation`), with `origin` and `rescale`; the error text is "Missing rotation value, expected either 'axis' and 'angle' or 'x', 'y' and 'z'". No angle-step check appears in the deserializer. `ItemTransform$Deserializer` clamps display `translation` to plus or minus 5 and `scale` to plus or minus 4.

A model larger than the -16 to 32 box has to be scaled down in the model and scaled back up elsewhere. CubeConverter's `FormatConverter` does exactly that (`scale(model, scale)` and `model.setScale(1 / scale)`), and ViaBedrock puts the inverse on the `item_display` entity's `scale` (section 5).

### Textures, animation and sounds

Java textures are PNG: atlas sources list `.png` files (`SpriteSource`, `DirectoryLister`). `SpriteLoader` logs "dropping miplevel from {} to {}, because of minimum power of two", so non-power-of-two textures load but lose mipmaps. `AnimationMetadataSection` reads an `animation` section with `frametime`, `frames`, `width`, `height` and `interpolate` from a `<texture>.png.mcmeta` beside a vertical strip of frames.

`net.minecraft.client.resources.sounds.Sound` resolves sound files with the `.ogg` suffix, so Java plays only Ogg Vorbis. A `sounds.json` event in asset index 34 looks like `"entity.zombie.ambient": {"sounds": ["mob/zombie/say1", "mob/zombie/say2", "mob/zombie/say3"], "subtitle": "subtitles.entity.zombie.ambient"}`.

### Data that is not in the pack

Fog is not a resource pack asset on Java. `EnvironmentAttributes` defines `visual/fog_color`, `visual/fog_start_distance`, `visual/fog_end_distance`, `visual/sky_fog_end_distance`, `visual/water_fog_color`, `visual/water_fog_start_distance`, `visual/water_fog_end_distance` and 17 other `visual/` attributes, which biomes, dimension types and timelines set. `minecraft:worldgen/biome` is one of the 32 registries in `configuration.json`, so a server sends a biome's fog as registry data during configuration.

The 32 synced registries in `packages/protocol/src/java/versions/26.3/configuration.json` include `worldgen/biome`, `dimension_type`, `painting_variant`, `jukebox_song`, `banner_pattern`, `enchantment`, `trim_material`, `trim_pattern`, `dialog` and the mob variant registries. They do not include `block`, `item`, `entity_type`, `sound_event` or `particle_type`, which the client builds in. A server cannot add a block, an item, an entity type or a particle type to a vanilla client. It can play a sound that is not registered: `ClientboundSoundPacket` uses `SoundEvent.STREAM_CODEC`, a holder codec that also carries an inline `SoundEvent` through `DIRECT_STREAM_CODEC`, so the id only has to exist in the client's loaded `sounds.json`.

## 3. The Bedrock resource pack layout

### Vanilla, from bedrock-samples

`resource_pack/` at `v1.26.60.5` has these top-level entries and file counts:

| Entry | Files | Notes |
|---|---|---|
| `animation_controllers/` | 73 | Molang state machines |
| `animations/` | 143 | Bone keyframes and Molang |
| `atmospherics/` | 17 | Vibrant Visuals sky settings |
| `attachables/` | 55 | Item and armor geometry worn or held |
| `biomes/`, `biomes_client.json` | 89 | Client biome settings |
| `blocks.json` | 1 | 1353 entries mapping block names to texture short names and sound sets |
| `color_grading/`, `lighting/`, `water/` | 30 | Vibrant Visuals |
| `entity/` | 180 | Client entity definitions |
| `fogs/` | 80 | `minecraft:fog_settings` |
| `models/` | 198 | `models/entity/` (193 geometry files) and `models/blocks/` |
| `particles/` | 192 | `particle_effect` emitters |
| `render_controllers/` | 173 | Molang choice of geometry, textures and materials |
| `sounds.json`, `sounds/` | 4766 | `sounds/sound_definitions.json` (1851 definitions), `music_definitions.json`, audio |
| `texts/` | 269 | 29 `.lang` files, `languages.json`, `language_names.json` |
| `textures/` | 11762 | PNG, TGA, JPG, plus the atlas JSON files |
| `ui/` | 206 | JSON UI screens |
| `manifest.json`, `pack_icon.png` | 2 | |

There is no `materials/` or shader directory in the vanilla pack. Across the whole resource pack the extensions are 5125 `.png`, 4961 `.json`, 4761 `.fsb`, 3328 `.tga`, 29 `.lang`, 18 `.jpg`, 12 `.hdr` and 3 `.ogg`.

The texture index files:

- `textures/terrain_texture.json` has `resource_pack_name`, `texture_name` (`atlas.terrain`), `padding` (8), `num_mip_levels` (4) and 1367 `texture_data` entries. An entry maps a short name to a path, a list of paths (`stone` lists seven: stone, granite, polished granite and so on, indexed by the legacy data value), or objects with `path` and `overlay_color` (`grass_side` uses `#df6827`).
- `textures/item_texture.json` has 504 `texture_data` entries such as `"apple": {"textures": "textures/items/apple"}`.
- `textures/flipbook_textures.json` has 83 entries. All have `flipbook_texture` and `atlas_tile`; 72 have `ticks_per_frame`, 42 `frames`, 28 `atlas_index`, 27 `atlas_tile_variant`, 18 `blend_frames` and 2 `replicate`. `fire_0` lists frames 16 to 31 then 0 to 15.
- `blocks.json` (`format_version` 1.21.40) maps a block name to a `sound` set and `textures`, which may be one short name or per-face names, as `"stone": {"sound": "stone", "textures": "flattened_stone"}`.
- `textures/texture_list.json` is a list of 22 texture paths (sulfur and cinnabar blocks among them).

In `textures/blocks/` there are 3692 files; 51 TGA files in it are color textures rather than MER or normal maps (`azalea_leaves.tga`, `cactus_side.tga` and others), and `file` reports them as 32-bit RGBA Targa. `*_mers.tga` and `*.texture_set.json` are Vibrant Visuals material data with no Java counterpart.

`entity/zombie.entity.json` is a `minecraft:client_entity` with `description.identifier`, `materials`, `textures` (by key: `default`, `baby`), `geometry` (`geometry.zombie.v1.8`, `geometry.zombie.baby`), `spawn_egg` and `scripts.pre_animation` Molang. `models/entity/zombie.geo.json` (`format_version` 1.8.0) has bones with `pivot`, `parent`, `cubes` (`origin`, `size`, `uv`) and `neverRender`. Across the 193 entity geometry files, 84 use `inflate`, 73 use `mirror`, 72 use `rotation` and none use `poly_mesh`. An attachable (`attachables/bow.json`) has the same shape as a client entity: `materials`, `textures`, `geometry` keyed by state (`bow_pulling_0` and so on) and `animations`.

`fogs/*.json` entries (`minecraft:fog_settings`) set `distance` per medium (`air`, `water`, `lava`, ...) with `fog_start`, `fog_end`, `fog_color`, `render_distance_type` (`fixed` or `render`) and `transition_fog`, and a `volumetric` section.

`texts/en_US.lang` has 13413 lines of `key=value`, with `##` comment lines and keys such as `tile.stone_button.name`, `item.diamond_sword.name` and `entity.zombie.name`. Format specifiers are `%s` (852 uses) and `%d` (133). Custom content uses `tile.<namespace>:<name>.name` and `item.<namespace>:<name>.name` (see [bedrock-addons-and-custom-content.md](bedrock-addons-and-custom-content.md), section 3).

### Formats Mojang documents

- Sound: "Minecraft: Bedrock Edition supports .wav, .ogg, and .fsb sound files" (`docs:IntroductionToSound.md:49`). A replacement only has to match the name before the extension, so "you can replace **rain1.fsb** with **rain1.ogg**" (`docs:AddCustomSounds.md:77`). The tutorial exports `.ogg` (`docs:AddCustomSounds.md:53-55`).
- Texture: "Some textures with transparency may need to be saved in TGA format for Bedrock Edition ... while PNG may work, TGA is the preferred format" (`docs:ConvertingTexturePacks.md:65`). Bedrock needs one texture per spawn egg and potion color where Java tints one base texture (line 70), packs some entity and block textures as one UV map where Java has a file per face (line 72), and keeps flipbook animation in `flipbook_textures.json` where Java uses `.mcmeta` files (line 74).
- Folder names differ: Java `block` and `item` against Bedrock `blocks` and `items`; Java's `effect` and `font` have no Bedrock folder; Bedrock's `persona_thumbnails` has no Java folder (`docs:ConvertingTexturePacks.md:78-93`). The page gives sample renames such as `beehive_end.png` to `beehive_top.png` and `wither_rose.png` to `flower_wither_rose.png`.

### Real addon packs

The addon corpus this repository caches (`node_modules/.cache/jsprismarine/addon-corpus/`, 281 MB in total) has 14 resource packs. Sizes and the largest file kinds:

| Pack | Size | Files | Kinds | Directories |
|---|---|---|---|---|
| CrzxaExe/UnRealm-Bedrock | 19.39 MB | 783 | 469 png, 264 json, 42 ogg, 2 lang, 2 tga | animation_controllers, animations, attachables, cameras, entity, fogs, materials, models, particles, render_controllers, sounds, texts, textures, ui |
| xigma0512/XBlockFire | 4.02 MB | 105 | 53 json, 26 png, 26 ogg | animation_controllers, animations, attachables, entity, models, particles, sounds, textures, ui |
| AresgettaGamer/Frame-and-Pane | 2.44 MB | 15 | 11 json, 2 png, 2 lang | entity, models, render_controllers, texts, textures |
| woozystudio/ItemEditor | 0.91 MB | 6 | 3 json, 2 lang, 1 png | texts, ui |
| ForestOfLight/Construct | 0.78 MB | 18 | 10 png, 6 json, 2 lang | font, particles, texts, textures |
| nine microsoft/minecraft-scripting-samples packs | 0.00 to 0.03 MB | 2 to 17 | png, json, lang | texts, textures, models |

No addon pack in the corpus ships `.fsb` or `.wav`; their sounds are OGG.

## 4. Mapping each Bedrock asset kind to Java

"Direct" means the Java form carries the same information. "Lossy" means a Java form exists and drops something named in the row. "Impossible" means no vanilla Java client feature receives it.

| Bedrock asset | Java form | Fidelity | Notes and sources |
|---|---|---|---|
| `manifest.json` header name and description | `pack.mcmeta` `description` | Direct | Format range comes from the target release (section 2). |
| `pack_icon.png` | `pack.png` | Direct | |
| Subpacks (`subpacks/` with memory tiers) | none | Lossy | Java has no player-chosen variants; overlays select by pack format only. Convert one tier. |
| Vanilla texture override (`textures/blocks/stone.png`) | `assets/minecraft/textures/block/stone.png` | Direct for one-to-one names, lossy for atlas-shaped textures | Needs a name table. PackConverter's `mappings/textures.json` has 2060 Java-to-Bedrock leaves, 641 with identical names; some Java names map to several Bedrock names (`block/kelp_plant` to `kelp_a` through `kelp_d`), so the inverse must choose. Chests, beds, signs, conduits and several mobs differ in layout; PackConverter has a transformer per case under `type/texture/transformer/type/`, which the reverse needs inverted. |
| TGA textures | PNG | Direct | Transcode; Java reads PNG only. |
| `overlay_color` and tinted textures | Java tint indices in models | Lossy | Java tints by hardcoded `tintindex` color providers; a fixed `overlay_color` must be baked into the PNG. |
| `flipbook_textures.json` | `<texture>.png.mcmeta` `animation` | Direct for strips with frame lists and `ticks_per_frame`; lossy for `blend_frames` (Java's `interpolate` is per texture) | |
| `*.texture_set.json`, MER and normal maps, `atmospherics/`, `color_grading/`, `lighting/`, `water/` | none | Impossible | Vibrant Visuals material data. |
| Custom item icon (`item_texture.json` short name, `minecraft:icon`) | `assets/<ns>/textures/item/...png`, a `models/` item model with `parent: minecraft:item/generated`, an `items/` definition, and `minecraft:item_model` on the stack | Direct | ViaBedrock `CustomItemTextureResourceRewriter`. |
| Custom item 3D look via attachable | Item model built from the attachable geometry, with display transforms | Lossy | ViaBedrock `CustomAttachableResourceRewriter` sets one `scale` for every display context; Molang animations are dropped. |
| Armor attachables (`*.player.json`) | `equipment/<id>.json` plus `minecraft:equippable.asset_id` | Lossy | Java draws equipment as texture layers on the fixed humanoid armor model; custom armor geometry does not transfer. |
| Custom block appearance (`material_instances`, `minecraft:geometry`, `blocks.json`) | A spare vanilla block state whose `blockstates/` entry the pack overrides, or a display entity per block | Lossy | Section 6. |
| Block geometry (`models/blocks/*.geo.json`) | Block model elements | Lossy | Java elements are boxes inside -16 to 32 with Euler rotation; bone hierarchy must be flattened into element rotations, `inflate` baked into sizes, per-face UVs mapped. CubeConverter does this for item models. |
| Client entity (`entity/*.entity.json`) with geometry and textures | Item models shown on `item_display` entities, with an `interaction` entity for the hitbox | Lossy | ViaBedrock `CustomEntityResourceRewriter` and `CustomEntity`. One static model per geometry and texture pair. |
| `animations/`, `animation_controllers/`, `render_controllers/` | none on the client | Impossible as assets | Molang does not run on Java. A server could move display entities or swap their model keys to approximate state changes; ViaBedrock re-evaluates render controllers server-side and respawns the parts (`CustomEntity.onEntityDataChanged`). |
| `texts/*.lang` | `assets/<ns>/lang/<locale>.json` | Direct | Keep Bedrock's keys and send `translatable` components with them. Lowercase the locale (`en_US.lang` to `en_us.json`), drop `##` comments and trailing tab comments, keep `%s` and `%d`. ViaBedrock instead resolves `texts/en_US.lang` server-side (`TextDefinitions`). |
| `sounds/sound_definitions.json` | `assets/<ns>/sounds.json` | Lossy | Event names must become valid Java identifiers (lowercase `a-z0-9/._-`; ViaBedrock uses `StringUtil.makeIdentifierValueSafe` for paths). Bedrock file paths drop the `sounds/` prefix. `volume`, `pitch`, `stream`, `load_on_low_memory` and `category` have Java analogues or none; `min_distance` and `max_distance` reduce to Java's `attenuation_distance`. |
| `sounds.json` (block, entity, interactive sounds) | none | Impossible as data | Java hardcodes which event a block or mob plays; the server must play events itself. |
| OGG audio | OGG | Direct | |
| WAV audio | OGG | Direct after transcoding | Needs a Vorbis encoder. |
| FSB audio | OGG | Direct after decoding FMOD banks | Vanilla ships 4761; no corpus addon uses it. |
| `font/glyph_XX.png` | Bitmap font provider over the private-use code points | Direct | ViaBedrock `GlyphSheetResourceRewriter` maps sheet `XX` to code points `0xXX00` to `0xXXFF`, 16 by 16. |
| `particles/*.json` | none | Impossible | Java's `particle_type` registry is built in and its `particles/*.json` only list textures for vanilla types. The server can approximate with vanilla particles. |
| `ui/*.json` (JSON UI) | none | Impossible | Java's `textures/gui/` sprites can be retextured, and Bedrock forms can become Java dialogs (`minecraft:dialog` is synced), which is server work, not pack conversion. |
| `fogs/*.json` | Biome or dimension `visual/fog_*` environment attributes | Lossy | Registry data sent in configuration, not a pack file. Volumetric fog, `render_distance_type` and `transition_fog` have no counterpart. |
| `materials/` and shaders | none | Impossible | Java core shaders are replaceable but nothing in a Bedrock pack translates to GLSL. |
| `biomes_client.json`, `biomes/` | Biome registry `effects` and environment attributes | Lossy | Same channel as fog. |
| `cameras/` | none | Impossible | |

## 5. Prior art

### ViaBedrock (Bedrock server to Java client)

RaphiMC/ViaBedrock at `163f9377d86575519bf3da2a291ee010584c7faf` (2026-11-23, version `0.0.32-SNAPSHOT`), GPL-3.0. It targets Java 26.3 and Bedrock 1.26.60 (protocol 2225) (`ProtocolConstants.java:29-36`). Its README lists "Basic resource pack conversion (Contributions are welcome)".

`ResourcePackRewriter.bedrockToJava` runs four rewriters in parallel on a `ForkJoinPool` with a one-minute timeout, merges their output into one in-memory pack and adds `pack.mcmeta`:

- `GlyphSheetResourceRewriter` copies `font/glyph_XX.png` to `assets/viabedrock/textures/font/` and writes `assets/minecraft/font/default.json` with one `bitmap` provider per sheet.
- `CustomItemTextureResourceRewriter` writes, for each `item_texture.json` entry, the PNG, a `minecraft:item/generated` model and an `items/` definition.
- `CustomAttachableResourceRewriter` converts each attachable's geometry to an item model with CubeConverter and sets the same display `scale` for all eight contexts.
- `CustomEntityResourceRewriter` converts each client entity's geometry and texture pairs to item models and records each model's scale.

`ItemModelResourceRewriter.generateItemDefinition` makes every converted thing one `items/` definition with a `minecraft:select` on `minecraft:custom_model_data` whose cases are string keys. On the stack, `ItemRewriter` sets `ITEM_MODEL` to `viabedrock:item_textures/<name>` or `viabedrock:attachables/<id>` and `CUSTOM_MODEL_DATA` to the case key (`ItemRewriter.java:199-203`).

`CustomEntity` stands in a Java `interaction` entity for the Bedrock entity (line 78) and spawns one `item_display` per evaluated model, holding a `minecraft:paper` stack with the entity's `item_model` and `custom_model_data`, with `scale` set to the recorded scale and `translation` to `(0, scale * 0.5, 0)` (lines 166-184). When the Fabric mod ViaBedrockUtility is present it hands the entity to the mod instead (line 160).

What it gives up: custom blocks get no model. `BlockStateRewriter` registers custom block states for the Bedrock palette, and any Bedrock state without a Java mapping logs "Missing bedrock -> java block state mapping" and becomes the Java mapping of `BedrockBlockState.INFO_UPDATE` (lines 172-177). Translations are resolved server-side. No rewriter converts sounds, particles, fogs or vanilla texture overrides. Animations do not run. The pack is converted on every HTTP request, pushed with an empty hash so the client cannot cache it, and followed by `System.gc()` because "Resource pack conversion is very memory intensive" (`ResourcePackHttpServer.java`).

### CubeConverter

oryxel1/CubeConverter at `84f0751c85ce8dac2d52461465078bbc96e16d82` (2026-11-11), GPL-3.0. Converts Bedrock geometry to Java item models. `RotationType` has `PRE_1_21_6`, `HACKY_PRE_1_21_6`, `POST_1_21_6`, `HACKY_POST_1_21_6` and `POST_1_21_11`; for every type but `POST_1_21_11` it clamps cube rotations to Java's limited angles (`FormatConverter`, `cube.clampToJavaLimitedAngle`). It scales a model that exceeds Java's bounds down and returns the inverse scale. Its README says a model on an item display needs `scale * 0.5` added to its y position.

### GeyserMC PackConverter (Java to Bedrock)

GeyserMC/PackConverter at `1ae5b8f048de39d6074132f44d58824c305eb295` (2026-11-08), MIT. "A library for converting Java Edition resource packs to Bedrock Edition", marked work in progress, and it "does not convert custom items fully, it will only convert the textures" (README). 98 Java source files: converters for the pack icon, manifest, lang (`LangConverter`), models, sounds (`SoundConverter`, `SoundRegistryConverter`), splash text and textures, and about 50 texture transformers for layouts that differ between editions (beds, chests, signs, conduit, drowned, fox, villager, wolf armor, particle sheets). Its data is `converter/src/main/resources/mappings/textures.json` (2060 texture name pairs) and `mappings/sounds.json` (592 path pairs such as `ambient/cave/cave1` to `cave/cave1`). The MIT license allows vendoring both tables and porting the transformers, keeping the notice.

### GeyserMC Rainbow

GeyserMC/Rainbow at `c98595574187ebc115fe7c71d467700a936f8ac5` (2026-10-15), LGPL-3.0-or-later. A Fabric client mod for 26.3 that generates Geyser mappings and a Bedrock pack by inspecting what a Java client has loaded. It detects custom blocks "using block state overrides" in loaded packs and custom items from their components (README), which confirms that the Java ecosystem's custom blocks are overridden vanilla states.

### Kas-tle java2bedrock.sh

Kas-tle/java2bedrock.sh at `aff23e750f83e0d2f459beacbd1e54e08add8f36` (2026-10-23), AGPL-3.0. A shell script using jq, ImageMagick and spritesheet-js that converts Java item models (by `custom_model_data` and damage predicates) to Bedrock attachables and Geyser mappings. Each converted model gets an id from the first seven hex characters of the MD5 of its predicates, so ids stay the same across conversions (README).

### Patbox Polymer

Patbox/polymer at `c607f2a48fa3b9ea3a8dc71c08a4a7fb8b126e9b` (2026-11-20), LGPL-3.0. A Fabric server library for content vanilla clients can render. Relevant modules:

- `polymer-autohost`: pack hosting on the game port (section 1).
- `polymer-blocks`: `BlockModelType` lists the shapes it can disguise (full block, leaves, plants, kelp, cactus, tripwire, slabs, trapdoors, sculk sensors, lightning rods and more). `DefaultModelData` fills `FULL_BLOCK` from the non-default states of `note_block` and `target`, the honey levels of `beehive` and `bee_nest`, the `triggered` states of `dispenser` and `dropper`, `natural` creaking hearts and the infested stone variants, recording in `SPECIAL_REMAPS` which vanilla state each borrowed one must look like.
- `polymer-core`'s `ServerPlayerGameModeMixin`: for a disguised block it counts destroy progress on the server, sends `ClientboundBlockDestructionPacket` with the crack stage, breaks the block when progress reaches 1, and stops the client from finishing the break itself by sending its `minecraft:block_break_speed` attribute with base value -9999, restoring the real attribute afterwards.
- `polymer-sound-patcher`: `SoundResourceGenerator.moveSoundEvent` writes a vanilla `sounds.json` entry with `replace: true` and no sounds, silencing that event on the client, and copies the original sounds to a new event the server plays when it should.

### convert-pack

3vorp/convert-pack at `b83ca2ae610f659142b89fa90a3d552f37b09a90` (npm 1.2.0), AGPL-3.0. A 100-line converter between editions and versions that copies only textures whose Faithful API records say they are identical, fetching the path data from `https://api.faithfulpack.net/v2/` on every run (README, `index.js:7-17`). It needs the network and handles textures only.

A web search found other Bedrock-to-Java tools (TheAlienDoctor's minecraft-resource-pack-converter, last pushed 2024-10-14 with no declared license, and closed-source tools) and nothing that handles custom content.

### License compatibility

This repository is `MIT OR MPL-2.0` (`package.json`, `LICENSE`, `LICENSE-MPL2`). GeyserMC PackConverter's MIT code and tables can be vendored with the notice kept. GPL-3.0 (ViaBedrock, CubeConverter), AGPL-3.0 (java2bedrock.sh, convert-pack) and LGPL-3.0 (Polymer, Rainbow) code cannot be copied into an `MIT OR MPL-2.0` package without changing what the combined work may be licensed under; they can be read for behavior, and their file formats are facts. Mojang's own assets in any of these repositories are not relicensed by them.

## 6. What the server sends Java clients

### Items

A Java client renders a custom item when the server sends a stack of a real Java item with:

- `minecraft:item_model` naming the converted `items/` definition, and `minecraft:custom_model_data` when one definition covers several looks;
- `minecraft:item_name` or `minecraft:custom_name`, a `translatable` component with the Bedrock key the converted lang file defines;
- the components that reproduce behavior the client predicts: `max_stack_size`, `max_damage`, `food` and `consumable`, `tool` (mining rules), `equippable` (slot, `asset_id`, camera overlay), `use_cooldown`, `tooltip_display`.

The base item still decides hardcoded client behavior such as bow drawing, throwing, block placement prediction and left-click handling. ViaBedrock uses `minecraft:paper` as the base for display stacks.

### Blocks

The world keeps Bedrock block ids; the Java view sends, for each custom block state, the borrowed vanilla state the pack's `blockstates/` override draws as the custom model. Candidate pools in 26.3, counted from `blockStates.json` and the vanilla blockstate files in the client jar:

| Block | States | Vanilla model | Spare states |
|---|---|---|---|
| `note_block` | 1350 (`instrument` 27, `note` 25, `powered` 2) | One variant `""` for all states | 1349 full cubes |
| `brown_mushroom_block`, `red_mushroom_block`, `mushroom_stem` | 64 each | `multipart` by face | Most of 192, minus the states world generation and players produce |
| `tripwire` | 128 | Variants by connection | Flat, non-colliding shapes |
| `chorus_plant` | 64 | Multipart by face | Plant shapes |

The tradeoffs, from the Java client's side:

- Collision and selection come from the borrowed block: a note block is a full cube, a tripwire has none. A custom block whose Bedrock collision box differs needs a pool with the right shape, or an `interaction` or barrier companion.
- Mining time is predicted from the borrowed block's hardness and the held stack's `tool` component. Polymer's fix is server-side progress, crack stages sent with `ClientboundBlockDestructionPacket` and `block_break_speed` set to -9999 while mining.
- Step, place, break and hit sounds are the borrowed block's `SoundType`, played by the client. Polymer's sound patcher silences those events in the pack and plays replacements from the server. Silencing `block.note_block.*` or `block.wood.*` also silences real note blocks and wood, so the server must replay those too.
- The borrowed block's own behavior must not run: note blocks change `note` on use and `instrument` from the block below, mushroom blocks change faces on neighbor updates. The server decides state, so this only matters for the Java view it sends and for the client's prediction on use.
- Display entities (`block_display` or `item_display`) avoid the state budget and allow any model up to the entity's own scale, but cost one entity per placed block and have no collision.

### Entities

For a custom entity, ViaBedrock's pattern is the working one: an `interaction` entity sized to the Bedrock collision box for hits and interaction, plus one `item_display` per geometry part holding a stack with `item_model` and `custom_model_data`, with `scale` and `translation` set from the conversion. The server moves and rotates them, updates their transformations to approximate animation if it wants, and sends custom sounds as inline `SoundEvent`s.

### Sounds and particles

Custom sounds play through `ClientboundSoundPacket` and `ClientboundSoundEntityPacket` with an inline event naming the converted `sounds.json` id. Bedrock particle effects have no Java form; the server can send the nearest vanilla particle type.

## 7. Caching

### What a conversion depends on

- The Bedrock pack bytes. `ServedResourcePacks` already computes each zip's SHA-256 (`packages/prismarine/src/resourcePacks/ServedResourcePacks.ts`).
- The stack order. Bedrock resolves texture short names, `blocks.json` entries and lang keys across the whole stack, so a pack converted alone can differ from the same pack converted under another. ViaBedrock converts the stack as one (`getPackStackTopToBottom`).
- The target Java release: its pack format (97.1 for 26.3, 104.0 for 26.4-pre-1) and its vanilla asset names, which the texture table and override paths depend on.
- The converter's own version.
- The server's assignments: which spare block state each custom block state got, and which model keys each custom item and entity uses. These are outputs the server needs at runtime too, so they have to be computed once and kept stable, or every client's cached pack goes stale.
- Optional inputs that need a separate download: decoders for FSB and WAV, and the PackConverter tables.

### Sizes

The corpus packs run from 0.01 MB to 19.4 MB (section 3). Those are the sizes of the Bedrock inputs, not of converted packs: a conversion combines a whole stack into one pack, adds files such as models and `.mcmeta` animations, re-encodes TGA textures as PNG and may store entries uncompressed, so a converted pack can be larger than its inputs. Its size against the client's 262144000-byte cap is unmeasured until a converter exists to check. A pack that overrides vanilla textures wholesale is the large case: Mojang's vanilla Bedrock resource pack is 309 MB over 18233 files ([bedrock-addons-and-custom-content.md](bedrock-addons-and-custom-content.md), section 1), most of it FSB audio and Vibrant Visuals textures that a conversion drops.

### How others cache

- ViaBedrock does not cache: it converts on each request and pushes an empty hash, so the client downloads every time.
- Polymer builds its pack once when the server starts and can put the hash in the file name (`includeHashInName`).
- The Java client caches by SHA-1 (`HttpUtil.downloadFile`), so the same bytes under the same hash skip the download on the next join.

`@jsprismarine/packs/zip`'s `writeZip` dates every entry 1980-01-01 and stores entries uncompressed by default, so "the same files in the same order always give the same bytes" (`packages/packs/src/zip.ts`). That gives a converted pack a stable SHA-1 for the Java client's cache. With deflate on, the bytes can change with the zlib build, as its JSDoc notes.

## Reproduction

```sh
# Java 26.3 client jar and its version facts
curl -sSLo client.jar https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar
unzip -q client.jar -d x && cat x/version.json
javap -p -c -constants -cp x net.minecraft.network.protocol.common.ClientboundResourcePackPushPacket
javap -p -c -constants -cp x 'net.minecraft.client.resources.server.DownloadedPackSource$4'
javap -p -c -constants -cp x 'net.minecraft.server.packs.metadata.pack.PackFormat$IntermediaryFormat'
javap -p -c -constants -cp x 'net.minecraft.client.resources.model.cuboid.CuboidModelElement$Deserializer'
# File counts per asset directory, in a subshell so the commands below run from the repository root
(cd x/assets/minecraft && for d in *; do echo "$d $(find $d -type f | wc -l)"; done)
# Registries a 26.3 server syncs
python3 -c "import json; print([r['registry'] for r in json.load(open('packages/protocol/src/java/versions/26.3/configuration.json'))['registries']])"
# Spare note block states
python3 -c "import json,math; print([(n, math.prod(len(v) for _, v in p)) for n, _, p in json.load(open('packages/protocol/src/java/versions/26.3/blockStates.json')) if n == 'minecraft:note_block'])"
# Bedrock vanilla resource pack extensions, from bedrock-samples at the tag read
git clone --depth 1 --branch v1.26.60.5 https://github.com/Mojang/bedrock-samples
find bedrock-samples/resource_pack -type f | sed 's/.*\.//' | sort | uniq -c | sort -rn
# Prior art at the commits read
for repo in RaphiMC/ViaBedrock@163f9377d86575519bf3da2a291ee010584c7faf \
    GeyserMC/PackConverter@1ae5b8f048de39d6074132f44d58824c305eb295 \
    Patbox/polymer@c607f2a48fa3b9ea3a8dc71c08a4a7fb8b126e9b; do
    name="${repo%@*}"; commit="${repo#*@}"; dir="${name#*/}"
    git init -q "$dir" && git -C "$dir" fetch -q --depth 1 "https://github.com/$name" "$commit" && git -C "$dir" checkout -q FETCH_HEAD
done
```

## Sources

- Java 26.3 client jar: `https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar`. Classes read: `ClientboundResourcePackPushPacket`, `ClientboundResourcePackPopPacket`, `ServerboundResourcePackPacket` and `$Action`, `ClientCommonPacketListenerImpl`, `DownloadedPackSource` and `$4`, `ServerPackManager`, `HttpUtil`, `DownloadQueue`, `ServerCommonPacketListenerImpl`, `ServerConfigurationPacketListenerImpl`, `ServerResourcePackConfigurationTask`, `DedicatedServerProperties`, `PackMetadataSection`, `PackFormat`, `PackFormat$IntermediaryFormat`, `OverlayMetadataSection`, `ItemModels`, `SelectItemModelProperties`, `CustomModelData`, `DataComponents`, `CuboidModelElement$Deserializer`, `CuboidRotation`, `ItemTransform$Deserializer`, `AnimationMetadataSection`, `SpriteLoader`, `Sound`, `SoundEvent`, `ClientboundSoundPacket`, `EnvironmentAttributes`, `Attributes`. Assets read: `version.json`, `assets/minecraft/atlases/`, `items/`, `blockstates/`, `lang/en_us.json`.
- Java 26.3 asset index 34: `https://piston-meta.mojang.com/v1/packages/f3df28b441565ca4e5deb9cda856d90df62e1433/34.json`, and its `minecraft/sounds.json` object `7975165ad4a3c0cb3c05078b914eac0f2c3b5f5f`.
- Java version manifest: `https://launchermeta.mojang.com/mc/game/version_manifest_v2.json`.
- This repository: `packages/protocol/src/java/versions/26.3/` (`release.ts`, `packets.ts`, `blockStates.json`, `configuration.json`), `packages/prismarine/src/resourcePacks/ServedResourcePacks.ts`, `packages/packs/src/zip.ts`, `docs/plans/java-multiprotocol.md`.
- Mojang/bedrock-samples `v1.26.60.5`: `resource_pack/`.
- MicrosoftDocs/minecraft-creator `80b7b1713df821debb4a8022e32e6b0ad840a273`: `creator/Documents/IntroductionToSound.md`, `AddCustomSounds.md`, `ConvertingTexturePacks.md`.
- RaphiMC/ViaBedrock `163f9377d86575519bf3da2a291ee010584c7faf`: `protocol/rewriter/ResourcePackRewriter.java`, `protocol/rewriter/resourcepack/*.java`, `api/resourcepack/http/ResourcePackHttpServer.java`, `protocol/packet/ResourcePackPackets.java`, `api/model/entity/CustomEntity.java`, `protocol/rewriter/ItemRewriter.java`, `protocol/rewriter/BlockStateRewriter.java`, `protocol/data/ProtocolConstants.java`, `src/main/resources/assets/viabedrock/viabedrock.yml`, `README.md`.
- oryxel1/CubeConverter `84f0751c85ce8dac2d52461465078bbc96e16d82`: `converter/FormatConverter.java`, `converter/enums/RotationType.java`, `README.md`.
- GeyserMC/PackConverter `1ae5b8f048de39d6074132f44d58824c305eb295`: `README.md`, `converter/src/main/resources/mappings/textures.json`, `mappings/sounds.json`, `converter/src/main/java/`.
- GeyserMC/Rainbow `c98595574187ebc115fe7c71d467700a936f8ac5`: `README.md`, `LICENSE`, `LICENSE.LESSER`.
- Kas-tle/java2bedrock.sh `aff23e750f83e0d2f459beacbd1e54e08add8f36`: `README.md`, `LICENSE`.
- Patbox/polymer `c607f2a48fa3b9ea3a8dc71c08a4a7fb8b126e9b`: `polymer-autohost/`, `polymer-blocks/.../api/BlockModelType.java`, `polymer-blocks/.../impl/DefaultModelData.java`, `polymer-core/.../mixin/block/ServerPlayerGameModeMixin.java`, `polymer-sound-patcher/`.
- PaperMC/Paper `894b2e1eafd3630abe89d9701508834aa5a33977`: `paper-api/src/main/java/org/bukkit/entity/Player.java`.
- PaperMC/Velocity `183c59d78e6ba8b736c5a8f467761f744555b95d`: `proxy/src/main/java/com/velocitypowered/proxy/connection/player/resourcepack/handler/ModernResourcePackHandler.java`.
- 3vorp/convert-pack `b83ca2ae610f659142b89fa90a3d552f37b09a90`: `README.md`, `index.js`, npm `convert-pack@1.2.0`.
- Web search results that led to convert-pack and TheAlienDoctor's converter: [convert-pack on npm](https://npmjs.com/package/convert-pack), [TheAlienDoctor/minecraft-resource-pack-converter](https://github.com/TheAlienDoctor/minecraft-resource-pack-converter/releases), [GeyserMC/PackConverter](https://github.com/GeyserMC/PackConverter), [Kas-tle/java2bedrock.sh](https://github.com/Kas-tle/java2bedrock.sh).
