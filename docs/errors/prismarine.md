---
title: '@jsprismarine/prismarine errors'
description: The code, message and meaning of every error @jsprismarine/prismarine throws.
group: Documents
category: Errors
---

# @jsprismarine/prismarine errors

These are the errors `@jsprismarine/prismarine` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.prismarine -->
## Groups

Catch one of these classes to handle every error that extends it.

| Class                       | What its errors mean                                                                                                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AddonIntegrityError`       | Error thrown when an addon's download or folder is not what its lock or source says it is.                                                                                                                                                                                     |
| `SnbtSyntaxError`           | Why a compound in a function macro's arguments did not read.                                                                                                                                                                                                                   |
| `LoggedFieldError`          | A logged value had a shape its field never holds.                                                                                                                                                                                                                              |
| `RegistryBundleFormatError` | Raised when a buffer handed to `readRegistryBundle` is not a bundle this build reads.                                                                                                                                                                                          |
| `ConfigSyntaxError`         | Raised when a config file cannot be read as JSON. Thrown rather than swallowed on purpose. Treating a file with a typo in it as empty and then writing the defaults back is how a server used to erase its own config; refusing to start keeps the file for the person to fix. |
| `ChangeLogError`            | A change log was used out of order, such as appending to a tick that is already sealed.                                                                                                                                                                                        |

## Addon

### `PRISMARINE_ADDON_ALREADY_INSTALLED`

`{key} is already installed; run addon update {key}, or install this one with as <another name>`

Thrown as `PrismarineAddonErrors.AddonAlreadyInstalled`, which extends `Error`.

An addon is already installed under this local name. Run `addon update <name>` to move it to
a newer version, or install the other addon under another name with `as <name>`.

### `PRISMARINE_ADDON_DOWNLOAD_FAILED`

`could not download {url}: {status}`

Thrown as `PrismarineAddonErrors.AddonDownloadFailed`, which extends `Error`.

An addon's pack could not be downloaded: the server answered with an error, did not answer
or finish in time, or redirected to a URL that is not `https:`. Check the URL, or try again
later.

### `PRISMARINE_ADDON_HASH_MISMATCH`

`{url} has SHA-256 {actual}, not the {expected} {recordedBy} records`

Thrown as `PrismarineAddonErrors.AddonHashMismatch`, which extends `AddonIntegrityError`.

A downloaded pack's SHA-256 is not the one the index or `addons.lock.json` records, so it is
not the pack that was published or installed, and the installer refuses it. When the lock is
the one that disagrees, the file at that URL changed after it was installed: run `addon
update <name>` to install what the source publishes now.

### `PRISMARINE_ADDON_NEEDS_NEWER_SERVER`

`{name} {version} needs JSPrismarine {minServer} or newer, and this server is {server}`

Thrown as `PrismarineAddonErrors.AddonNeedsNewerServer`, which extends `Error`.

Every version of the addon in the range needs a newer JSPrismarine than this server. Update
the server, or ask for an older version of the addon with `@<version>`.

### `PRISMARINE_ADDON_NOT_INSTALLED`

`no addon is installed as {key}; addon list shows what is`

Thrown as `PrismarineAddonErrors.AddonNotInstalled`, which extends `Error`.

No addon is installed under this local name. `addon list` shows what is.

### `PRISMARINE_ADDON_PATH_MISSING`

`{key} is installed from {path}, which does not exist`

Thrown as `PrismarineAddonErrors.AddonPathMissing`, which extends `Error`.

An addon installed from a local folder is linked to that folder, and the folder is gone.
Put it back, or run `addon remove <name>`.

### `PRISMARINE_ADDON_PATH_NOT_PACK`

`{key} was installed from the .mcpack {path}, which is now a folder`

Thrown as `PrismarineAddonErrors.AddonPathNotPack`, which extends `AddonIntegrityError`.

An addon was installed from an `.mcpack` on disk, whose hash the lock records, and that path
now names a folder. Run `addon remove <name>`, then install the folder.

### `PRISMARINE_ADDON_SOURCE_INSIDE_TARGET`

`cannot install {key} from {path}: it is inside addons/{key}, which the install replaces`

Thrown as `PrismarineAddonErrors.AddonSourceInsideTarget`, which extends `Error`.

A folder installs as a link from `addons/<name>/` to it, which replaces what `addons/<name>/`
holds, so the folder cannot be that one or inside it. Move it out of `addons/` and install it
from there.

### `PRISMARINE_ADDON_TOO_LARGE`

`{url} is larger than the {limit} bytes an addon pack may be`

Thrown as `PrismarineAddonErrors.AddonTooLarge`, which extends `AddonIntegrityError`.

An addon's pack is larger than the installer reads into memory, so it stopped the download.
An addon is a behavior pack of scripts and data, which stays far below the limit; a pack this
large is not one.

### `PRISMARINE_ADDON_VERSION_DIFFERS`

`{key} is version {actual} inside, but {recordedBy} lists it as {expected}`

Thrown as `PrismarineAddonErrors.AddonVersionDiffers`, which extends `AddonIntegrityError`.

The pack's manifest has another version than the index or `addons.lock.json` lists for it,
even though its SHA-256 matches. The source published the wrong pack under that version.
Ask its author to publish it again.

### `PRISMARINE_ADDON_VERSION_NOT_FOUND`

`{source} has no version of {name} in {range}`

Thrown as `PrismarineAddonErrors.AddonVersionNotFound`, which extends `Error`.

The source's index has no version of the addon that falls in the range.

### `PRISMARINE_INVALID_ADDON_KEY`

`{key} is not a local addon name: use lowercase letters, digits and single hyphens`

Thrown as `PrismarineAddonErrors.InvalidAddonKey`, which extends `TypeError`.

An installed addon's local name is its key in `addons.json` and its folder under `addons/`,
so it may hold only lowercase letters, digits and single hyphens between them. Pick another
with `addon install <addon> as <name>`.

### `PRISMARINE_INVALID_ADDON_PACK`

`{key} is not a behavior pack: {problem}`

Thrown as `PrismarineAddonErrors.InvalidAddonPack`, which extends `AddonIntegrityError`.

What was installed is not an addon: it has no `manifest.json` at its root or in a single
folder, the manifest is not a behavior pack's, or a file in the archive would land outside
the addon's folder.

### `PRISMARINE_INVALID_ADDON_SPEC`

`{spec} is not an addon to install: {problem}`

Thrown as `PrismarineAddonErrors.InvalidAddonSpec`, which extends `TypeError`.

`addon install` takes a bare addon name such as `tps-bar`, `<owner>/<repo>/<name>`, either
with an optional `@<range>`, an `https:` URL of an `.mcpack`, or a path that starts with
`./`, `../` or `/` or ends in `.mcpack`. A range is `^1.2.3`, `~1.2.3`, `1.2.3` or `*`. Fix
what the message names.

### `PRISMARINE_INVALID_ADDONS_FILE`

`{file} is invalid: {problem}`

Thrown as `PrismarineAddonErrors.InvalidAddonsFile`, which extends `TypeError`.

`addons.json` or `addons.lock.json` beside `config.json` is not what the installer writes.
Fix what the message names in the file it names. Only when `addons.lock.json` is the broken
one may you delete it instead: `addon sync` then resolves every addon again, which can pick
newer versions within each range than the ones locked.

### `PRISMARINE_NO_ADDON_INDEX`

`{source} publishes no addon index at {url}`

Thrown as `PrismarineAddonErrors.NoAddonIndex`, which extends `Error`.

The source's release has no index to install from: the repository has no `addons` release,
or the release has no `index.json` yet. Check the repository's name.

## Command

### `PRISMARINE_COMMAND_CANNOT_RUN_FROM_CONSOLE`

`This command can't be run from the console`

Thrown as `PrismarineCommandErrors.CommandCannotRunFromConsole`, which extends `Error`.

The command acts on the player who runs it, so the console cannot run it. Run it in game, or
use `/execute as` with a player.

### `PRISMARINE_DUPLICATE_COMMAND_RANDOM_SEQUENCE_STATE`

`Duplicate command random sequence state: {entry}`

Thrown as `PrismarineCommandErrors.DuplicateCommandRandomSequenceState`, which extends `TypeError`.

The saved random sequences of `/random` list one sequence twice, so the save or the replay
that holds it is damaged.

### `PRISMARINE_INVALID_COMMAND_RANDOM_SEQUENCE_STATE`

`Invalid command random sequence state`

Thrown as `PrismarineCommandErrors.InvalidCommandRandomSequenceState`, which extends `TypeError`.

The saved random sequences of `/random` do not have the shape the server writes, so the save
or the replay that holds it is damaged.

### `PRISMARINE_INVALID_NAMED_COMMAND_RANDOM_SEQUENCE_STATE`

`Invalid named command random sequence state`

Thrown as `PrismarineCommandErrors.InvalidNamedCommandRandomSequenceState`, which extends `TypeError`.

A saved `/random` sequence does not have the shape the server writes, so the save or the
replay that holds it is damaged.

### `PRISMARINE_INVALID_NAMED_RANDOM_STREAM_STATE`

`Invalid {sequence} random stream state`

Thrown as `PrismarineCommandErrors.InvalidNamedRandomStreamState`, which extends `TypeError`.

A saved `/random` sequence's stream does not have the shape the server writes, so the save or
the replay that holds it is damaged.

### `PRISMARINE_INVALID_RANDOM_SEQUENCE_SEED`

`Invalid random sequence seed`

Thrown as `PrismarineCommandErrors.InvalidRandomSequenceSeed`, which extends `TypeError`.

A saved `/random` sequence has a seed that is not a whole number, so the save or the replay
that holds it is damaged.

### `PRISMARINE_INVALID_RANDOM_STREAM_STATE`

`Invalid random stream state`

Thrown as `PrismarineCommandErrors.InvalidRandomStreamState`, which extends `TypeError`.

A saved `/random` stream does not have the shape the server writes, so the save or the replay
that holds it is damaged.

### `PRISMARINE_RETURN_OUTSIDE_FUNCTION`

`/return can only be used inside a function`

Thrown as `PrismarineCommandErrors.ReturnOutsideFunction`, which extends `Error`.

`/return` was run outside an `.mcfunction` file, where it has nothing to return from.

### `PRISMARINE_SNBT_EXPECTED_CHARACTER`

`expected '{character}'`

Thrown as `PrismarineCommandErrors.SnbtExpectedCharacter`, which extends `SnbtSyntaxError`.

A function macro's arguments miss a character SNBT needs here, such as a closing brace or a
colon.

### `PRISMARINE_SNBT_EXPECTED_VALUE`

`expected a value`

Thrown as `PrismarineCommandErrors.SnbtExpectedValue`, which extends `SnbtSyntaxError`.

A function macro's arguments have a key without a value.

### `PRISMARINE_SNBT_STRING_ENDS_IN_BACKSLASH`

`the string ends in a backslash`

Thrown as `PrismarineCommandErrors.SnbtStringEndsInBackslash`, which extends `SnbtSyntaxError`.

A function macro's arguments end inside an escape.

### `PRISMARINE_SNBT_TEXT_AFTER_COMPOUND`

`there is text after the compound`

Thrown as `PrismarineCommandErrors.SnbtTextAfterCompound`, which extends `SnbtSyntaxError`.

A function macro's arguments continue after the closing brace of the compound.

### `PRISMARINE_SNBT_UNTERMINATED_STRING`

`unterminated string`

Thrown as `PrismarineCommandErrors.SnbtUnterminatedString`, which extends `SnbtSyntaxError`.

A function macro's arguments open a quote they never close.

### `PRISMARINE_STARTUP_ONLY_SETTING`

`Config key "{key}" can't be set at runtime`

Thrown as `PrismarineCommandErrors.StartupOnlySetting`, which extends `Error`.

`/debug` was asked to change a setting that only takes effect at startup. Change it in
`config.json` and restart.

### `PRISMARINE_UNCLEAN_SHUTDOWN`

`The server did not shut down cleanly`

Thrown as `PrismarineCommandErrors.UncleanShutdown`, which extends `Error`.

`/stop` or `/reload` asked the server to stop, and part of the shutdown failed. The log
before this line says which part.

### `PRISMARINE_UNKNOWN_CONFIGURED_WORLD`

`No world {data} in config`

Thrown as `PrismarineCommandErrors.UnknownConfiguredWorld`, which extends `Error`.

`/debug` named a world `config.json` does not list.

### `PRISMARINE_UNKNOWN_DEBUG_ACTION`

`Invalid action!`

Thrown as `PrismarineCommandErrors.UnknownDebugAction`, which extends `Error`.

`/debug` was given an action it does not have.

### `PRISMARINE_WORLD_NOT_LOADED`

`No world {data} is loaded`

Thrown as `PrismarineCommandErrors.WorldNotLoaded`, which extends `Error`.

`/debug` named a world that is not loaded.

## Content

### `PRISMARINE_CONFIGURED_RANDOM_NOT_RESTORABLE`

`The configured content random source cannot be restored for replay`

Thrown as `PrismarineContentErrors.ConfiguredRandomNotRestorable`, which extends `Error`.

The random source the server was configured with cannot save its state, so replays cannot
restore it. Use the default random source to record replays.

### `PRISMARINE_CONTENT_WORLD_READ_DURING_BUILD`

`the content world was read before the content finished building`

Thrown as `PrismarineContentErrors.ContentWorldReadDuringBuild`, which extends `Error`.

Game content reached into the world before the content finished building. This is a bug in
the server; report it with the stack trace.

### `PRISMARINE_FLAMMABLE_DEFAULTS_REJECTED`

`the minecraft:flammable schema rejected its own defaults`

Thrown as `PrismarineContentErrors.FlammableDefaultsRejected`, which extends `Error`.

The `minecraft:flammable` component's schema refused its own defaults. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_INVALID_CONTENT_RANDOM_STATE_ENTRY`

`Invalid content random state entry`

Thrown as `PrismarineContentErrors.InvalidContentRandomStateEntry`, which extends `TypeError`.

A saved content random state does not have the shape the server writes, so the save or the
replay that holds it is damaged.

### `PRISMARINE_INVALID_CONTENT_RANDOM_STATES`

`Invalid content random states`

Thrown as `PrismarineContentErrors.InvalidContentRandomStates`, which extends `TypeError`.

The saved content random states do not have the shape the server writes, so the save or the
replay that holds it is damaged.

### `PRISMARINE_JAVA_RELEASE_NOT_GENERATED`

`` the Java {release} vanilla datapack is not generated at {path}; run `pnpm --filter @jsprismarine/bedrock-data run datagen:java --java {release}` (pinned releases: {pinned}) ``

Thrown as `PrismarineContentErrors.JavaReleaseNotGenerated`, which extends `Error`.

`content-java-version` names a pinned Java release whose vanilla datapack, or the
`version.json` beside it, is not in the download cache. Generate it with the command the
message gives, or set `content-java-version` to a release that is generated.

### `PRISMARINE_NO_WORLD_TO_PLAY_IN`

`no {dimension} world is loaded, so nothing can be played in it`

Thrown as `PrismarineContentErrors.NoWorldToPlayIn`, which extends `Error`.

Game content tried to act in a dimension that has no loaded world.

### `PRISMARINE_NOT_WIRED`

`{member} is not wired yet; the {area} subsystem owns it`

Thrown as `PrismarineContentErrors.NotWired`, which extends `Error`.

Game content called part of the world the server has not implemented yet. The message names
the part and the subsystem that will provide it.

### `PRISMARINE_RANDOM_SOURCE_NOT_RESTORABLE`

`The {key} content random source cannot be restored for replay`

Thrown as `PrismarineContentErrors.RandomSourceNotRestorable`, which extends `Error`.

One of the content's random sources cannot restore a saved state, so the replay cannot be
reproduced. This is a bug in the server; report it with the stack trace.

### `PRISMARINE_RANDOM_SOURCE_NOT_SAVABLE`

`The {key} content random source cannot be saved for replay`

Thrown as `PrismarineContentErrors.RandomSourceNotSavable`, which extends `Error`.

One of the content's random sources cannot save its state, so the session cannot be recorded
for replay. This is a bug in the server; report it with the stack trace.

### `PRISMARINE_REPLAY_MISSING_RANDOM_STREAMS`

`Replay state has no content random stream for: {missing}`

Thrown as `PrismarineContentErrors.ReplayMissingRandomStreams`, which extends `Error`.

A replay was saved without some of the content's random streams, so it came from a different
version or set of packs.

### `PRISMARINE_UNKNOWN_GAME_RULE`

`{name} is not a game rule of the 26.3 registry`

Thrown as `PrismarineContentErrors.UnknownGameRule`, which extends `Error`.

Code asked for a game rule the Java registry does not have, such as a misspelled name.

### `PRISMARINE_UNKNOWN_JAVA_RELEASE`

`content-java-version names Java {release}, which is not pinned; the pinned releases are {pinned}`

Thrown as `PrismarineContentErrors.UnknownJavaRelease`, which extends `Error`.

`content-java-version` in `config.json` names a Java release that `sources.json` in
`@jsprismarine/bedrock-data` does not pin. Set it to one of the pinned releases the message
lists, or clear it to run the default release.

