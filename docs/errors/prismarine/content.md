---
title: '@jsprismarine/prismarine content errors'
description: The code, message and meaning of every error in the content catalog of @jsprismarine/prismarine.
group: Documents
category: Errors
---

# @jsprismarine/prismarine content errors

These are the errors in the `content` catalog of `@jsprismarine/prismarine`. [The error reference](../README.md) explains how to read an entry, and [the package's page](../prismarine.md) lists its other catalogs and the classes that group its errors.

<!-- fact:errors.page.prismarine.content -->
## `PRISMARINE_CONFIGURED_RANDOM_NOT_RESTORABLE`

`The configured content random source cannot be restored for replay`

Thrown as `PrismarineContentErrors.ConfiguredRandomNotRestorable`, which extends `Error`.

The random source the server was configured with cannot save its state, so replays cannot
restore it. Use the default random source to record replays.

## `PRISMARINE_CONTENT_WORLD_READ_DURING_BUILD`

`the content world was read before the content finished building`

Thrown as `PrismarineContentErrors.ContentWorldReadDuringBuild`, which extends `Error`.

Game content reached into the world before the content finished building. This is a bug in
the server; report it with the stack trace.

## `PRISMARINE_FLAMMABLE_DEFAULTS_REJECTED`

`the minecraft:flammable schema rejected its own defaults`

Thrown as `PrismarineContentErrors.FlammableDefaultsRejected`, which extends `Error`.

The `minecraft:flammable` component's schema refused its own defaults. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_INVALID_CONTENT_RANDOM_STATE_ENTRY`

`Invalid content random state entry`

Thrown as `PrismarineContentErrors.InvalidContentRandomStateEntry`, which extends `TypeError`.

A saved content random state does not have the shape the server writes, so the save or the
replay that holds it is damaged.

## `PRISMARINE_INVALID_CONTENT_RANDOM_STATES`

`Invalid content random states`

Thrown as `PrismarineContentErrors.InvalidContentRandomStates`, which extends `TypeError`.

The saved content random states do not have the shape the server writes, so the save or the
replay that holds it is damaged.

## `PRISMARINE_JAVA_RELEASE_NOT_GENERATED`

`` the Java {release} vanilla datapack is not generated at {path}; run `pnpm --filter @jsprismarine/bedrock-data run datagen:java --java {release}` (pinned releases: {pinned}) ``

Thrown as `PrismarineContentErrors.JavaReleaseNotGenerated`, which extends `Error`.

`content-java-version` names a pinned Java release whose vanilla datapack, or the
`version.json` beside it, is not in the download cache. Generate it with the command the
message gives, or set `content-java-version` to a release that is generated.

## `PRISMARINE_NO_WORLD_TO_PLAY_IN`

`no {dimension} world is loaded, so nothing can be played in it`

Thrown as `PrismarineContentErrors.NoWorldToPlayIn`, which extends `Error`.

Game content tried to act in a dimension that has no loaded world.

## `PRISMARINE_NOT_WIRED`

`{member} is not wired yet; the {area} subsystem owns it`

Thrown as `PrismarineContentErrors.NotWired`, which extends `Error`.

Game content called part of the world the server has not implemented yet. The message names
the part and the subsystem that will provide it.

## `PRISMARINE_RANDOM_SOURCE_NOT_RESTORABLE`

`The {key} content random source cannot be restored for replay`

Thrown as `PrismarineContentErrors.RandomSourceNotRestorable`, which extends `Error`.

One of the content's random sources cannot restore a saved state, so the replay cannot be
reproduced. This is a bug in the server; report it with the stack trace.

## `PRISMARINE_RANDOM_SOURCE_NOT_SAVABLE`

`The {key} content random source cannot be saved for replay`

Thrown as `PrismarineContentErrors.RandomSourceNotSavable`, which extends `Error`.

One of the content's random sources cannot save its state, so the session cannot be recorded
for replay. This is a bug in the server; report it with the stack trace.

## `PRISMARINE_REPLAY_MISSING_RANDOM_STREAMS`

`Replay state has no content random stream for: {missing}`

Thrown as `PrismarineContentErrors.ReplayMissingRandomStreams`, which extends `Error`.

A replay was saved without some of the content's random streams, so it came from a different
version or set of packs.

## `PRISMARINE_UNKNOWN_GAME_RULE`

`{name} is not a game rule of the 26.3 registry`

Thrown as `PrismarineContentErrors.UnknownGameRule`, which extends `Error`.

Code asked for a game rule the Java registry does not have, such as a misspelled name.

## `PRISMARINE_UNKNOWN_JAVA_RELEASE`

`content-java-version names Java {release}, which is not pinned; the pinned releases are {pinned}`

Thrown as `PrismarineContentErrors.UnknownJavaRelease`, which extends `Error`.

`content-java-version` in `config.json` names a Java release that `sources.json` in
`@jsprismarine/bedrock-data` does not pin. Set it to one of the pinned releases the message
lists, or clear it to run the default release.

## `PRISMARINE_UNMAPPED_JAVA_IDENTIFIERS`

`the pack stack references {count} Java identifier(s) with no Bedrock mapping and no reviewed loss entry, first: {id} ({registry}) in pack "{pack}" at {path}`

Thrown as `PrismarineContentErrors.UnmappedJavaIdentifiers`, which extends `Error`.

A strict content build found Java identifiers in the loaded packs with no Bedrock equivalent
and no reviewed loss entry. The error's `unmapped` lists every one; map them, or record why
they are left out.

## `PRISMARINE_WORLD_SOURCE_MEMBER_REPLACED`

`World source member {property} changed from an object`

Thrown as `PrismarineContentErrors.WorldSourceMemberReplaced`, which extends `TypeError`.

Part of the world the content reads was replaced by something that is not an object. This is
a bug in the server; report it with the stack trace.
<!-- /fact -->