### `PRISMARINE_UNMAPPED_JAVA_IDENTIFIERS`

`the pack stack references {count} Java identifier(s) with no Bedrock mapping and no reviewed loss entry, first: {id} ({registry}) in pack "{pack}" at {path}`

Thrown as `PrismarineContentErrors.UnmappedJavaIdentifiers`, which extends `Error`.

A strict content build found Java identifiers in the loaded packs with no Bedrock equivalent
and no reviewed loss entry. The error's `unmapped` lists every one; map them, or record why
they are left out.

### `PRISMARINE_WORLD_SOURCE_MEMBER_REPLACED`

`World source member {property} changed from an object`

Thrown as `PrismarineContentErrors.WorldSourceMemberReplaced`, which extends `TypeError`.

Part of the world the content reads was replaced by something that is not an object. This is
a bug in the server; report it with the stack trace.

## Entity

### `PRISMARINE_ENTITY_HAS_NO_PLAIN_RECORD`

`{identifier} {id} has no plain record`

Thrown as `PrismarineEntityErrors.EntityHasNoPlainRecord`, which extends `LoggedFieldError`.

An entity could not be recorded as plain data for the change log. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_ENTITY_NOT_IN_DIMENSION`

`{identifier} is not in this dimension's entity index, so it has no actuator`

Thrown as `PrismarineEntityErrors.EntityNotInDimension`, which extends `Error`.

Content acted on an entity that is not in the dimension it was asked of. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_ENTITY_NOT_RESTORED`

`{identifier} {id} could not be added back`

Thrown as `PrismarineEntityErrors.EntityNotRestored`, which extends `LoggedFieldError`.

An entity removed in an undone change could not be restored. This is a bug in the server;
report it with the stack trace.

### `PRISMARINE_ENTITY_RUNTIME_READ_TOO_EARLY`

`the entity runtime was read before the content was built`

Thrown as `PrismarineEntityErrors.EntityRuntimeReadTooEarly`, which extends `Error`.

A test read the entity runtime before its content was built.

### `PRISMARINE_INVALID_HANGING_COMPONENT`

`{hangingComponent} needs a support of wall or fence and a check_interval`

Thrown as `PrismarineEntityErrors.InvalidHangingComponent`, which extends `TypeError`.

A hanging entity's definition lacks its support kind or check interval. The entity data in
the loaded packs is malformed.

### `PRISMARINE_INVALID_LOGGED_FIELD`

`{field} cannot hold {value}`

Thrown as `PrismarineEntityErrors.InvalidLoggedField`, which extends `LoggedFieldError`.

An entity's saved field holds a value of the wrong shape, so the save or the replay that
holds it is damaged.

### `PRISMARINE_INVALID_PLAYER_FIELD`

`{field} cannot hold {value}`

Thrown as `PrismarineEntityErrors.InvalidPlayerField`, which extends `TypeError`.

A player's saved field holds a value of the wrong shape, so the save or the replay that holds
it is damaged.

### `PRISMARINE_INVALID_SAVED_GAME_MODE`

`abilities.gamemode cannot hold {value}`

Thrown as `PrismarineEntityErrors.InvalidSavedGameMode`, which extends `TypeError`.

A player's saved game mode is not one of the game modes, so the save or the replay that holds
it is damaged.

### `PRISMARINE_INVALID_SAVED_MEAL`

`consumption.meal cannot hold {value}`

Thrown as `PrismarineEntityErrors.InvalidSavedMeal`, which extends `TypeError`.

A player's saved eating state holds a value of the wrong shape, so the save or the replay
that holds it is damaged.

### `PRISMARINE_INVALID_SAVED_MERCHANT`

`merchant cannot hold {value}`

Thrown as `PrismarineEntityErrors.InvalidSavedMerchant`, which extends `LoggedFieldError`.

A villager's saved trades hold a value of the wrong shape, so the save or the replay that
holds it is damaged.

### `PRISMARINE_INVALID_SAVED_MINING`

`mining.block cannot hold {value}`

Thrown as `PrismarineEntityErrors.InvalidSavedMining`, which extends `TypeError`.

A player's saved mining state holds a value of the wrong shape, so the save or the replay
that holds it is damaged.

### `PRISMARINE_INVALID_SAVED_SPAWN_POINT`

`respawn.spawnPoint cannot hold {value}`

Thrown as `PrismarineEntityErrors.InvalidSavedSpawnPoint`, which extends `TypeError`.

A player's saved spawn point holds a value of the wrong shape, so the save or the replay that
holds it is damaged.

### `PRISMARINE_ITEM_COMPONENT_FIELD_NOT_NUMBER`

`{itemComponent} needs a number for {key}`

Thrown as `PrismarineEntityErrors.ItemComponentFieldNotNumber`, which extends `TypeError`.

An item entity's tuning component has a field that is not a number. The entity data in the
loaded packs is malformed.

### `PRISMARINE_MEMBERSHIP_ENTRY_HAS_NO_RECORD`

`a membership entry carries no record to add the entity back from`

Thrown as `PrismarineEntityErrors.MembershipEntryHasNoRecord`, which extends `LoggedFieldError`.

An undone removal carries no record to restore the entity from. This is a bug in the server;
report it with the stack trace.

### `PRISMARINE_MERCHANT_HAS_NO_PLAIN_FORM`

`a merchant snapshot has no plain form`

Thrown as `PrismarineEntityErrors.MerchantHasNoPlainForm`, which extends `LoggedFieldError`.

A villager's trades could not be recorded as plain data. This is a bug in the server; report
it with the stack trace.

### `PRISMARINE_MISSING_ITEM_COMPONENT`

`{identifier} has no {itemComponent} component`

Thrown as `PrismarineEntityErrors.MissingItemComponent`, which extends `TypeError`.

An item entity's definition lacks the component that tunes dropped items. The entity data in
the loaded packs is incomplete.

### `PRISMARINE_NO_ENTITY_WRITER`

`No writer knows {addressed}`

Thrown as `PrismarineEntityErrors.NoEntityWriter`, which extends `Error`.

The change log addressed an entity no part of the server holds. This is a bug in the server;
report it with the stack trace.

### `PRISMARINE_NO_FIELD_WRITER`

`no writer for {field}`

Thrown as `PrismarineEntityErrors.NoFieldWriter`, which extends `LoggedFieldError`.

A change to an entity names a field nothing records. This is a bug in the server; report it
with the stack trace.

### `PRISMARINE_NO_WORLD_FOR_ENTITIES`

`no world is loaded, so its entities cannot be read or changed`

Thrown as `PrismarineEntityErrors.NoWorldForEntities`, which extends `Error`.

Content reached for entities while no world is loaded, such as during startup or shutdown.

### `PRISMARINE_RUNTIME_IDS_EXHAUSTED`

`Entity runtime id counter exceeded Number.MAX_SAFE_INTEGER`

Thrown as `PrismarineEntityErrors.RuntimeIdsExhausted`, which extends `RangeError`.

The server handed out so many entity ids that the next would lose precision. Restart the
server.

### `PRISMARINE_STORE_PLAYER_ALREADY_ATTACHED`

`store player {id} is already in a store`

Thrown as `PrismarineEntityErrors.StorePlayerAlreadyAttached`, which extends `Error`.

A player record was attached twice. This is a bug in the server; report it with the stack
trace.

### `PRISMARINE_STORE_PLAYER_ENTITY_MISMATCH`

`store player {id} cannot take entity {entityId}`

Thrown as `PrismarineEntityErrors.StorePlayerEntityMismatch`, which extends `Error`.

A player record was attached to a different entity than its own. This is a bug in the server;
report it with the stack trace.

### `PRISMARINE_UNSUPPORTED_MOB_EFFECT`

`Cannot serialize unsupported mob effect '{id}'`

Thrown as `PrismarineEntityErrors.UnsupportedMobEffect`, which extends `Error`.

An entity has a status effect Bedrock has no id for, so it cannot be saved or sent.

### `PRISMARINE_VALUE_HAS_NO_PLAIN_FORM`

`A logged value has no plain form: {value}`

Thrown as `PrismarineEntityErrors.ValueHasNoPlainForm`, which extends `TypeError`.

A value written to an entity cannot be recorded as plain data, such as a function or a class
instance. This is a bug in the server; report it with the stack trace.

## Generation

### `PRISMARINE_BIOME_CELL_COUNT_MISMATCH`

`A chunk of height {height} has {value} biome cells, not {indicesCount}`

Thrown as `PrismarineGenerationErrors.BiomeCellCountMismatch`, which extends `RangeError`.

A generated chunk's biome cells do not match its height. This is a bug in world generation;
report it with the stack trace.

### `PRISMARINE_BIOME_CELL_OUT_OF_PALETTE`

`Biome cell index {index} is outside its palette`

Thrown as `PrismarineGenerationErrors.BiomeCellOutOfPalette`, which extends `RangeError`.

A generated chunk's biome points past its palette. This is a bug in world generation; report
it with the stack trace.

### `PRISMARINE_BIOME_SECTION_OFFSETS_MISMATCH`

`Biome section offsets must span the biome ID buffer`

Thrown as `PrismarineGenerationErrors.BiomeSectionOffsetsMismatch`, which extends `RangeError`.

A generated region's biome sections do not cover its biome data. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_DEBUG_GRID_OUT_OF_RANGE`

`{debugGeneratorKind} lays its grid at y {debugFloorY} to {debugGridY}, outside the {id} stem's y {minY} to {maxY}`

Thrown as `PrismarineGenerationErrors.DebugGridOutOfRange`, which extends `Error`.

The debug world lays its block grid at heights outside the dimension. Give the dimension a
height range that includes them.

### `PRISMARINE_DIMENSION_NOT_LOADED_ON_THREAD`

`No view of {id} was built on this thread, so its chunks have no type`

Thrown as `PrismarineGenerationErrors.DimensionNotLoadedOnThread`, which extends `Error`.

A generation thread was asked about a dimension it did not load. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_DISK_CACHE_NEEDS_TEMPLATE_FINGERPRINT`

`Persistent terrain caching requires a template source worldgenFingerprint`

Thrown as `PrismarineGenerationErrors.DiskCacheNeedsTemplateFingerprint`, which extends `TypeError`.

The terrain cache needs a fingerprint of the structure templates it was built with. This is a
bug in world generation; report it with the stack trace.

### `PRISMARINE_DISK_CACHE_WITH_CUSTOM_PIPELINE`

`Persistent terrain caching does not support custom worker pipelines`

Thrown as `PrismarineGenerationErrors.DiskCacheWithCustomPipeline`, which extends `TypeError`.

The terrain cache was set up with an option it cannot cache safely. Turn the cache off, or
drop the option.

### `PRISMARINE_DISK_CACHE_WITH_CUSTOM_STRUCTURES`

`Persistent terrain caching does not support custom structure builders`

Thrown as `PrismarineGenerationErrors.DiskCacheWithCustomStructures`, which extends `TypeError`.

The terrain cache was set up with an option it cannot cache safely. Turn the cache off, or
drop the option.

### `PRISMARINE_DISK_CACHE_WITHOUT_REGISTRY_FINGERPRINT`

`Persistent terrain cache has no registry fingerprint`

Thrown as `PrismarineGenerationErrors.DiskCacheWithoutRegistryFingerprint`, which extends `Error`.

The terrain cache on disk was opened without the fingerprint that keeps old terrain from
being reused after the data changes. This is a bug in world generation; report it with the
stack trace.

### `PRISMARINE_DUPLICATE_FEATURE_TILES`

`A feature view needs distinct terrain tiles.`

Thrown as `PrismarineGenerationErrors.DuplicateFeatureTiles`, which extends `RangeError`.

A feature step was given the same terrain twice. This is a bug in world generation; report it
with the stack trace.

### `PRISMARINE_DUPLICATE_PIECE_CODEC`

`The structure-piece transfer codec {type} is already registered.`

Thrown as `PrismarineGenerationErrors.DuplicatePieceCodec`, which extends `Error`.

Two codecs were registered for one structure piece type.

### `PRISMARINE_DUPLICATE_POST_PLACEMENT_STEP`

`The template post-placement handler {type} is already registered.`

Thrown as `PrismarineGenerationErrors.DuplicatePostPlacementStep`, which extends `Error`.

Two handlers were registered for one structure template post-placement step.

### `PRISMARINE_DUPLICATE_TEMPLATE_MARKER`

`The template marker handler {type} is already registered.`

Thrown as `PrismarineGenerationErrors.DuplicateTemplateMarker`, which extends `Error`.

Two handlers were registered for one structure template marker.

### `PRISMARINE_END_CITY_MARKER_WITHOUT_ROTATION`

`The end-city marker action needs a rotation.`

Thrown as `PrismarineGenerationErrors.EndCityMarkerWithoutRotation`, which extends `TypeError`.

An end city template marker was run without its rotation. This is a bug in world generation;
report it with the stack trace.

### `PRISMARINE_FEATURE_TASK_TILE_COUNT_MISMATCH`

`A feature task needs {tileCount} terrain tiles.`

Thrown as `PrismarineGenerationErrors.FeatureTaskTileCountMismatch`, which extends `RangeError`.

A generation worker was sent a task missing the inputs it needs. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_FEATURE_TILE_OUT_OF_WINDOW`

`Feature-view terrain tiles must fit its three by three window.`

Thrown as `PrismarineGenerationErrors.FeatureTileOutOfWindow`, which extends `RangeError`.

A feature step was given terrain from outside its neighborhood. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_FEATURE_VIEW_TILE_COUNT_MISMATCH`

`A feature view needs nine terrain tiles.`

Thrown as `PrismarineGenerationErrors.FeatureViewTileCountMismatch`, which extends `RangeError`.

A feature step was given the wrong number of neighboring chunks. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_FINGERPRINT_WITHOUT_SHARED_CACHE`

`A shared terrain registry fingerprint requires a shared terrain tile store`

Thrown as `PrismarineGenerationErrors.FingerprintWithoutSharedCache`, which extends `TypeError`.

A terrain fingerprint was given without the shared cache it belongs to. This is a bug in
world generation; report it with the stack trace.

### `PRISMARINE_IGLOO_MARKER_WITHOUT_POSITION`

`The igloo snow-cap action needs an x, y, z position.`

Thrown as `PrismarineGenerationErrors.IglooMarkerWithoutPosition`, which extends `TypeError`.

An igloo template action was run without its position. This is a bug in world generation;
report it with the stack trace.

### `PRISMARINE_INCOMPLETE_CHUNK_TASK`

`The chunk task at {chunkX}, {chunkZ} carries no seed, pipeline key and valid start plans.`

Thrown as `PrismarineGenerationErrors.IncompleteChunkTask`, which extends `TypeError`.

A generation worker was sent a task missing the inputs it needs. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_INCOMPLETE_FEATURE_TASK`

`The feature task at {chunkX}, {chunkZ} carries no terrain view, seed and pipeline key.`

Thrown as `PrismarineGenerationErrors.IncompleteFeatureTask`, which extends `TypeError`.

A generation worker was sent a task missing the inputs it needs. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_INCOMPLETE_STRUCTURE_START_TASK`

`The structure-start task at {chunkX}, {chunkZ} carries no candidate list, seed and pipeline key.`

Thrown as `PrismarineGenerationErrors.IncompleteStructureStartTask`, which extends `TypeError`.

A generation worker was sent a task missing the inputs it needs. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_INCOMPLETE_TERRAIN_TASK`

`The terrain task at {chunkX}, {chunkZ} carries no seed and pipeline key.`

Thrown as `PrismarineGenerationErrors.IncompleteTerrainTask`, which extends `TypeError`.

A generation worker was sent a task missing the inputs it needs. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_INVALID_BIOME_SECTION_SIZE`

`Biome section {section} must hold one or 4096 IDs, got {length}`

Thrown as `PrismarineGenerationErrors.InvalidBiomeSectionSize`, which extends `RangeError`.

A generated biome section has a count of biomes other than one or one per block. This is a
bug in world generation; report it with the stack trace.

### `PRISMARINE_INVALID_BLOCK_PASS_RESULT`

`The block pass for the chunk at {cx}, {cz} came back in an unexpected shape.`

Thrown as `PrismarineGenerationErrors.InvalidBlockPassResult`, which extends `TypeError`.

A generation worker returned a chunk's blocks in a shape the server does not read. This is a
bug in world generation; report it with the stack trace.

### `PRISMARINE_INVALID_FEATURE_PATCH_LIST`

`A feature worker returned an invalid patch list.`

Thrown as `PrismarineGenerationErrors.InvalidFeaturePatchList`, which extends `TypeError`.

A generation worker returned feature writes in a shape the server does not read. This is a
bug in world generation; report it with the stack trace.

### `PRISMARINE_INVALID_FEATURE_TILE`

`Feature-view terrain tiles must be radius-zero and match its vertical extent.`

Thrown as `PrismarineGenerationErrors.InvalidFeatureTile`, which extends `RangeError`.

A feature step was given terrain of the wrong size or height. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_INVALID_HORIZONTAL_DIRECTION`

`The random source drew an index outside the four horizontal directions`

Thrown as `PrismarineGenerationErrors.InvalidHorizontalDirection`, which extends `Error`.

A structure drew a direction outside the four horizontal ones. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_INVALID_MERGE_RESULT`

`The merge for the chunk at {cx}, {cz} came back in an unexpected shape.`

Thrown as `PrismarineGenerationErrors.InvalidMergeResult`, which extends `TypeError`.

A generation worker returned a merged chunk in a shape the server does not read. This is a
bug in world generation; report it with the stack trace.

### `PRISMARINE_INVALID_SHARED_CACHE_LIMITS`

`Shared terrain tile store limits must be positive safe integers`

Thrown as `PrismarineGenerationErrors.InvalidSharedCacheLimits`, which extends `RangeError`.

The shared terrain cache was given a size limit that is not a positive whole number.

### `PRISMARINE_INVALID_SHARED_TILE`

`A shared terrain tile builder returned an invalid payload`

Thrown as `PrismarineGenerationErrors.InvalidSharedTile`, which extends `TypeError`.

A worker returned terrain in a shape the shared cache does not read. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_INVALID_SHARED_TILE_KEY`

`Shared terrain tile keys must be SHA-256 hex digests`

Thrown as `PrismarineGenerationErrors.InvalidSharedTileKey`, which extends `TypeError`.

A terrain cache key is not a fingerprint. This is a bug in world generation; report it with
the stack trace.

### `PRISMARINE_INVALID_SHARED_TILE_OWNER`

`Shared terrain tile owner thread IDs must fit a positive Int32 owner token`

Thrown as `PrismarineGenerationErrors.InvalidSharedTileOwner`, which extends `RangeError`.

A worker's thread id does not fit the shared cache's ownership marker. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_INVALID_STRUCTURE_START_LIST`

`A structure-start worker returned an invalid plan list.`

Thrown as `PrismarineGenerationErrors.InvalidStructureStartList`, which extends `TypeError`.

A worker returned structure starts in a shape the server does not read. This is a bug in
world generation; report it with the stack trace.

### `PRISMARINE_INVALID_TEMPLATE_PIECE`

`The template structure-piece plan is invalid.`

Thrown as `PrismarineGenerationErrors.InvalidTemplatePiece`, which extends `TypeError`.

A template structure piece was sent to a worker in a shape it does not read. This is a bug in
world generation; report it with the stack trace.

### `PRISMARINE_INVALID_TERRAIN_CACHE_LIMIT`

`Terrain proto cache maxBytes must be a positive safe integer`

Thrown as `PrismarineGenerationErrors.InvalidTerrainCacheLimit`, which extends `RangeError`.

The terrain cache was given a size limit that is not a positive whole number.

### `PRISMARINE_INVALID_TERRAIN_STATS_BUFFER`

`Terrain tile build stats need one Int32 counter`

Thrown as `PrismarineGenerationErrors.InvalidTerrainStatsBuffer`, which extends `RangeError`.

The terrain statistics buffer has the wrong size. This is a bug in world generation; report
it with the stack trace.

### `PRISMARINE_MANSION_MARKER_WITHOUT_ROTATION`

`The woodland-mansion marker action needs a rotation.`

Thrown as `PrismarineGenerationErrors.MansionMarkerWithoutRotation`, which extends `TypeError`.

A woodland mansion template marker was run without its rotation. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_MISSING_FEATURE_TILE`

`A feature view needs every terrain tile in its three by three window.`

Thrown as `PrismarineGenerationErrors.MissingFeatureTile`, which extends `RangeError`.

A feature step was given a gap in the terrain around its chunk. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_MISSING_FLAT_SETTINGS`

`The {id} stem carries no flat generator settings`

Thrown as `PrismarineGenerationErrors.MissingFlatSettings`, which extends `TypeError`.

A flat dimension has no flat world settings. Check its preset or its `dimensions` entry.

### `PRISMARINE_MISSING_GENERATION_STATE`

`The chunk at {chunkX}, {chunkZ} has no {what} at {status}, so a status body ran out of order.`

Thrown as `PrismarineGenerationErrors.MissingGenerationState`, which extends `Error`.

A generation status read part of a chunk the status before it never wrote, so the statuses
ran out of order. This is a bug in world generation; report it with the stack trace.

### `PRISMARINE_MISSING_JAVA_WORLDGEN_DATA`

`` The noise generator needs Java Edition 26.3 world generation data. Run `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` and `pnpm --filter @jsprismarine/bedrock-data run datagen:java`, or set {datapack} and {reports}. ``

Thrown as `PrismarineGenerationErrors.MissingJavaWorldgenData`, which extends `Error`.

Noise worlds generate from Mojang's Java world generation data, which is not in the cache.
Run the commands in the message, or `pnpm dev`, which fetches it.

### `PRISMARINE_MISSING_MERGE_INPUTS`

`The chunk at {cx}, {cz} reached full without leaving its merge inputs.`

Thrown as `PrismarineGenerationErrors.MissingMergeInputs`, which extends `Error`.

A chunk finished generating without the data its neighbors merge from. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_MISSING_NOISE_SETTINGS`

`The {id} stem carries no noise generator settings`

Thrown as `PrismarineGenerationErrors.MissingNoiseSettings`, which extends `TypeError`.

A noise dimension has no noise settings. Check its preset or its `dimensions` entry.

### `PRISMARINE_MISSING_SECTION_BIOMES`

`The chunk at {cx}, {cz} has no biome IDs for section {section}`

Thrown as `PrismarineGenerationErrors.MissingSectionBiomes`, which extends `Error`.

A generated chunk is missing a section's biomes. This is a bug in world generation; report it
with the stack trace.

### `PRISMARINE_NO_INNER_SERVER_JAR`

`{jarPath} holds no inner server jar`

Thrown as `PrismarineGenerationErrors.NoInnerServerJar`, which extends `Error`.

The Java server jar the structure templates come from does not hold the inner jar it should.
The download is damaged or is a different version; fetch the sources again.

### `PRISMARINE_NO_TRANSFER_CODEC`

`No transfer codec is registered for {name}.`

Thrown as `PrismarineGenerationErrors.NoTransferCodec`, which extends `TypeError`.

A structure piece has no codec to send it to a worker. This is a bug in world generation;
report it with the stack trace.

### `PRISMARINE_NON_FINITE_CACHE_INPUT`

`Persistent terrain cache inputs must use finite numbers`

Thrown as `PrismarineGenerationErrors.NonFiniteCacheInput`, which extends `TypeError`.

The terrain cache was given an input that is not a finite number. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_NON_PLAIN_CACHE_INPUT`

`Persistent terrain cache inputs must use plain objects`

Thrown as `PrismarineGenerationErrors.NonPlainCacheInput`, which extends `TypeError`.

The terrain cache was given an input that is not a plain object. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_NON_STRING_CACHE_KEY`

`Persistent terrain cache maps must use string keys`

Thrown as `PrismarineGenerationErrors.NonStringCacheKey`, which extends `TypeError`.

The terrain cache was given a map with keys that are not text. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_OCEAN_RUIN_MARKER_WITHOUT_SIZE`

`The ocean-ruin marker action needs its large flag.`

Thrown as `PrismarineGenerationErrors.OceanRuinMarkerWithoutSize`, which extends `TypeError`.

An ocean ruin template marker was run without its size. This is a bug in world generation;
report it with the stack trace.

### `PRISMARINE_ORE_VEIN_DENSITY_REFERENCE`

`{path}: an ore vein rule names a density function by identifier`

Thrown as `PrismarineGenerationErrors.OreVeinDensityReference`, which extends `TypeError`.

Noise settings name an ore vein density function by identifier, which this server does not
resolve there. Write the function inline.

### `PRISMARINE_PACKED_WRITE_COUNT_MISMATCH`

`A packed write list has a position per write`

Thrown as `PrismarineGenerationErrors.PackedWriteCountMismatch`, which extends `TypeError`.

A packed list of block writes has a different number of positions and blocks. This is a bug
in world generation; report it with the stack trace.

### `PRISMARINE_PACKED_WRITE_OUT_OF_PALETTE`

`A packed write names a block its palette does not hold`

Thrown as `PrismarineGenerationErrors.PackedWriteOutOfPalette`, which extends `TypeError`.

A packed block write points past its palette. This is a bug in world generation; report it
with the stack trace.

### `PRISMARINE_PACKED_WRITE_OUTSIDE_CHUNK`

`A packed write at {x} {y} {z} lies outside its chunk`

Thrown as `PrismarineGenerationErrors.PackedWriteOutsideChunk`, which extends `RangeError`.

A feature patch holds a block write outside the chunk it belongs to, so the write cannot be
packed as a position within that chunk. This is a bug in world generation; report it with
the stack trace.

### `PRISMARINE_PARTIAL_BIOME_SECTIONS`

`A generation region must carry both biome section buffers or neither`

Thrown as `PrismarineGenerationErrors.PartialBiomeSections`, which extends `RangeError`.

A generated region carries half of its biome data. This is a bug in world generation; report
it with the stack trace.

### `PRISMARINE_PIECE_PLAN_WITHOUT_FIELDS`

`The {type} structure-piece plan has no field record.`

Thrown as `PrismarineGenerationErrors.PiecePlanWithoutFields`, which extends `TypeError`.

A structure piece was sent to a worker without its fields. This is a bug in world generation;
report it with the stack trace.

### `PRISMARINE_REGION_HEIGHT_MISMATCH`

`Cannot combine generation regions with different vertical extents`

Thrown as `PrismarineGenerationErrors.RegionHeightMismatch`, which extends `RangeError`.

Generation tried to join regions of different heights. This is a bug in world generation;
report it with the stack trace.

### `PRISMARINE_REGISTRY_BUNDLE_BAD_MAGIC`

`This is not a world generation registry bundle this build reads: it does not start with JPRB.`

Thrown as `PrismarineGenerationErrors.RegistryBundleBadMagic`, which extends `RegistryBundleFormatError`.

The world generation data bundle the workers load is damaged or from a different build.
Restart the server so it writes the bundle again.

### `PRISMARINE_REGISTRY_BUNDLE_DOCUMENT_TRUNCATED`

`This is not a world generation registry bundle this build reads: the document {id} runs past the end.`

Thrown as `PrismarineGenerationErrors.RegistryBundleDocumentTruncated`, which extends `RegistryBundleFormatError`.

The world generation data bundle the workers load is damaged or from a different build.
Restart the server so it writes the bundle again.

### `PRISMARINE_REGISTRY_BUNDLE_INDEX_TRUNCATED`

`This is not a world generation registry bundle this build reads: its index runs past the end.`

Thrown as `PrismarineGenerationErrors.RegistryBundleIndexTruncated`, which extends `RegistryBundleFormatError`.

The world generation data bundle the workers load is damaged or from a different build.
Restart the server so it writes the bundle again.

### `PRISMARINE_REGISTRY_BUNDLE_TOO_SHORT`

`This is not a world generation registry bundle this build reads: it is shorter than a header.`

Thrown as `PrismarineGenerationErrors.RegistryBundleTooShort`, which extends `RegistryBundleFormatError`.

The world generation data bundle the workers load is damaged or from a different build.
Restart the server so it writes the bundle again.

### `PRISMARINE_REGISTRY_BUNDLE_VERSION_MISMATCH`

`This is not a world generation registry bundle this build reads: it is format version {version} and this build reads {formatVersion}.`

Thrown as `PrismarineGenerationErrors.RegistryBundleVersionMismatch`, which extends `RegistryBundleFormatError`.

The world generation data bundle the workers load is damaged or from a different build.
Restart the server so it writes the bundle again.

### `PRISMARINE_SHARED_CACHE_NEEDS_TEMPLATE_FINGERPRINT`

`Shared terrain caching requires a template source worldgenFingerprint`

Thrown as `PrismarineGenerationErrors.SharedCacheNeedsTemplateFingerprint`, which extends `TypeError`.

The shared terrain cache needs a fingerprint of the structure templates it was built with.
This is a bug in world generation; report it with the stack trace.

### `PRISMARINE_SHARED_CACHE_TOO_SMALL`

`Shared terrain tile store maxBytes cannot hold one tile slot`

Thrown as `PrismarineGenerationErrors.SharedCacheTooSmall`, which extends `RangeError`.

The shared terrain cache's size limit is too small for a single chunk. Raise it.

### `PRISMARINE_SHARED_CACHE_UNSUPPORTED_HEADER`

`Shared terrain tile store buffer has an unsupported header`

Thrown as `PrismarineGenerationErrors.SharedCacheUnsupportedHeader`, which extends `RangeError`.

The shared terrain cache's memory was laid out by a different build, so the server and its
workers run different versions. Restart the server.

### `PRISMARINE_SHARED_CACHE_WITH_CUSTOM_PIPELINE`

`Shared terrain caching does not support custom worker pipelines`

Thrown as `PrismarineGenerationErrors.SharedCacheWithCustomPipeline`, which extends `TypeError`.

The terrain cache was set up with an option it cannot cache safely. Turn the cache off, or
drop the option.

### `PRISMARINE_SHARED_CACHE_WITH_CUSTOM_STRUCTURES`

`Shared terrain caching does not support custom structure builders`

Thrown as `PrismarineGenerationErrors.SharedCacheWithCustomStructures`, which extends `TypeError`.

The terrain cache was set up with an option it cannot cache safely. Turn the cache off, or
drop the option.

### `PRISMARINE_SHARED_CACHE_WITHOUT_REGISTRY_FINGERPRINT`

`The shared terrain tile store has no registry fingerprint`

Thrown as `PrismarineGenerationErrors.SharedCacheWithoutRegistryFingerprint`, which extends `Error`.

The shared terrain cache has no fingerprint of the world generation data. This is a bug in
world generation; report it with the stack trace.

### `PRISMARINE_SHARED_CACHE_WITHOUT_TEMPLATE_FINGERPRINT`

`The shared terrain tile store has no template fingerprint`

Thrown as `PrismarineGenerationErrors.SharedCacheWithoutTemplateFingerprint`, which extends `Error`.

The shared terrain cache has no fingerprint of the structure templates. This is a bug in
world generation; report it with the stack trace.

### `PRISMARINE_SHARED_CACHE_WITHOUT_WHOLE_CHUNK_POOL`

`Shared terrain caching requires the whole-chunk worker pool`

Thrown as `PrismarineGenerationErrors.SharedCacheWithoutWholeChunkPool`, which extends `TypeError`.

The shared terrain cache only works with the whole-chunk worker pool. Turn one on, or the
cache off.

### `PRISMARINE_SHARED_CACHE_WRONG_SIZE`

`Shared terrain tile store buffer has an invalid size`

Thrown as `PrismarineGenerationErrors.SharedCacheWrongSize`, which extends `RangeError`.

The shared terrain cache's memory has the wrong size. This is a bug in world generation;
report it with the stack trace.

### `PRISMARINE_STRUCTURE_START_MISMATCH`

`The structure-start plan does not match {key}.`

Thrown as `PrismarineGenerationErrors.StructureStartMismatch`, which extends `TypeError`.

A worker returned a structure start for a different chunk than it was asked about. This is a
bug in world generation; report it with the stack trace.

### `PRISMARINE_STRUCTURE_START_OMITTED`

`The structure-start owner omitted {structureStartKeyOf}.`

Thrown as `PrismarineGenerationErrors.StructureStartOmitted`, which extends `Error`.

A worker answered a structure start request without a plan it was asked for. This is a bug in
world generation; report it with the stack trace.

### `PRISMARINE_STRUCTURE_START_REQUEST_LOST`

`The structure-start request lost {key}.`

Thrown as `PrismarineGenerationErrors.StructureStartRequestLost`, which extends `Error`.

A structure start request went unanswered. This is a bug in world generation; report it with
the stack trace.

### `PRISMARINE_TERRAIN_CACHE_WITHOUT_FINGERPRINTS`

`The terrain proto cache has no worldgen fingerprints`

Thrown as `PrismarineGenerationErrors.TerrainCacheWithoutFingerprints`, which extends `Error`.

The terrain cache was opened without the fingerprints that keep old terrain from being reused
after the data changes. This is a bug in world generation; report it with the stack trace.

### `PRISMARINE_TERRAIN_NAMES_INTO_USED_REGION`

`A terrain name writer requires a fresh, untracked region`

Thrown as `PrismarineGenerationErrors.TerrainNamesIntoUsedRegion`, which extends `Error`.

Terrain was named into a region that already holds blocks. This is a bug in world generation;
report it with the stack trace.

### `PRISMARINE_TERRAIN_WORKER_WITHOUT_REGISTRY_BUNDLE`

`A terrain worker needs a registry bundle in shared memory.`

Thrown as `PrismarineGenerationErrors.TerrainWorkerWithoutRegistryBundle`, which extends `TypeError`.

A terrain worker started without the world generation data it reads. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_UNCACHEABLE_INPUT`

`Persistent terrain cache inputs must contain only JSON values and maps`

Thrown as `PrismarineGenerationErrors.UncacheableInput`, which extends `TypeError`.

The terrain cache was given an input it cannot fingerprint. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_UNKNOWN_FLAT_PRESET`

`The {dimensionType} stem names the flat preset {preset}, which no worldgen/flat_level_generator_preset document defines`

Thrown as `PrismarineGenerationErrors.UnknownFlatPreset`, which extends `Error`.

A dimension names a flat world preset no loaded data defines. Check the name, or load the
datapack that defines it.

### `PRISMARINE_UNKNOWN_NOISE_SETTINGS`

`The {dimensionType} stem names the noise settings {settings}, which no worldgen/noise_settings document defines`

Thrown as `PrismarineGenerationErrors.UnknownNoiseSettings`, which extends `Error`.

A dimension names noise settings no loaded data defines. Check the name, or load the datapack
that defines it.

### `PRISMARINE_UNKNOWN_POST_PLACEMENT_STEP`

`No template post-placement handler is registered for {type}.`

Thrown as `PrismarineGenerationErrors.UnknownPostPlacementStep`, which extends `TypeError`.

A structure template asks for a post-placement step no handler knows. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_UNKNOWN_STRUCTURE_SET`

`Unknown structure set {set}.`

Thrown as `PrismarineGenerationErrors.UnknownStructureSet`, which extends `TypeError`.

A structure start names a structure set no loaded data defines. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_UNKNOWN_TEMPLATE_MARKER`

`No template marker handler is registered for {type}.`

Thrown as `PrismarineGenerationErrors.UnknownTemplateMarker`, which extends `TypeError`.

A structure template has a data marker no handler knows. This is a bug in world generation;
report it with the stack trace.

### `PRISMARINE_UNSUPPORTED_CHUNK_STATUS`

`A generation worker has no body for {status}.`

Thrown as `PrismarineGenerationErrors.UnsupportedChunkStatus`, which extends `Error`.

A generation worker was given a status it has no step for. This is a bug in world generation;
report it with the stack trace.

### `PRISMARINE_UNSUPPORTED_WORKER_STATUS`

`A generation worker runs terrain and nothing else, so it cannot run {status}. Every other status either writes into its neighbors or needs state the main thread keeps.`

Thrown as `PrismarineGenerationErrors.UnsupportedWorkerStatus`, which extends `Error`.

A terrain-only worker was given a status that needs neighbors or main-thread state. This is a
bug in world generation; report it with the stack trace.

### `PRISMARINE_UNTRANSFERABLE_TEMPLATE_CALLBACK`

`Template {template} uses a callback that has no transfer action.`

Thrown as `PrismarineGenerationErrors.UntransferableTemplateCallback`, which extends `TypeError`.

A structure template uses a callback that cannot be sent to a worker. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_UNTRANSLATED_MERGE_BLOCK`

`The merge produced {key}, which its translation does not hold`

Thrown as `PrismarineGenerationErrors.UntranslatedMergeBlock`, which extends `RangeError`.

Merging a chunk produced a block its translation table does not hold. This is a bug in world
generation; report it with the stack trace.

### `PRISMARINE_WORKER_WITHOUT_REGISTRY_BUNDLE`

`A generation worker needs a registry bundle in shared memory.`

Thrown as `PrismarineGenerationErrors.WorkerWithoutRegistryBundle`, which extends `TypeError`.

A generation worker started without the world generation data it reads. This is a bug in
world generation; report it with the stack trace.

## Input

### `PRISMARINE_DUPLICATE_INTENT_HANDLER`

`An intent handler for {kind} already exists`

Thrown as `PrismarineInputErrors.DuplicateIntentHandler`, which extends `Error`.

Two handlers were registered for the same intent kind. A plugin that wants to add behavior
to an intent appends its handler instead of registering a second one.

### `PRISMARINE_INPUT_CONTEXT_WITHOUT_STEP`

`An input-lane intent handler was run outside an input step`

Thrown as `PrismarineInputErrors.InputContextWithoutStep`, which extends `Error`.

An input-lane intent handler was run with a context that has no input step, so it had
nowhere to hand a send. This is a bug in the server; report it with the stack trace.

### `PRISMARINE_NO_INTENT_HANDLER`

`No handler is registered for the {kind} intent`

Thrown as `PrismarineInputErrors.NoIntentHandler`, which extends `Error`.

A decoder produced an intent whose kind has no handler. Every kind in the intent table has a
built-in handler, so this is a bug in the server; report it with the stack trace.

### `PRISMARINE_UNDECLARED_INTENT`

`The {packetName} decoder returned a {kind} intent it did not declare`

Thrown as `PrismarineInputErrors.UndeclaredIntent`, which extends `Error`.

A decoder returned an intent of a kind it did not declare, so the dispatcher may have run
it in a lane too loose for that kind. This is a bug in the decoder; its `intents` list has
to name every kind it returns.

### `PRISMARINE_UNKNOWN_INTENT_KIND`

`{kind} is not an intent kind`

Thrown as `PrismarineInputErrors.UnknownIntentKind`, which extends `Error`.

A decoder declared it may produce an intent kind the intent table does not have. This is a
bug in the server or a plugin; the decoder's `intents` list names the kinds it returns.

## Network

### `PRISMARINE_ANVIL_DAMAGE_NOT_DECODED`

`Cannot handle an AnvilDamagePacket without decoded data`

Thrown as `PrismarineNetworkErrors.AnvilDamageNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_BLOCK_PICK_REQUEST_NOT_DECODED`

`Cannot handle a BlockPickRequestPacket without decoded data`

Thrown as `PrismarineNetworkErrors.BlockPickRequestNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_BOOK_EDIT_NOT_DECODED`

`BookEditPacket has no payload after validation`

Thrown as `PrismarineNetworkErrors.BookEditNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_BUFFER_COUNT_MISMATCH`

`Packet and buffer counts differ: {packetsCount} packets, {packetBuffersCount} buffers`

Thrown as `PrismarineNetworkErrors.BufferCountMismatch`, which extends `RangeError`.

A batch was encoded with a different number of packets and buffers. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_CHUNK_RADIUS_REQUEST_NOT_DECODED`

`RequestChunkRadiusPacket has no payload`

Thrown as `PrismarineNetworkErrors.ChunkRadiusRequestNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_CHUNK_TOO_LARGE_FOR_QUEUE`

`Chunk payload {memoryBytes} exceeds the {queuedChunkBytesLimit}-byte queue limit`

Thrown as `PrismarineNetworkErrors.ChunkTooLargeForQueue`, which extends `RangeError`.

One chunk is larger than a player's whole send queue, so it could never be sent. This is a
bug in the server; report it with the stack trace.

### `PRISMARINE_COMMAND_BLOCK_UPDATE_NOT_DECODED`

`Cannot handle a CommandBlockUpdatePacket without decoded data`

Thrown as `PrismarineNetworkErrors.CommandBlockUpdateNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_COMMAND_REQUEST_NOT_DECODED`

`CommandRequestPacket has no decoded payload`

Thrown as `PrismarineNetworkErrors.CommandRequestNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_COMPRESSION_CHANGED_DURING_FLUSH`

`Outbound packet compression changed while a queue flush was pending`

Thrown as `PrismarineNetworkErrors.CompressionChangedDuringFlush`, which extends `Error`.

A connection's compression changed while packets were waiting to be sent under the old
settings. This is a bug in the server; report it with the stack trace.

### `PRISMARINE_CONTENT_PALETTE_MISMATCH`

`the content block palette disagrees with the client's in {count} place(s), first: {block} {detail}`

Thrown as `PrismarineNetworkErrors.ContentPaletteMismatch`, which extends `Error`.

The block palette the server's content builds differs from the one the client expects, so
players would see the wrong blocks. The error's `disagreements` list every difference; a pack
that changes vanilla blocks is the usual cause.

### `PRISMARINE_DIMENSION_WITHOUT_TYPE`

`Level {name} announces dimension {dimensionType} without a type`

Thrown as `PrismarineNetworkErrors.DimensionWithoutType`, which extends `Error`.

A world lists a dimension without its dimension type, so the client cannot be told about it.
The world's dimension config is incomplete.

### `PRISMARINE_DISCONNECT_NOT_DECODED`

`DisconnectPacket has no payload`

Thrown as `PrismarineNetworkErrors.DisconnectNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_DISCRIMINATOR_COUNT_MISMATCH`

`Packet and fragment-discriminator counts differ: {buffersCount} packets, {discriminatorsCount} discriminators`

Thrown as `PrismarineNetworkErrors.DiscriminatorCountMismatch`, which extends `RangeError`.

A batch was encoded with a different number of packets and fragment discriminators. This is a
bug in the server; report it with the stack trace.

### `PRISMARINE_DUMP_FOLDER_OWNED_BY_OTHER_USER`

`{directory} belongs to another user`

Thrown as `PrismarineNetworkErrors.DumpFolderOwnedByOtherUser`, which extends `Error`.

The folder the server writes packet dumps to belongs to another user, so the server refuses
to write there. Use a folder you own.

### `PRISMARINE_DUMP_FOLDER_WRITABLE_BY_OTHERS`

`{directory} can be written by other users`

Thrown as `PrismarineNetworkErrors.DumpFolderWritableByOthers`, which extends `Error`.

The folder the server writes packet dumps to can be written by other users, so the server
refuses to write there. Remove the group and world write permission, or use another folder.

### `PRISMARINE_DUMP_PATH_NOT_FOLDER`

`{directory} is not a directory, or is a symbolic link`

Thrown as `PrismarineNetworkErrors.DumpPathNotFolder`, which extends `Error`.

The packet dump path is not a folder, or is a symbolic link, which the server refuses so
dumps cannot land elsewhere. Point it at a real folder.

### `PRISMARINE_DUPLICATE_HANDLER`

`Handler for {packetName} already exists!`

Thrown as `PrismarineNetworkErrors.DuplicateHandler`, which extends `Error`.

Two handlers were registered for the same packet.

### `PRISMARINE_EMOTE_LIST_NOT_DECODED`

`Cannot handle an EmoteListPacket without decoded data`

Thrown as `PrismarineNetworkErrors.EmoteListNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_EMPTY_BLOCK_CHANGE_BATCH`

`A block-change batch has no packet to report`

Thrown as `PrismarineNetworkErrors.EmptyBlockChangeBatch`, which extends `Error`.

A batch of block changes failed to send and had no packet to name in the report. This is a
bug in the server; report it with the stack trace.

### `PRISMARINE_EMPTY_BLOCK_CHANGE_SUB_CHUNK`

`A block-change subchunk cannot be empty`

Thrown as `PrismarineNetworkErrors.EmptyBlockChangeSubChunk`, which extends `Error`.

A block change batch was built for a sub-chunk with no changes. This is a bug in the server;
report it with the stack trace.

### `PRISMARINE_EMPTY_MESSAGE`

`A message is required`

Thrown as `PrismarineNetworkErrors.EmptyMessage`, which extends `Error`.

A message was sent to a player with no text.

### `PRISMARINE_EMPTY_MOVEMENT_BATCH`

`A movement batch has no packet to report`

Thrown as `PrismarineNetworkErrors.EmptyMovementBatch`, which extends `Error`.

A batch of entity movement failed to send and had no packet to name in the report. This is a
bug in the server; report it with the stack trace.

### `PRISMARINE_EMPTY_PACKET_ENCODING`

`Packet encoding returned no bytes`

Thrown as `PrismarineNetworkErrors.EmptyPacketEncoding`, which extends `Error`.

A packet encoded to nothing. This is a bug in the server; report it with the stack trace.

### `PRISMARINE_EMPTY_SHARED_BATCH`

`A large shared batch has no packet to report`

Thrown as `PrismarineNetworkErrors.EmptySharedBatch`, which extends `Error`.

A large shared batch failed to send and had no packet to name in the report. This is a bug in
the server; report it with the stack trace.

### `PRISMARINE_FRAGMENT_KEY_COUNT_MISMATCH`

`Packet and fragment-key counts differ: {buffersCount} packets, {keysCount} keys`

Thrown as `PrismarineNetworkErrors.FragmentKeyCountMismatch`, which extends `RangeError`.

A batch was encoded with a different number of packets and fragment keys. This is a bug in
the server; report it with the stack trace.

### `PRISMARINE_FRAGMENT_WITHOUT_CODEC_KEY`

`Full-flush fragments require a protocol codec cache key`

Thrown as `PrismarineNetworkErrors.FragmentWithoutCodecKey`, which extends `Error`.

A shared batch was encoded without the protocol key its cached fragments are filed under.
This is a bug in the server; report it with the stack trace.

### `PRISMARINE_FRAME_TOO_LARGE_FOR_NETHERNET`

`A {byteLength} byte frame exceeds NetherNet's message limit`

Thrown as `PrismarineNetworkErrors.FrameTooLargeForNethernet`, which extends `RangeError`.

The server tried to send a batch larger than one NetherNet message can carry. This is a bug
in the server; report it with the stack trace.

### `PRISMARINE_FURNACE_OPTIONS_NOT_DECODED`

`Cannot handle a SetPlayerFurnaceOptionsPacket without decoded data`

Thrown as `PrismarineNetworkErrors.FurnaceOptionsNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_INVALID_CHUNK_CACHE_LIMIT`

`Chunk batch cache limit must be a non-negative integer, got {maxBytes}`

Thrown as `PrismarineNetworkErrors.InvalidChunkCacheLimit`, which extends `RangeError`.

The chunk batch cache was given a size limit that is not a whole, non-negative number of
bytes.

### `PRISMARINE_INVALID_CLIENT_IDENTITY_KEY`

`The client identity key is not a {bedrockCurve} public key`

Thrown as `PrismarineNetworkErrors.InvalidClientIdentityKey`, which extends `Error`.

The key a client's login names is not on the curve Bedrock uses, so encryption cannot be set
up with it. The client is modified or broken.

### `PRISMARINE_INVALID_REPLAY_MANIFEST`

`Invalid replay initial-state manifest`

Thrown as `PrismarineNetworkErrors.InvalidReplayManifest`, which extends `TypeError`.

A replay's starting-state manifest does not have the shape the server writes, so it cannot be
saved. This is a bug in the server; report it with the stack trace.

### `PRISMARINE_INVALID_TRACE_RECORD`

`Invalid inbound packet trace record`

Thrown as `PrismarineNetworkErrors.InvalidTraceRecord`, which extends `Error`.

A packet trace holds a record of the wrong shape, so it is damaged.

### `PRISMARINE_INVALID_TRACE_RECORDS`

`Invalid inbound packet trace records`

Thrown as `PrismarineNetworkErrors.InvalidTraceRecords`, which extends `Error`.

A packet trace's records are not a list, so it is damaged.

### `PRISMARINE_JAVA_FRAME_LENGTH_OUT_OF_RANGE`

`A compressed frame names {length} bytes, outside what threshold {threshold} allows`

Thrown as `PrismarineNetworkErrors.JavaFrameLengthOutOfRange`, which extends `Error`.

A Java Edition client's compressed frame names an uncompressed length below the compression
threshold, past the 8 MiB limit, or other than what its body inflates to. The server closes
the connection; a modified client is the usual cause.

### `PRISMARINE_JAVA_VERIFY_TOKEN_MISMATCH`

`The encryption response does not carry the token the server sent`

Thrown as `PrismarineNetworkErrors.JavaVerifyTokenMismatch`, which extends `Error`.

A Java Edition client's encryption response did not decrypt to the token the server sent, so
it did not encrypt it with the server's key. The server refuses the join.

### `PRISMARINE_LAB_TABLE_NOT_DECODED`

`Cannot handle a LabTablePacket without decoded data`

Thrown as `PrismarineNetworkErrors.LabTableNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_LECTERN_UPDATE_NOT_DECODED`

`Cannot handle a LecternUpdatePacket without decoded data`

Thrown as `PrismarineNetworkErrors.LecternUpdateNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_LOADING_SCREEN_NOT_DECODED`

`Cannot handle a ServerboundLoadingScreenPacket without a payload`

Thrown as `PrismarineNetworkErrors.LoadingScreenNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_LOGIN_NOT_DECODED`

`Cannot handle LoginPacket without packet data`

Thrown as `PrismarineNetworkErrors.LoginNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_LOGIN_TOKEN_IS_NOT_JWT`

`The login token is not a JWT`

Thrown as `PrismarineNetworkErrors.LoginTokenIsNotJwt`, which extends `Error`.

A client's login holds a token that is not a JSON web token, so the client is modified or
broken.

### `PRISMARINE_MISSING_BLOCK_CHANGE`

`Missing block change at flush index {index}`

Thrown as `PrismarineNetworkErrors.MissingBlockChange`, which extends `Error`.

Sending block changes lost track of a change. This is a bug in the server; report it with the
stack trace.

### `PRISMARINE_MISSING_ENCODED_BLOCK_PACKET`

`Missing encoded block packet`

Thrown as `PrismarineNetworkErrors.MissingEncodedBlockPacket`, which extends `Error`.

Sending block changes lost an encoded packet. This is a bug in the server; report it with the
stack trace.

### `PRISMARINE_MISSING_ENCODED_MOVEMENT`

`Missing encoded movement for runtime id {runtimeId}`

Thrown as `PrismarineNetworkErrors.MissingEncodedMovement`, which extends `Error`.

Sending entity movement lost an entity's packet. This is a bug in the server; report it with
the stack trace.

### `PRISMARINE_MISSING_MOVEMENT_BYTES`

`Missing movement bytes for runtime id {runtimeId}`

Thrown as `PrismarineNetworkErrors.MissingMovementBytes`, which extends `Error`.

Sending entity movement lost an entity's encoded bytes. This is a bug in the server; report
it with the stack trace.

### `PRISMARINE_MOVEMENT_PREDICTION_SYNC_NOT_DECODED`

`Cannot handle a ClientMovementPredictionSyncPacket without decoded data`

Thrown as `PrismarineNetworkErrors.MovementPredictionSyncNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_NETHERNET_FRAME_NOT_BATCH`

`A NetherNet frame must be a batch, got id 0x{payload}`

Thrown as `PrismarineNetworkErrors.NethernetFrameNotBatch`, which extends `Error`.

A NetherNet client sent a frame that is not a packet batch, so the client is modified or
speaks another protocol.

### `PRISMARINE_NETWORK_SETTINGS_REQUEST_NOT_DECODED`

`RequestNetworkSettingsPacket has no payload`

Thrown as `PrismarineNetworkErrors.NetworkSettingsRequestNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_NO_HANDLER`

`Invalid handler for packet {packetName}!`

Thrown as `PrismarineNetworkErrors.NoHandler`, which extends `Error`.

Code asked for the handler of a packet that has none.

### `PRISMARINE_NO_INPUT_LANE_HANDLER`

`{name} has no input-lane handler`

Thrown as `PrismarineNetworkErrors.NoInputLaneHandler`, which extends `Error`.

A packet that must be handled during the world tick has no handler there. This is a bug in
the server; report it with the stack trace.

### `PRISMARINE_NOT_RAKNET_CONNECTION`

`Connection {id} did not connect over RakNet`

Thrown as `PrismarineNetworkErrors.NotRaknetConnection`, which extends `Error`.

Code asked for the RakNet session of a player who joined over NetherNet.

### `PRISMARINE_PACK_SETTING_CHANGE_NOT_DECODED`

`Cannot handle a ServerboundPackSettingChangePacket without a payload`

Thrown as `PrismarineNetworkErrors.PackSettingChangeNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_PARTY_CHANGED_NOT_DECODED`

`Cannot handle a PartyChangedPacket without decoded data`

Thrown as `PrismarineNetworkErrors.PartyChangedNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_PLAYER_HAS_LEFT`

`{name} (entity {runtimeId}) has left: its session has no player`

Thrown as `PrismarineNetworkErrors.PlayerHasLeft`, which extends `Error`.

Code acted on a player whose session already ended, such as a delayed task that ran after
they left.

### `PRISMARINE_PLAYER_LOCATION_NOT_DECODED`

`Cannot handle a PlayerLocationPacket without a payload`

Thrown as `PrismarineNetworkErrors.PlayerLocationNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_PROVIDER_CANNOT_RESTORE_REPLAY`

`Provider '{provider}' cannot restore replay snapshots`

Thrown as `PrismarineNetworkErrors.ProviderCannotRestoreReplay`, which extends `Error`.

The world storage provider cannot restore the world snapshot a replay starts from. Record
replays with a provider that can.

### `PRISMARINE_PURCHASE_RECEIPT_NOT_DECODED`

`Cannot handle a PurchaseReceiptPacket without decoded data`

Thrown as `PrismarineNetworkErrors.PurchaseReceiptNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_REPLAY_CONNECTION_CLOSED`

`Replay connection {connectionId} is no longer connected`

Thrown as `PrismarineNetworkErrors.ReplayConnectionClosed`, which extends `Error`.

A recorded session failed to replay: a recorded packet belongs to a connection that has
already closed in the replay.

### `PRISMARINE_REPLAY_CONNECTION_NOT_OPEN`

`Replay connection {connectionId} is not connected`

Thrown as `PrismarineNetworkErrors.ReplayConnectionNotOpen`, which extends `Error`.

A recorded session failed to replay: a recorded packet belongs to a connection that never
opened in the replay.

### `PRISMARINE_REPLAY_FRAME_HAS_SEVERAL_PACKETS`

`Replay frame for {packetName} contained {packetPayloadsCount} packets`

Thrown as `PrismarineNetworkErrors.ReplayFrameHasSeveralPackets`, which extends `Error`.

A recorded session failed to replay: a recorded frame holds more than the one packet a trace
records per frame.

### `PRISMARINE_REPLAY_MANIFEST_NOT_JSON`

`Invalid replay initial-state manifest JSON`

Thrown as `PrismarineNetworkErrors.ReplayManifestNotJson`, which extends `TypeError`.

A replay's starting-state manifest is not JSON, so the replay is damaged.

### `PRISMARINE_REPLAY_OUT_OF_ORDER`

`Replay expected inbound order {expectedOrder}, got {order}`

Thrown as `PrismarineNetworkErrors.ReplayOutOfOrder`, which extends `Error`.

A recorded session failed to replay: its packets are not in the order they were recorded, so
the trace is damaged.

### `PRISMARINE_REPLAY_PACKET_HAS_NO_HANDLER`

`Replay packet {packetName} has no handler`

Thrown as `PrismarineNetworkErrors.ReplayPacketHasNoHandler`, which extends `Error`.

A recorded session failed to replay: a recorded packet has no handler in this version of the
server.

### `PRISMARINE_REPLAY_PACKET_NOT_DECODABLE`

`Replay bytes did not decode as {name}`

Thrown as `PrismarineNetworkErrors.ReplayPacketNotDecodable`, which extends `Error`.

A recorded session failed to replay: a recorded packet no longer decodes as the packet it
was. It was recorded with a different version of the server.

### `PRISMARINE_REPLAY_PACKET_OUT_OF_SEQUENCE`

`Replay connection {connectionId} expected packet {expectedSequence}, got {sequence}`

Thrown as `PrismarineNetworkErrors.ReplayPacketOutOfSequence`, which extends `Error`.

A recorded session failed to replay: its packets are not in the order they were recorded, so
the trace is damaged.

### `PRISMARINE_REPLAY_PACKET_REJECTED`

`Replay packet {name} was rejected in the {phase} phase`

Thrown as `PrismarineNetworkErrors.ReplayPacketRejected`, which extends `Error`.

A recorded session failed to replay: the server refused a packet it accepted when the session
was recorded, so this version behaves differently.

### `PRISMARINE_REPLAY_PROTOCOL_MISMATCH`

`Replay protocol {protocolVersion} does not match connection protocol {connectionCodecProtocolVersion}`

Thrown as `PrismarineNetworkErrors.ReplayProtocolMismatch`, which extends `Error`.

A recorded session failed to replay: a recorded packet uses a different protocol version than
its connection.

### `PRISMARINE_REPLAY_PROVIDER_MISMATCH`

`Replay snapshot provider does not match the manifest`

Thrown as `PrismarineNetworkErrors.ReplayProviderMismatch`, which extends `Error`.

A replay was started with a different world storage provider than it was recorded with.

### `PRISMARINE_REPLAY_TICK_MISMATCH`

`Replay packet tick {expectedTick} does not match server tick {currentTick}`

Thrown as `PrismarineNetworkErrors.ReplayTickMismatch`, which extends `Error`.

A recorded session failed to replay: a packet arrived on a different tick than it was
recorded on, so the replay drifted from the recording.

### `PRISMARINE_RESPAWN_DIMENSION_NOT_READY`

`The respawn search answered {dimension}, which is not ready`

Thrown as `PrismarineNetworkErrors.RespawnDimensionNotReady`, which extends `Error`.

The respawn search picked a dimension that is not ready to spawn in. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_RESPAWN_NOT_DECODED`

`Cannot handle RespawnPacket without decoded data`

Thrown as `PrismarineNetworkErrors.RespawnNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_SCRIPT_MESSAGE_NOT_DECODED`

`Cannot handle a ScriptMessagePacket without decoded data`

Thrown as `PrismarineNetworkErrors.ScriptMessageNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_SET_DIFFICULTY_NOT_DECODED`

`Cannot handle SetDifficultyPacket without decoded data`

Thrown as `PrismarineNetworkErrors.SetDifficultyNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_SET_GAME_TYPE_NOT_DECODED`

`Cannot handle SetPlayerGameTypePacket without decoded data`

Thrown as `PrismarineNetworkErrors.SetGameTypeNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_SETTINGS_COMMAND_NOT_DECODED`

`Cannot handle a SettingsCommandPacket without decoded data`

Thrown as `PrismarineNetworkErrors.SettingsCommandNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_SEVERAL_TRANSPORTS_FAILED_TO_CLOSE`

`Several transports failed to close`

Thrown as `PrismarineNetworkErrors.SeveralTransportsFailedToClose`, which extends `Error`.

More than one transport threw while the server closed them. The cause holds every error, in the order the transports were closed.

### `PRISMARINE_SPAWN_LOST_DURING_JOIN`

`{name} lost its spawn before the join`

Thrown as `PrismarineNetworkErrors.SpawnLostDuringJoin`, which extends `Error`.

The world a joining player was to spawn in unloaded before they finished joining. This is a
bug in the server; report it with the stack trace.

### `PRISMARINE_STRUCTURE_BLOCK_UPDATE_NOT_DECODED`

`Cannot handle a StructureBlockUpdatePacket without decoded data`

Thrown as `PrismarineNetworkErrors.StructureBlockUpdateNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_STRUCTURE_TEMPLATE_REQUEST_NOT_DECODED`

`Cannot handle a StructureTemplateDataRequestPacket without decoded data`

Thrown as `PrismarineNetworkErrors.StructureTemplateRequestNotDecoded`, which extends `Error`.

A packet reached its handler without the decoded body the handler reads. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_TRACE_NOT_JSON`

`Invalid inbound packet trace JSON`

Thrown as `PrismarineNetworkErrors.TraceNotJson`, which extends `Error`.

A packet trace file is not JSON, so it is damaged or not a trace.

### `PRISMARINE_TRACE_OUT_OF_ORDER`

`Inbound packet trace expected order {capturedCount}, got {order}`

Thrown as `PrismarineNetworkErrors.TraceOutOfOrder`, which extends `Error`.

A packet trace was recorded out of order, so it is damaged.

### `PRISMARINE_UNEXPECTED_JAVA_PACKET`

`Packet {packetId} has no place in the {phase} phase`

Thrown as `PrismarineNetworkErrors.UnexpectedJavaPacket`, which extends `Error`.

A Java Edition client sent a packet its connection's phase has no place for. The server
closes the connection; a client of another release, or a modified one, is the usual cause.

### `PRISMARINE_UNKNOWN_HELD_BLOCK`

`No block named {name}, held at {x} {y} {z}`

Thrown as `PrismarineNetworkErrors.UnknownHeldBlock`, which extends `Error`.

A player held a block the server's content does not define. The client and the server's packs
disagree.

### `PRISMARINE_UNSUPPORTED_REPLAY_MANIFEST`

`Unsupported or invalid replay initial-state manifest`

Thrown as `PrismarineNetworkErrors.UnsupportedReplayManifest`, which extends `TypeError`.

A replay's starting-state manifest was written by a different version of the server, or is
damaged.

### `PRISMARINE_UNSUPPORTED_TRACE_FORMAT`

`Unsupported inbound packet trace format or version`

Thrown as `PrismarineNetworkErrors.UnsupportedTraceFormat`, which extends `Error`.

A packet trace file was written by a different version of the server, or is not a trace.

## Server

### `PRISMARINE_ADVERTISED_CODEC_WITHOUT_VERSION`

`The advertised codec names no Minecraft version!`

Thrown as `PrismarineServerErrors.AdvertisedCodecWithoutVersion`, which extends `Error`.

The protocol the server advertises names no Minecraft version. This is a bug in the server;
report it with the stack trace.

### `PRISMARINE_BAN_LIST_NOT_LIST`

`{fileName} must hold a list of banned players`

Thrown as `PrismarineServerErrors.BanListNotList`, which extends `Error`.

The ban list file is not a JSON list. Fix it, or delete it to start with no bans.

### `PRISMARINE_BLOCK_HAS_NO_PROPERTIES`

`Block {name} has no property {key} (has: none)`

Thrown as `PrismarineServerErrors.BlockHasNoProperties`, which extends `Error`.

Code read or set a property on a block that has none.

### `PRISMARINE_CONFIG_IS_SINGLE_VALUE`

`Not valid json: the document is a single value, not an object or an array`

Thrown as `PrismarineServerErrors.ConfigIsSingleValue`, which extends `ConfigSyntaxError`.

A config file holds a single value instead of an object or a list. Fix the file.

### `PRISMARINE_CONFIG_NOT_READABLE`

`Cannot read {path}: {detail}`

Thrown as `PrismarineServerErrors.ConfigNotReadable`, which extends `Error`.

The server could not read a config file, and refuses to start rather than overwrite it with
defaults. Fix the file named in the message, or its permissions.

### `PRISMARINE_CONFIG_NOT_VALID_JSON`

`Not valid json: {printParseErrorCode} at offset {offset}`

Thrown as `PrismarineServerErrors.ConfigNotValidJson`, which extends `ConfigSyntaxError`.

A config file is not valid JSON. The server refuses to start rather than overwrite it with
defaults; fix the file at the offset given.

### `PRISMARINE_CONFIG_NOT_WRITABLE`

`Could not write {key} to {path}`

Thrown as `PrismarineServerErrors.ConfigNotWritable`, which extends `Error`.

The server could not save a setting to its config file. The cause says why, such as
permissions or a full disk.

### `PRISMARINE_CONFIGURED_RANDOM_NOT_SAVABLE`

`The configured server random callback has no serializable state`

Thrown as `PrismarineServerErrors.ConfiguredRandomNotSavable`, which extends `Error`.

The random callback the server was configured with cannot save its state, so the session
cannot be recorded for replay. Use the default random source to record replays.

### `PRISMARINE_CONTENT_BUILD_FAILED`

`Failed to build the content registries; the pack stack was not loaded`

Thrown as `PrismarineServerErrors.ContentBuildFailed`, which extends `Error`.

The server could not build its content because the packs did not load. The cause is the
load's error.

### `PRISMARINE_CONTENT_READ_TOO_EARLY`

`the content was read before the pack stack was built`

Thrown as `PrismarineServerErrors.ContentReadTooEarly`, which extends `Error`.

Code read the server's content before its packs were loaded, such as a plugin that runs too
early in startup.

### `PRISMARINE_CONTENT_SETTINGS_READ_BEFORE_BUILD`

`The content settings are read with the content build`

Thrown as `PrismarineServerErrors.ContentSettingsReadBeforeBuild`, which extends `Error`.

Code read the content settings, such as the world pack directories, before the server built
its content, which reads them. This is a bug in the server; report it with the stack trace.

### `PRISMARINE_CONTENT_WORLD_READ_BEFORE_CONTENT`

`the content world was read before the content was built`

Thrown as `PrismarineServerErrors.ContentWorldReadBeforeContent`, which extends `Error`.

Code read the content world before the content was built.

### `PRISMARINE_CONTENT_WORLD_READ_TOO_EARLY`

`the content world was read before the pack stack was built`

Thrown as `PrismarineServerErrors.ContentWorldReadTooEarly`, which extends `Error`.

Code read the content world before the server's packs were loaded, such as a plugin that runs
too early in startup.

### `PRISMARINE_CRAFTING_GRID_SIZE_MISMATCH`

`A {width}x{height} grid needs {value} slots, was given {slotsCount}`

Thrown as `PrismarineServerErrors.CraftingGridSizeMismatch`, which extends `Error`.

A crafting grid was built with the wrong number of slots for its size. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_EXPECTED_COORDINATE`

`Expected a coordinate, got "{original}"`

Thrown as `PrismarineServerErrors.ExpectedCoordinate`, which extends `Error`.

A command was given a coordinate that is not a number, `~` or `^`.

### `PRISMARINE_FAKE_LEVEL_HAS_NO_WORLD`

`the fake level has no {dimensionId} world`

Thrown as `PrismarineServerErrors.FakeLevelHasNoWorld`, which extends `Error`.

A test asked its fake level for a dimension it was not given.

### `PRISMARINE_FAKE_LEVEL_WITHOUT_PROVIDER`

`the fake level was built without a provider`

Thrown as `PrismarineServerErrors.FakeLevelWithoutProvider`, which extends `Error`.

A test's fake level needs a world provider for what the test asked of it.

### `PRISMARINE_INVALID_BLOCK_PROPERTY_VALUE`

`Property {name}.{key} does not accept {value} (accepts: {values})`

Thrown as `PrismarineServerErrors.InvalidBlockPropertyValue`, which extends `Error`.

Code set a block property to a value outside its allowed set. The message lists the allowed
values.

### `PRISMARINE_INVALID_LOGGED_BLOCK_ENTITY_VALUE`

`A logged block entity field holds {value}`

Thrown as `PrismarineServerErrors.InvalidLoggedBlockEntityValue`, which extends `TypeError`.

A block entity change holds a value that is not plain data. This is a bug in the server;
report it with the stack trace.

### `PRISMARINE_INVALID_LOGGED_SLOT`

`A logged slot cannot hold {value}`

Thrown as `PrismarineServerErrors.InvalidLoggedSlot`, which extends `TypeError`.

An inventory change holds a value that is not an item stack. This is a bug in the server;
report it with the stack trace.

### `PRISMARINE_INVALID_PERMISSION_EXPIRY`

`Expiry "{expires}" is not an ISO 8601 instant in the future`

Thrown as `PrismarineServerErrors.InvalidPermissionExpiry`, which extends `RangeError`.

An expiry is not an ISO 8601 instant in the future, such as `2030-01-01T00:00:00Z`.

### `PRISMARINE_INVALID_PERMISSION_GROUP_NAME`

`Permission group name "{group}" is empty or has whitespace`

Thrown as `PrismarineServerErrors.InvalidPermissionGroupName`, which extends `RangeError`.

A group's name is empty or has whitespace.

### `PRISMARINE_INVALID_PERMISSION_GROUP_WEIGHT`

`Permission group weight {weight} is not a finite number`

Thrown as `PrismarineServerErrors.InvalidPermissionGroupWeight`, which extends `RangeError`.

A group's weight must be a finite number, since the file holds it as a JSON number.

### `PRISMARINE_INVALID_PERMISSION_NODE`

`Permission node "{node}" is not spelled as scope.name, scope.* or *`

Thrown as `PrismarineServerErrors.InvalidPermissionNode`, which extends `RangeError`.

A permission node is not spelled as `scope.name`, `scope.*` or `*`, with at most one leading
`-`. Dots separate non-empty segments, and `*` can only be the last one.

### `PRISMARINE_INVALID_PERMISSIONS_ENTRY`

`Invalid {permissionFileName} file.`

Thrown as `PrismarineServerErrors.InvalidPermissionsEntry`, which extends `Error`.

`permissions.json` or `ops.json` lists a player entry with the wrong shape. Fix or remove
that entry.

### `PRISMARINE_INVALID_SERVER_REPLAY_RANDOM_STATE`

`Invalid server replay random state`

Thrown as `PrismarineServerErrors.InvalidServerReplayRandomState`, which extends `TypeError`.

A replay's saved server random state does not have the shape the server writes, so the save
or the replay that holds it is damaged.

### `PRISMARINE_JAVA_PORT_NOT_BOUND`

`Java Edition cannot listen on TCP port {port}: {reason}`

Thrown as `PrismarineServerErrors.JavaPortNotBound`, which extends `Error`.

The Java Edition listener could not bind its TCP port, usually because another server, such
as a Java Edition server, holds it. Stop the other server, change `java-port` in
`config.json`, or set `java-enabled` to `false`.

### `PRISMARINE_LISTENERS_FAILED_TO_START`

`{reasons}`

Thrown as `PrismarineServerErrors.ListenersFailedToStart`, which extends `Error`.

One or more network listeners could not start. The message joins each listener's own reason with `; `, and the first failure is the cause.

### `PRISMARINE_MANUAL_TICK_WHILE_LOOPING`

`Cannot advance the ticker by hand while its loop runs`

Thrown as `PrismarineServerErrors.ManualTickWhileLooping`, which extends `Error`.

A test advanced the ticker by hand while its loop was running. Stop the loop first.

### `PRISMARINE_MISSING_EXECUTOR`

`Executer can't be undefined or null`

Thrown as `PrismarineServerErrors.MissingExecutor`, which extends `Error`.

A permission was checked without saying who for. This is a bug in the server; report it with
the stack trace.

### `PRISMARINE_MIXED_CARET_NOTATION`

`invalid input`

Thrown as `PrismarineServerErrors.MixedCaretNotation`, which extends `Error`.

A coordinate mixes `^` with `~` or a number, which commands do not allow.

### `PRISMARINE_NESTED_MANUAL_TICK`

`Cannot advance the ticker while a manual tick is in flight`

Thrown as `PrismarineServerErrors.NestedManualTick`, which extends `Error`.

A tick advanced the ticker from inside itself.

### `PRISMARINE_NETHERNET_FAILED_TO_START`

`NetherNet cannot start: {replace} Set "enable-nethernet": false in config.json to run on RakNet alone.`

Thrown as `PrismarineServerErrors.NethernetFailedToStart`, which extends `Error`.

NetherNet failed to start, usually because the native networking library is missing for this
platform. The message says why; the server runs on RakNet alone with `enable-nethernet` set
to `false`.

### `PRISMARINE_NETHERNET_PORT_NOT_BOUND`

`NetherNet cannot bind UDP port {port}: {reason}`

Thrown as `PrismarineServerErrors.NethernetPortNotBound`, which extends `Error`.

NetherNet could not bind one of its UDP ports, usually because another process holds it. Free
the port, or change `server-udp-ports` in `config.json`.

### `PRISMARINE_NO_CONTAINER_FOR_SLOT`

`No block entity at {x}, {y}, {z} holds slot {slot}`

Thrown as `PrismarineServerErrors.NoContainerForSlot`, which extends `TypeError`.

An inventory change addresses a container that no longer exists. This is a bug in the server;
report it with the stack trace.

### `PRISMARINE_NO_ENTITY_RUNTIME`

`no entity runtime was built for {dimension}`

Thrown as `PrismarineServerErrors.NoEntityRuntime`, which extends `Error`.

Code asked for the entities of a dimension the world did not load.

### `PRISMARINE_NO_TRANSPORT_ENABLED`

`No transport is enabled: turn on enable-raknet or enable-nethernet in config.json`

Thrown as `PrismarineServerErrors.NoTransportEnabled`, which extends `Error`.

`config.json` turns off both RakNet and NetherNet, so no player could join. Turn on at least
one.

### `PRISMARINE_OPS_NOT_LIST`

`{opsFileName} must hold a list of operators`

Thrown as `PrismarineServerErrors.OpsNotList`, which extends `Error`.

`ops.json` is not a JSON list. Fix it, or delete it to start with no operators.

### `PRISMARINE_PERMISSION_GROUP_BUILT_IN`

`The permission group "{group}" is built in and cannot be deleted`

Thrown as `PrismarineServerErrors.PermissionGroupBuiltIn`, which extends `Error`.

`default` and `operator` cannot be deleted: every subject holds the first and every operator the second.

### `PRISMARINE_PERMISSION_GROUP_CYCLE`

`Making {parent} a parent of {group} would make {group} its own ancestor`

Thrown as `PrismarineServerErrors.PermissionGroupCycle`, which extends `Error`.

A group cannot inherit from a group that inherits from it. `/perms group <group> parent add` and
the file loader refuse the parent that would close the cycle.

### `PRISMARINE_PERMISSION_GROUP_EXISTS`

`A permission group named "{group}" already exists`

Thrown as `PrismarineServerErrors.PermissionGroupExists`, which extends `Error`.

A command or a script asked to create a permission group that already exists.

### `PRISMARINE_PERMISSION_GROUP_NOT_FOUND`

`No permission group named "{group}"`

Thrown as `PrismarineServerErrors.PermissionGroupNotFound`, which extends `Error`.

A command or a script named a permission group `permissions.json` does not have.

### `PRISMARINE_PERMISSION_GROUP_OWN_PARENT`

`A permission group cannot be its own parent: {group}`

Thrown as `PrismarineServerErrors.PermissionGroupOwnParent`, which extends `Error`.

A group's parent must be another group; a group cannot inherit itself.

### `PRISMARINE_PERMISSIONS_FILE_NOT_LOADED`

`{permissionFileName} is not a version {supported} file, so the edit was not saved`

Thrown as `PrismarineServerErrors.PermissionsFileNotLoaded`, which extends `Error`.

`permissions.json` is no longer a version 2 file while the server runs, so an edit cannot
be saved into it. Restore the file, or run `/perms reload` after fixing it.

### `PRISMARINE_PERMISSIONS_NOT_OBJECT`

`{permissionFileName} must hold an object`

Thrown as `PrismarineServerErrors.PermissionsNotObject`, which extends `Error`.

`permissions.json` is not a JSON object. Fix it, or delete it to have the server write a
fresh one.

### `PRISMARINE_PERMISSIONS_SCHEMA_UNSUPPORTED`

`{permissionFileName} has schemaVersion {schemaVersion}, and this server reads up to {supported}`

Thrown as `PrismarineServerErrors.PermissionsSchemaUnsupported`, which extends `Error`.

`permissions.json` names a `schemaVersion` this server does not read, so it was written by
a newer server. Update the server, or restore the file an older one wrote.

### `PRISMARINE_PLAYER_NOT_FOUND`

`Player "{username}" not found.`

Thrown as `PrismarineServerErrors.PlayerNotFound`, which extends `Error`.

A command or the API named a player who is not online.

### `PRISMARINE_PORT_AND_SERVER_PORT_BOTH_SET`

`{configFilePath} has both port and server-port. port is the old name of server-port: remove it, and keep the port you want in server-port.`

Thrown as `PrismarineServerErrors.PortAndServerPortBothSet`, which extends `Error`.

`config.json` sets both `port` and `server-port`. Remove `port` and keep the value you want
in `server-port`.

### `PRISMARINE_RAKNET_IPV6_PORT_NOT_BOUND`

`RakNet cannot listen for IPv6 clients on UDP port {port}: {reason}`

Thrown as `PrismarineServerErrors.RaknetIpv6PortNotBound`, which extends `Error`.

RakNet could not bind the IPv6 UDP port, usually because another server holds it or the
machine has IPv6 turned off. Free the port, or change `server-portv6` in `config.json`.

### `PRISMARINE_RAKNET_PORT_NOT_BOUND`

`RakNet cannot listen on UDP port {port}: {reason}`

Thrown as `PrismarineServerErrors.RaknetPortNotBound`, which extends `Error`.

RakNet could not bind its UDP port, usually because another server holds it. Stop the other
server, or change `server-port` in `config.json`.

### `PRISMARINE_REPLAY_BEFORE_NETWORKING`

`Cannot replay a packet before networking starts`

Thrown as `PrismarineServerErrors.ReplayBeforeNetworking`, which extends `Error`.

A replay fed a packet before the server's networking started. This is a bug in the server;
report it with the stack trace.

### `PRISMARINE_SELECTOR_MATCHED_NO_ONE`

`no results`

Thrown as `PrismarineServerErrors.SelectorMatchedNoOne`, which extends `Error`.

A target selector sorted with `@r` matched no one.

### `PRISMARINE_SELECTOR_WITHOUT_AT`

`input does not start with "@"`

Thrown as `PrismarineServerErrors.SelectorWithoutAt`, which extends `Error`.

A target selector was parsed from text that does not start with `@`.

### `PRISMARINE_SERVER_IS_NOT_STARTED`

`Server is not started`

Thrown as `PrismarineServerErrors.ServerIsNotStarted`, which extends `Error`.

Code asked for the running server's details before it started.

### `PRISMARINE_SHARED_UDP_PORT_NOT_BOUND`

`RakNet and NetherNet cannot share UDP port {port}: {reason}`

Thrown as `PrismarineServerErrors.SharedUdpPortNotBound`, which extends `Error`.

RakNet and NetherNet could not open the UDP port they share, usually because another process
holds it. Free the port, or change `server-port` in `config.json`.

### `PRISMARINE_SIGNALING_PORT_NOT_BOUND`

`NetherNet cannot listen for signaling on TCP port {port}: {errorMessage}`

Thrown as `PrismarineServerErrors.SignalingPortNotBound`, which extends `Error`.

NetherNet signaling could not bind its TCP port, usually because another process holds it.
Free the port, or set `enable-nethernet` to `false`.

### `PRISMARINE_STACK_HAS_NO_PLAIN_FORM`

`A stored stack has no plain form: {name}`

Thrown as `PrismarineServerErrors.StackHasNoPlainForm`, which extends `TypeError`.

An item stack could not be recorded as plain data. This is a bug in the server; report it
with the stack trace.

### `PRISMARINE_TEST_CONTENT_READ_TOO_EARLY`

`the content was read before it was built`

Thrown as `PrismarineServerErrors.TestContentReadTooEarly`, which extends `Error`.

A test read the server's content before building it.

### `PRISMARINE_TEST_LEVEL_READS_JAVA_REGISTRIES`

`A test level never reads the Java registries`

Thrown as `PrismarineServerErrors.TestLevelReadsJavaRegistries`, which extends `Error`.

A test level was asked for Java registries, which test levels do not load.

### `PRISMARINE_TIMER_STILL_RUNNING`

`You need to stop the timer before getting the result.`

Thrown as `PrismarineServerErrors.TimerStillRunning`, which extends `Error`.

Code read a timer's result while it was still running.

### `PRISMARINE_UNKNOWN_BLOCK_ENTITY_FIELD`

`A block entity has no field {field}`

Thrown as `PrismarineServerErrors.UnknownBlockEntityField`, which extends `TypeError`.

A change to a block entity names a field block entities do not have. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_UNKNOWN_BLOCK_PROPERTY`

`Block {name} has no property {key} (has: {properties})`

Thrown as `PrismarineServerErrors.UnknownBlockProperty`, which extends `Error`.

Code read or set a block property the block does not have. The message lists the ones it has.

### `PRISMARINE_UNKNOWN_SELECTOR_TYPE`

`type "{type}" is invalid. Expected "a", "e", "p", "r" or "s"`

Thrown as `PrismarineServerErrors.UnknownSelectorType`, which extends `Error`.

A target selector starts with a letter that is not `a`, `e`, `p`, `r` or `s`.

### `PRISMARINE_UNKNOWN_WORLD_EXPERIMENT`

`Unknown world experiment {experiment}. The experiments this server implements are: {known}.`

Thrown as `PrismarineServerErrors.UnknownWorldExperiment`, which extends `Error`.

A world in `config.json` lists an experiment the server does not implement, often a typo.
Remove it, or spell it as one of the ids the message lists.

### `PRISMARINE_UNSUPPORTED_CONFIG_TYPE`

`Unsupported config type. (Supported types: json)`

Thrown as `PrismarineServerErrors.UnsupportedConfigType`, which extends `Error`.

A config file was opened with an extension other than `.json`.

### `PRISMARINE_UNSUPPORTED_GENERATOR_KEY`

`` Invalid generator with id {generator}. The `generator` key is deprecated: write `preset` as '{defaultWorldPreset}' or '{flatWorldPreset}', or a `dimensions` entry whose generator type is one of: {knownKinds}. ``

Thrown as `PrismarineServerErrors.UnsupportedGeneratorKey`, which extends `Error`.

A world in `config.json` uses the old `generator` key with a value the server no longer
reads. Write `preset`, or a `dimensions` entry, as the message shows.

### `PRISMARINE_UNTYPED_BLOCK_PROPERTY`

`Property {name}.{key} has no declared type`

Thrown as `PrismarineServerErrors.UntypedBlockProperty`, which extends `Error`.

A block's property has no type in the block data. The block data is incomplete; regenerate
it.

## Stats

### `PRISMARINE_BAD_CHART_NAME`

`bStats chart name "{name}" is not snake_case and has no chart ID`

Thrown as `PrismarineStatsErrors.BadChartName`, which extends `Error`.

A bStats chart name is not `snake_case`, so it has no chart ID. This is a bug in the server;
report it with the stack trace.

### `PRISMARINE_BAD_METRIC_NAME`

`Stats metric name "{name}" must be a snake_case namespace and name, such as "jsprismarine:players"`

Thrown as `PrismarineStatsErrors.BadMetricName`, which extends `Error`.

Code registered a stats metric under a name that is not a `snake_case` namespace and name,
such as `jsprismarine:players`. Rename the metric.

### `PRISMARINE_CHART_TAKES_DEFAULT_ID`

`bStats chart name "{name}" maps onto the default chart "{id}"`

Thrown as `PrismarineStatsErrors.ChartTakesDefaultId`, which extends `Error`.

A bStats chart name maps onto a chart ID bStats fills itself. This is a bug in the server;
report it with the stack trace.

### `PRISMARINE_DUPLICATE_METRIC`

`Stats metric "{name}" is already registered`

Thrown as `PrismarineStatsErrors.DuplicateMetric`, which extends `Error`.

Code registered a stats metric under a name another metric already has. Give the metric a
name of its own, or dispose the other registration first.

### `PRISMARINE_SUBMIT_ABANDONED`

`the server stopped`

Thrown as `PrismarineStatsErrors.SubmitAbandoned`, which extends `Error`.

The server stopped while a usage report was in flight, so the report was abandoned. It is
never logged, since the server logs nothing from bStats after it stops.

### `PRISMARINE_SUBMIT_REJECTED`

`bStats answered {status} {statusText}`

Thrown as `PrismarineStatsErrors.SubmitRejected`, which extends `Error`.

bStats answered a usage report with an error status. The report is dropped and the next one
is sent on schedule; it is logged only when `stats.bstats.log-errors` is on.

### `PRISMARINE_SUBMIT_TIMED_OUT`

`no answer within {seconds} seconds`

Thrown as `PrismarineStatsErrors.SubmitTimedOut`, which extends `Error`.

bStats did not answer a usage report in time, so the server gave up on it. The next report is
sent on schedule; it is logged only when `stats.bstats.log-errors` is on.

## World

### `PRISMARINE_ACTOR_IDS_EXHAUSTED`

`Could not allocate a unique actor id after 32 attempts`

Thrown as `PrismarineWorldErrors.ActorIdsExhausted`, which extends `Error`.

The world could not find an unused entity id after many tries, so the world holds far more
entities than it should.

### `PRISMARINE_AIR_NOT_REGISTERED`

`The air block state is not registered`

Thrown as `PrismarineWorldErrors.AirNotRegistered`, which extends `Error`.

The block registry has no air, so it was read before it was built. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_BIOME_ID_OUT_OF_RANGE`

`A biome id is an integer from 0 to {maxBiomeId}, got {biome}`

Thrown as `PrismarineWorldErrors.BiomeIdOutOfRange`, which extends `RangeError`.

Code stored a biome id outside the range Bedrock allows. This is a bug in the server; report
it with the stack trace.

### `PRISMARINE_BIOME_INDEX_OUT_OF_PALETTE`

`Biome palette index {paletteIndex} is out of range`

Thrown as `PrismarineWorldErrors.BiomeIndexOutOfPalette`, which extends `Error`.

A chunk's biome storage points past its palette. This is a bug in the server; report it with
the stack trace.

### `PRISMARINE_BIOME_SECTION_INHERITS_MISSING`

`A biome section inherited from a missing section`

Thrown as `PrismarineWorldErrors.BiomeSectionInheritsMissing`, which extends `Error`.

A chunk's biome section copies a section below it that does not exist. The world on disk is
damaged, or was written by a tool that writes the format differently; open it in the game to
let it repair what it can, or restore a backup.

### `PRISMARINE_BLOCK_OUT_OF_PALETTE`

`Sub chunk block refers to missing palette index {originalIndex}`

Thrown as `PrismarineWorldErrors.BlockOutOfPalette`, which extends `RangeError`.

A sub-chunk's block points past its palette. The world on disk is damaged, or was written by
a tool that writes the format differently; open it in the game to let it repair what it can,
or restore a backup.

### `PRISMARINE_BLOCK_OUTSIDE_HEIGHT_RANGE`

`Cannot place a block at y {y}: {name} spans {minY} to {maxY}`

Thrown as `PrismarineWorldErrors.BlockOutsideHeightRange`, which extends `Error`.

Code placed a block above or below the dimension's height range.

### `PRISMARINE_CHANGE_DURING_REVERT`

`Cannot {action} while a span is being reverted`

Thrown as `PrismarineWorldErrors.ChangeDuringRevert`, which extends `ChangeLogError`.

A change was recorded while another was being undone. The change log was used out of order.
This is a bug in the server; report it with the stack trace.

### `PRISMARINE_CHUNK_LOAD_AFTER_CLOSE`

`Cannot load chunk {x},{z}: world {name} has been closed`

Thrown as `PrismarineWorldErrors.ChunkLoadAfterClose`, which extends `Error`.

A chunk was asked of a world after it closed, such as a task that ran during shutdown.

### `PRISMARINE_COMPLETION_REPLACED`

`A newer completion replaced {key} before it was admitted`

Thrown as `PrismarineWorldErrors.CompletionReplaced`, which extends `Error`.

A chunk finished twice before the world took the first result. This is a bug in the server;
report it with the stack trace.

### `PRISMARINE_CONFIG_DIMENSIONS_SHARE_TYPE`

`The {first} and {second} dimensions both bind the dimension type {type}; a type backs one dimension per level`

Thrown as `PrismarineWorldErrors.ConfigDimensionsShareType`, which extends `Error`.

Two dimensions in `config.json` use the same dimension type, and each type backs one
dimension in a world. Give one of them another type.

### `PRISMARINE_CUSTOM_DIMENSION_ID_TOO_LOW`

`{javaId} has no Bedrock dimension overlay and needs a custom id of {firstCustomDimensionId} or more, got {customId}`

Thrown as `PrismarineWorldErrors.CustomDimensionIdTooLow`, which extends `RangeError`.

A custom dimension was given a Bedrock dimension id that belongs to a vanilla dimension. Give
it an id at or above the first custom id.

### `PRISMARINE_DIMENSIONS_SHARE_TYPE`

`The {earlier} and {id} stems of level {name} both bind the dimension type {type}; a type backs one dimension per level`

Thrown as `PrismarineWorldErrors.DimensionsShareType`, which extends `Error`.

Two dimensions of the world use the same dimension type, and each type backs one dimension in
a world. Give one of them another type.

### `PRISMARINE_DUPLICATE_GENERATOR_FACTORY`

`A generator factory for {kind} is already registered`

Thrown as `PrismarineWorldErrors.DuplicateGeneratorFactory`, which extends `Error`.

Two world generators were registered under the same kind.

### `PRISMARINE_EMPTY_SINGLE_BLOCK_STORAGE`

`A zero-bit storage needs its runtime id`

Thrown as `PrismarineWorldErrors.EmptySingleBlockStorage`, which extends `RangeError`.

A sub-chunk's single-block storage has no block in its palette. The world on disk is damaged,
or was written by a tool that writes the format differently; open it in the game to let it
repair what it can, or restore a backup.

### `PRISMARINE_GENERATION_STOPPED`

`Chunk {cx},{cz} was not generated: the generator has stopped`

Thrown as `PrismarineWorldErrors.GenerationStopped`, which extends `Error`.

The chunk was not generated because the generator stopped, which happens while the server
shuts down.

### `PRISMARINE_INCOMPLETE_ADDED_DIMENSION`

`dimensions['{id}'] adds a dimension {preset} lacks, so it needs {missing}`

Thrown as `PrismarineWorldErrors.IncompleteAddedDimension`, which extends `Error`.

`config.json` adds a dimension the world's preset does not have, without the fields a new
dimension needs. The message names them.

### `PRISMARINE_INVALID_ACTOR_DIGEST`

`An actor digest is a whole number of 8 byte ids, got {byteLength} bytes`

Thrown as `PrismarineWorldErrors.InvalidActorDigest`, which extends `RangeError`.

A chunk's list of entities is not a whole number of entity ids. The world on disk is damaged,
or was written by a tool that writes the format differently; open it in the game to let it
repair what it can, or restore a backup.

### `PRISMARINE_INVALID_ACTOR_ID`

`An actor id is 8 bytes, got {byteLength}`

Thrown as `PrismarineWorldErrors.InvalidActorId`, which extends `RangeError`.

An entity id written to the world is not 8 bytes. This is a bug in the server; report it with
the stack trace.

### `PRISMARINE_INVALID_ACTOR_MIGRATION`

`Pending actor migration data is not an array`

Thrown as `PrismarineWorldErrors.InvalidActorMigration`, which extends `Error`.

The world's pending entity migration record is damaged. Restore the world from a backup taken
before the error.

### `PRISMARINE_INVALID_BIOME_PALETTE_COUNT`

`Biome palette declares {uniformSize} entries`

Thrown as `PrismarineWorldErrors.InvalidBiomePaletteCount`, which extends `Error`.

A chunk's biome data declares an impossible number of biomes. The world on disk is damaged,
or was written by a tool that writes the format differently; open it in the game to let it
repair what it can, or restore a backup.

### `PRISMARINE_INVALID_BIOME_PALETTE_SIZE`

`Invalid biome palette size {paletteSize}`

Thrown as `PrismarineWorldErrors.InvalidBiomePaletteSize`, which extends `Error`.

Biome data holds an impossible number of biomes. The world on disk is damaged, or was written
by a tool that writes the format differently; open it in the game to let it repair what it
can, or restore a backup.

### `PRISMARINE_INVALID_BIOME_PALETTE_WIDTH`

`Biome palette declares {bitsPerBlock} bits per block`

Thrown as `PrismarineWorldErrors.InvalidBiomePaletteWidth`, which extends `Error`.

A chunk's biome data declares a storage width Bedrock does not use. The world on disk is
damaged, or was written by a tool that writes the format differently; open it in the game to
let it repair what it can, or restore a backup.

### `PRISMARINE_INVALID_LEGACY_WORLD_GEN_SETTINGS`

`worldGenSettings needs a seed string and a dimensions object`

Thrown as `PrismarineWorldErrors.InvalidLegacyWorldGenSettings`, which extends `Error`.

A world saved by an older version of JSPrismarine has malformed generation settings. Restore
it from a backup taken before the error.

### `PRISMARINE_INVALID_LEVEL_NAME`

`Invalid level-name`

Thrown as `PrismarineWorldErrors.InvalidLevelName`, which extends `Error`.

`level-name` in `config.json` is empty or names no world in `worlds`. Set it to one of the
worlds.

### `PRISMARINE_INVALID_MINECRAFT_CATALOG_VERSION`

`Invalid Minecraft catalog version: {minecraftVersion}`

Thrown as `PrismarineWorldErrors.InvalidMinecraftCatalogVersion`, which extends `Error`.

The block catalog's Minecraft version is not a version number. The generated block data is
damaged; regenerate it.

### `PRISMARINE_INVALID_REPLAY_SNAPSHOT_ENTRY`

`Invalid LevelDB replay snapshot entry`

Thrown as `PrismarineWorldErrors.InvalidReplaySnapshotEntry`, which extends `TypeError`.

A replay's world snapshot does not have the shape the server writes, so the replay is
damaged.

### `PRISMARINE_INVALID_REPLAY_SNAPSHOT_FILES`

`Invalid LevelDB replay snapshot files`

Thrown as `PrismarineWorldErrors.InvalidReplaySnapshotFiles`, which extends `TypeError`.

A replay's world snapshot does not have the shape the server writes, so the replay is
damaged.

### `PRISMARINE_INVALID_REPLAY_SNAPSHOT_JSON`

`Invalid LevelDB replay snapshot JSON`

Thrown as `PrismarineWorldErrors.InvalidReplaySnapshotJson`, which extends `TypeError`.

A replay's world snapshot does not have the shape the server writes, so the replay is
damaged.

### `PRISMARINE_INVALID_REPLAY_SNAPSHOT_LEVEL_DAT`

`Invalid LevelDB replay snapshot level.dat`

Thrown as `PrismarineWorldErrors.InvalidReplaySnapshotLevelDat`, which extends `TypeError`.

A replay's world snapshot does not have the shape the server writes, so the replay is
damaged.

### `PRISMARINE_INVALID_REPLAY_SNAPSHOT_PLAYER_DATA`

`Invalid LevelDB replay snapshot player data`

Thrown as `PrismarineWorldErrors.InvalidReplaySnapshotPlayerData`, which extends `TypeError`.

A replay's world snapshot does not have the shape the server writes, so the replay is
damaged.

### `PRISMARINE_INVALID_SUB_CHUNK_PALETTE_SIZE`

`Sub chunk storage declares a palette of {paletteSize} entries`

Thrown as `PrismarineWorldErrors.InvalidSubChunkPaletteSize`, which extends `Error`.

A sub-chunk declares an impossible number of palette entries. The world on disk is damaged,
or was written by a tool that writes the format differently; open it in the game to let it
repair what it can, or restore a backup.

### `PRISMARINE_INVALID_SUB_CHUNK_WIDTH`

`Sub chunk storage declares {bitsPerBlock} bits per block`

Thrown as `PrismarineWorldErrors.InvalidSubChunkWidth`, which extends `Error`.

A sub-chunk declares a storage width Bedrock does not use. The world on disk is damaged, or
was written by a tool that writes the format differently; open it in the game to let it
repair what it can, or restore a backup.

### `PRISMARINE_INVALID_SUBCHUNK_HEIGHT`

`Invalid subchunk height: {y}`

Thrown as `PrismarineWorldErrors.InvalidSubchunkHeight`, which extends `RangeError`.

Code asked for a sub-chunk outside the dimension's height range. This is a bug in the server;
report it with the stack trace.

### `PRISMARINE_INVALID_WORLD_CONFIG`

`Invalid world data`

Thrown as `PrismarineWorldErrors.InvalidWorldConfig`, which extends `Error`.

A world's entry in `config.json` is not an object with the fields a world needs.

### `PRISMARINE_JAVA_DATA_DOWNGRADE`

`the world {level} was saved with Java data version {stored}, newer than Java {release} ({dataVersion}); run that release or a newer one`

Thrown as `PrismarineWorldErrors.JavaDataDowngrade`, which extends `Error`.

The world's `level.dat` records a Java data version newer than the one the server runs, so
an older Java release would read chunks and data written by a newer one. Java has no
downgrade path, and neither does the server. Run the release the world was saved with, by
setting `content-java-version`, or start the server on another world.

### `PRISMARINE_LEGACY_ENTITY_SNAPSHOTS_ARE_INVALID`

`Legacy entity snapshots are invalid`

Thrown as `PrismarineWorldErrors.LegacyEntitySnapshotsAreInvalid`, which extends `Error`.

A world saved by an older version of JSPrismarine has malformed data the server cannot
migrate. Restore the world from a backup taken before the error.

### `PRISMARINE_LEGACY_ENTITY_SNAPSHOTS_CONTAIN_INVALID_ENTRIES`

`Legacy entity snapshots contain invalid entries`

Thrown as `PrismarineWorldErrors.LegacyEntitySnapshotsContainInvalidEntries`, which extends `Error`.

A world saved by an older version of JSPrismarine has malformed data the server cannot
migrate. Restore the world from a backup taken before the error.

### `PRISMARINE_LEGACY_GAME_RULES_ARE_INVALID`

`Legacy game rules are invalid`

Thrown as `PrismarineWorldErrors.LegacyGameRulesAreInvalid`, which extends `Error`.

A world saved by an older version of JSPrismarine has malformed data the server cannot
migrate. Restore the world from a backup taken before the error.

### `PRISMARINE_LEGACY_GAME_RULES_CONTAIN_INVALID_ENTRIES`

`Legacy game rules contain invalid entries`

Thrown as `PrismarineWorldErrors.LegacyGameRulesContainInvalidEntries`, which extends `Error`.

A world saved by an older version of JSPrismarine has malformed data the server cannot
migrate. Restore the world from a backup taken before the error.

### `PRISMARINE_LEGACY_SPAWN_POSITION_IS_INVALID`

`Legacy spawn position is invalid`

Thrown as `PrismarineWorldErrors.LegacySpawnPositionIsInvalid`, which extends `Error`.

A world saved by an older version of JSPrismarine has malformed data the server cannot
migrate. Restore the world from a backup taken before the error.

### `PRISMARINE_LEGACY_WEATHER_IS_INVALID`

`Legacy weather is invalid`

Thrown as `PrismarineWorldErrors.LegacyWeatherIsInvalid`, which extends `Error`.

A world saved by an older version of JSPrismarine has malformed data the server cannot
migrate. Restore the world from a backup taken before the error.

### `PRISMARINE_LEGACY_WORLD_DATA_MUST_BE_OBJECT`

`Legacy world data must be an object`

Thrown as `PrismarineWorldErrors.LegacyWorldDataMustBeObject`, which extends `Error`.

A world saved by an older version of JSPrismarine has malformed data the server cannot
migrate. Restore the world from a backup taken before the error.

### `PRISMARINE_LEVEL_DAT_SIZE_MISMATCH`

`level.dat declares {declared} bytes of payload but carries {byteLength}`

Thrown as `PrismarineWorldErrors.LevelDatSizeMismatch`, which extends `Error`.

The world's `level.dat` is shorter or longer than its header says, so it was cut short or
edited. Restore it from `level.dat_old` or a backup.

### `PRISMARINE_LEVEL_DAT_TRUNCATED`

`level.dat is {byteLength} bytes, the header alone is {headerBytes}`

Thrown as `PrismarineWorldErrors.LevelDatTruncated`, which extends `Error`.

The world's `level.dat` is shorter than its header, so it was cut short. Restore it from
`level.dat_old` or a backup.

### `PRISMARINE_LEVEL_HAS_NO_OVERWORLD`

`Level {name} has no {overworldStemId} stem; Bedrock's spawn and clock live there`

Thrown as `PrismarineWorldErrors.LevelHasNoOverworld`, which extends `Error`.

The world has no overworld, where Bedrock keeps the spawn point and the clock. Add one to its
dimensions.

### `PRISMARINE_LEVEL_NOT_OPENED`

`Level {name} is not enabled, so it cannot build {dimensionId}`

Thrown as `PrismarineWorldErrors.LevelNotOpened`, which extends `Error`.

A dimension was built before its world was opened. This is a bug in the server; report it
with the stack trace.

### `PRISMARINE_LEVEL_WITHOUT_OVERWORLD`

`Level {defaultName} built no {overworldStemId} world`

Thrown as `PrismarineWorldErrors.LevelWithoutOverworld`, which extends `Error`.

The world loaded without an overworld, which every world needs. Check its dimensions in
`config.json`.

### `PRISMARINE_LOWEST_BIOME_SECTION_INHERITS`

`The first biome section cannot inherit from below`

Thrown as `PrismarineWorldErrors.LowestBiomeSectionInherits`, which extends `Error`.

A chunk's lowest biome section claims to copy the one below it. The world on disk is damaged,
or was written by a tool that writes the format differently; open it in the game to let it
repair what it can, or restore a backup.

### `PRISMARINE_MISSING_BIOME_PALETTE_HEADER`

`Expected a network biome palette header, got {header}`

Thrown as `PrismarineWorldErrors.MissingBiomePaletteHeader`, which extends `Error`.

Biome data being read for the network does not start with a palette header. This is a bug in
the server; report it with the stack trace.

### `PRISMARINE_NO_OPEN_TICK`

`Cannot {action} a tick: none is open`

Thrown as `PrismarineWorldErrors.NoOpenTick`, which extends `ChangeLogError`.

A change was recorded outside any tick. The change log was used out of order. This is a bug
in the server; report it with the stack trace.

### `PRISMARINE_NO_WORLD_IN_DIMENSION`

`no {dimension} world is loaded, so it cannot be read or written`

Thrown as `PrismarineWorldErrors.NoWorldInDimension`, which extends `Error`.

Content acted in a dimension that has no loaded world.

### `PRISMARINE_PLAYER_DATA_PATH_ESCAPES`

`Player data for {key} would leave {folder}`

Thrown as `PrismarineWorldErrors.PlayerDataPathEscapes`, which extends `Error`.

A player's data file name would resolve outside the player data folder, so it is refused.

### `PRISMARINE_PLAYER_DATA_PATH_NOT_FOLDER`

`Cannot restore replay player data into a non-directory path`

Thrown as `PrismarineWorldErrors.PlayerDataPathNotFolder`, which extends `Error`.

Restoring a replay found a file where the player data folder belongs. Remove it and run the
replay again.

### `PRISMARINE_PLAYER_DATA_SAVE_AFTER_CLOSE`

`Cannot save replay player data for {key} after level {levelName} closed`

Thrown as `PrismarineWorldErrors.PlayerDataSaveAfterClose`, which extends `Error`.

A player's data was saved after the world closed, such as a player who left during shutdown.

### `PRISMARINE_POSITION_WITHOUT_WORLD`

`A Position requires the world it is in`

Thrown as `PrismarineWorldErrors.PositionWithoutWorld`, which extends `Error`.

A position was created without its world. This is a bug in the server; report it with the
stack trace.

### `PRISMARINE_PROVIDER_CANNOT_CAPTURE_REPLAY`

`Provider '{name}' cannot capture replay snapshots`

Thrown as `PrismarineWorldErrors.ProviderCannotCaptureReplay`, which extends `Error`.

The world storage provider cannot capture the snapshot a replay starts from. Record replays
with a provider that can.

### `PRISMARINE_REPLAY_LEVEL_MISMATCH`

`Replay manifest does not match this level's current initial state`

Thrown as `PrismarineWorldErrors.ReplayLevelMismatch`, which extends `Error`.

A replay was started on a world whose dimensions or settings differ from the recording's.

### `PRISMARINE_RESTORE_INTO_OPEN_WORLD`

`Cannot restore a replay snapshot while the LevelDB provider is enabled`

Thrown as `PrismarineWorldErrors.RestoreIntoOpenWorld`, which extends `Error`.

A replay snapshot was restored into a world that is open. Restore it before the world opens.

### `PRISMARINE_REVERT_CLOSED_SPAN`

`Only an open span can be reverted`

Thrown as `PrismarineWorldErrors.RevertClosedSpan`, which extends `ChangeLogError`.

A change span was undone after it closed. The change log was used out of order. This is a bug
in the server; report it with the stack trace.

### `PRISMARINE_REVERT_PAST_CHUNK_ENTRY`

`Cannot revert a span past the chunk entry at tick {tick}, sequence {sequence}`

Thrown as `PrismarineWorldErrors.RevertPastChunkEntry`, which extends `ChangeLogError`.

A change could not be undone because the chunk it touched was unloaded since. This is a bug
in the server; report it with the stack trace.

### `PRISMARINE_RUNTIME_ID_STORAGE_ON_DISK`

`Sub chunk storage is marked as holding runtime ids, which never appears on disk`

Thrown as `PrismarineWorldErrors.RuntimeIdStorageOnDisk`, which extends `Error`.

A sub-chunk on disk uses the network form of block storage, which the game never saves. The
world on disk is damaged, or was written by a tool that writes the format differently; open
it in the game to let it repair what it can, or restore a backup.

### `PRISMARINE_SAVE_PASS_COMMITTED`

`This save pass has already committed`

Thrown as `PrismarineWorldErrors.SavePassCommitted`, which extends `Error`.

A world save was written to after it finished. This is a bug in the server; report it with
the stack trace.

### `PRISMARINE_SAVED_BIOME_OUT_OF_PALETTE`

`Biome {i} refers to palette entry {paletteIndex} of {paletteSize}`

Thrown as `PrismarineWorldErrors.SavedBiomeOutOfPalette`, which extends `Error`.

A chunk's biome data points past its palette. The world on disk is damaged, or was written by
a tool that writes the format differently; open it in the game to let it repair what it can,
or restore a backup.

### `PRISMARINE_SAVED_BLOCK_OUT_OF_PALETTE`

`Block {index} refers to palette entry {paletteIndex} of {paletteSize}`

Thrown as `PrismarineWorldErrors.SavedBlockOutOfPalette`, which extends `Error`.

A sub-chunk's block data points past its palette. The world on disk is damaged, or was
written by a tool that writes the format differently; open it in the game to let it repair
what it can, or restore a backup.

### `PRISMARINE_SEAL_WITH_OPEN_SPANS`

`Cannot seal tick {tick}: {spansCount} span(s) still open`

Thrown as `PrismarineWorldErrors.SealWithOpenSpans`, which extends `ChangeLogError`.

A tick ended while some of its changes were still being recorded. The change log was used out
of order. This is a bug in the server; report it with the stack trace.

### `PRISMARINE_SECOND_LAYER_IN_VERSION_ONE`

`Sub chunk version 1 holds a single layer, so a second one would be lost`

Thrown as `PrismarineWorldErrors.SecondLayerInVersionOne`, which extends `Error`.

A sub-chunk with a second block layer, such as waterlogged blocks, was saved in a format that
holds one. This is a bug in the server; report it with the stack trace.

### `PRISMARINE_SPAN_CLOSED_OUT_OF_ORDER`

`Only the innermost open span can be closed`

Thrown as `PrismarineWorldErrors.SpanClosedOutOfOrder`, which extends `ChangeLogError`.

A change span was closed before the spans opened inside it. The change log was used out of
order. This is a bug in the server; report it with the stack trace.

### `PRISMARINE_SPAWN_NOT_FOUND_YET`

`the {dimension} world has not found its spawn point yet`

Thrown as `PrismarineWorldErrors.SpawnNotFoundYet`, which extends `Error`.

Content asked for the spawn point before the world finished finding one, such as right after
it was created.

### `PRISMARINE_SUB_CHUNK_BIOME_COUNT_MISMATCH`

`A sub chunk holds {blocksPerSubchunk} biomes, got {idsCount}`

Thrown as `PrismarineWorldErrors.SubChunkBiomeCountMismatch`, which extends `RangeError`.

A sub-chunk's biomes were set from a list of the wrong length. This is a bug in the server;
report it with the stack trace.

### `PRISMARINE_SUB_CHUNK_OUT_OF_RANGE`

`Invalid subchunk height: {y}`

Thrown as `PrismarineWorldErrors.SubChunkOutOfRange`, which extends `Error`.

Code asked for a sub-chunk outside the dimension's height range. This is a bug in the server;
report it with the stack trace.

### `PRISMARINE_SUB_CHUNK_PALETTE_FULL`

`A sub chunk palette holds at most {maxPaletteSize} entries`

Thrown as `PrismarineWorldErrors.SubChunkPaletteFull`, which extends `RangeError`.

A sub-chunk would hold more different blocks than one sub-chunk can. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_TICK_IS_STILL_OPEN`

`Tick {tick} is still open`

Thrown as `PrismarineWorldErrors.TickIsStillOpen`, which extends `ChangeLogError`.

A tick began while the previous one was still open. The change log was used out of order.
This is a bug in the server; report it with the stack trace.

### `PRISMARINE_TICK_OUT_OF_SEQUENCE`

`Tick {tick} does not follow tick {lastBegun}`

Thrown as `PrismarineWorldErrors.TickOutOfSequence`, which extends `ChangeLogError`.

A tick began that is not the one after the last. The change log was used out of order. This
is a bug in the server; report it with the stack trace.

### `PRISMARINE_TICK_SEALED`

`Cannot {action} tick {lastBegun}: it is sealed`

Thrown as `PrismarineWorldErrors.TickSealed`, which extends `ChangeLogError`.

A change was recorded into a tick that had already ended. The change log was used out of
order. This is a bug in the server; report it with the stack trace.

### `PRISMARINE_UNCAPTURABLE_PLAYER_DATA_ENTRY`

`Cannot capture unsupported replay player data entry '{name}'`

Thrown as `PrismarineWorldErrors.UncapturablePlayerDataEntry`, which extends `Error`.

The player data folder holds a file the replay snapshot cannot capture, such as a folder or a
link. Remove it before recording.

### `PRISMARINE_UNDO_IN_UNLOADED_CHUNK`

`Cannot undo the {field} at {x}, {y}, {z}: its chunk left`

Thrown as `PrismarineWorldErrors.UndoInUnloadedChunk`, which extends `Error`.

A change could not be undone because its chunk was unloaded since. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_UNKNOWN_BLOCK`

`No block state schema registered for {name}`

Thrown as `PrismarineWorldErrors.UnknownBlock`, which extends `Error`.

Code asked for the states of a block the registry does not have, usually a block a plugin or
pack added that is no longer loaded.

### `PRISMARINE_UNKNOWN_BLOCK_STATE`

`No block state registered for {name} with {states}`

Thrown as `PrismarineWorldErrors.UnknownBlockState`, which extends `Error`.

Code set a block in a state the block registry does not have.

### `PRISMARINE_UNKNOWN_CATALOG_BLOCK`

`this server's block catalog has no {identifier} in state {states}`

Thrown as `PrismarineWorldErrors.UnknownCatalogBlock`, which extends `Error`.

Content placed a block in a state the server's block catalog does not have, usually a pack
that names a state of a newer Minecraft.

### `PRISMARINE_UNKNOWN_CONFIG_DIMENSION_TYPE`

`The {id} dimension names the dimension type {type}, which no pack defines`

Thrown as `PrismarineWorldErrors.UnknownConfigDimensionType`, which extends `Error`.

A dimension in `config.json` names a dimension type no loaded pack defines. Check the name,
or load the datapack that defines it.

### `PRISMARINE_UNKNOWN_DIMENSION_TYPE`

`The {id} stem of level {name} names the dimension type {type}, which is not loaded`

Thrown as `PrismarineWorldErrors.UnknownDimensionType`, which extends `Error`.

A dimension names a dimension type no loaded pack defines. Check the name, or load the
datapack that defines it.

### `PRISMARINE_UNKNOWN_GENERATED_BLOCK`

`invalid block with id {name}`

Thrown as `PrismarineWorldErrors.UnknownGeneratedBlock`, which extends `Error`.

A world generator placed a block the server's content does not define. Check the generator's
settings and the loaded packs.

### `PRISMARINE_UNKNOWN_GENERATOR_KIND`

`Unknown generator kind {kind}. Registered kinds: {kinds}`

Thrown as `PrismarineWorldErrors.UnknownGeneratorKind`, which extends `Error`.

A world names a generator nothing registered. The message lists the ones that are.

### `PRISMARINE_UNKNOWN_LEVEL_DIMENSION`

`Level {name} has no {dimensionId} dimension. It has: {stems}`

Thrown as `PrismarineWorldErrors.UnknownLevelDimension`, which extends `Error`.

Code asked for a dimension the world does not have. The message lists the ones it has.

### `PRISMARINE_UNKNOWN_RUNTIME_ID`

`Chunk holds runtime id {runtimeId}, which no registered block produces`

Thrown as `PrismarineWorldErrors.UnknownRuntimeId`, which extends `Error`.

A loaded chunk holds a block id no registered block has. This is a bug in the server; report
it with the stack trace.

### `PRISMARINE_UNKNOWN_SAVED_BLOCK`

`No block named {name}, held at {x} {y} {z} in world {name2}`

Thrown as `PrismarineWorldErrors.UnknownSavedBlock`, which extends `Error`.

The world holds a block the server's content does not define, usually one a plugin or pack
added that is no longer loaded. Load it again, or remove the block.

### `PRISMARINE_UNKNOWN_SCOREBOARD_PARTICIPANT`

`No scoreboard participant has the id {participant}`

Thrown as `PrismarineWorldErrors.UnknownScoreboardParticipant`, which extends `RangeError`.

Code asked the scoreboard for a participant by an id the scoreboard never gave out, or one it
has since removed. Look a participant up by its entity or fake player name instead, or check
that the id came from this world's scoreboard.

### `PRISMARINE_UNKNOWN_WORLD_PRESET`

`Unknown world preset {preset}. Known presets: {presets}`

Thrown as `PrismarineWorldErrors.UnknownWorldPreset`, which extends `Error`.

A world in `config.json` names a preset that does not exist. The message lists the ones that
do.

### `PRISMARINE_UNKNOWN_WORLD_PROVIDER`

`Unknown world provider '{provider}' for world '{folderName}'. Available providers: {providers}.`

Thrown as `PrismarineWorldErrors.UnknownWorldProvider`, which extends `Error`.

A world in `config.json` names a storage provider that does not exist. The message lists the
ones that do.

### `PRISMARINE_UNMOVABLE_BLOCK`

`this server's block catalog cannot move {name} at {x}, {y}, {z}`

Thrown as `PrismarineWorldErrors.UnmovableBlock`, which extends `Error`.

Content tried to move a block, such as with a piston, that the block catalog cannot represent
as moving.

### `PRISMARINE_UNNAMED_PALETTE_ENTRY`

`Palette entry has no name`

Thrown as `PrismarineWorldErrors.UnnamedPaletteEntry`, which extends `Error`.

A sub-chunk's palette has a block without a name. The world on disk is damaged, or was
written by a tool that writes the format differently; open it in the game to let it repair
what it can, or restore a backup.

### `PRISMARINE_UNRESOLVED_DIMENSION_TYPE`

`The {dimensionId} stem of level {name} has no resolved type`

Thrown as `PrismarineWorldErrors.UnresolvedDimensionType`, which extends `Error`.

A dimension was built before its dimension type was loaded. This is a bug in the server;
report it with the stack trace.

### `PRISMARINE_UNSAVABLE_RUNTIME_ID`

`Cannot write runtime id {runtimeId}: no registered block produces it`

Thrown as `PrismarineWorldErrors.UnsavableRuntimeId`, which extends `Error`.

A chunk holds a block id no registered block has, so it cannot be saved. This is a bug in the
server; report it with the stack trace.

### `PRISMARINE_UNSUPPORTED_BIOME_PALETTE_WIDTH`

`Unsupported biome palette width {bitsPerBlock}`

Thrown as `PrismarineWorldErrors.UnsupportedBiomePaletteWidth`, which extends `Error`.

Biome data uses a storage width Bedrock does not use. The world on disk is damaged, or was
written by a tool that writes the format differently; open it in the game to let it repair
what it can, or restore a backup.

### `PRISMARINE_UNSUPPORTED_REPLAY_SNAPSHOT`

`Unsupported or invalid LevelDB replay snapshot`

Thrown as `PrismarineWorldErrors.UnsupportedReplaySnapshot`, which extends `TypeError`.

A replay's world snapshot was written by a different version of the server, or is damaged.

### `PRISMARINE_UNSUPPORTED_SUB_CHUNK_VERSION`

`Unsupported sub chunk version {version}`

Thrown as `PrismarineWorldErrors.UnsupportedSubChunkVersion`, which extends `Error`.

A sub-chunk uses a format version this server does not read, such as one from a much older or
newer game.

### `PRISMARINE_WORLD_ALREADY_LOADED`

`World {folderName} has already been loaded`

Thrown as `PrismarineWorldErrors.WorldAlreadyLoaded`, which extends `Error`.

A world was loaded twice.

### `PRISMARINE_WORLD_MESSAGES_UNSETTLED`

`{pendingCount} world message(s) were still being filed after {drainPasses} passes`

Thrown as `PrismarineWorldErrors.WorldMessagesUnsettled`, which extends `Error`.

Messages between parts of the world kept producing more, so a tick never settled. This is a
bug in the server; report it with the stack trace.

### `PRISMARINE_WORLD_STORAGE_CLOSED`

`The world provider is not enabled`

Thrown as `PrismarineWorldErrors.WorldStorageClosed`, which extends `Error`.

The world's storage was used before it opened or after it closed.
<!-- /fact -->
