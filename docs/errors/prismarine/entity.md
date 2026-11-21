---
title: '@jsprismarine/prismarine entity errors'
description: The code, message and meaning of every error in the entity catalog of @jsprismarine/prismarine.
group: Documents
category: Errors
---

# @jsprismarine/prismarine entity errors

These are the errors in the `entity` catalog of `@jsprismarine/prismarine`. [The error reference](../README.md) explains how to read an entry, and [the package's page](../prismarine.md) lists its other catalogs and the classes that group its errors.

<!-- fact:errors.page.prismarine.entity -->
## `PRISMARINE_ENTITY_HAS_NO_PLAIN_RECORD`

`{identifier} {id} has no plain record`

Thrown as `PrismarineEntityErrors.EntityHasNoPlainRecord`, which extends `LoggedFieldError`.

An entity could not be recorded as plain data for the change log. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_ENTITY_NOT_IN_DIMENSION`

`{identifier} is not in this dimension's entity index, so it has no actuator`

Thrown as `PrismarineEntityErrors.EntityNotInDimension`, which extends `Error`.

Content acted on an entity that is not in the dimension it was asked of. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_ENTITY_NOT_RESTORED`

`{identifier} {id} could not be added back`

Thrown as `PrismarineEntityErrors.EntityNotRestored`, which extends `LoggedFieldError`.

An entity removed in an undone change could not be restored. This is a bug in the server;
report it with the stack trace.

## `PRISMARINE_ENTITY_RUNTIME_READ_TOO_EARLY`

`the entity runtime was read before the content was built`

Thrown as `PrismarineEntityErrors.EntityRuntimeReadTooEarly`, which extends `Error`.

A test read the entity runtime before its content was built.

## `PRISMARINE_INVALID_HANGING_COMPONENT`

`{hangingComponent} needs a support of wall or fence and a check_interval`

Thrown as `PrismarineEntityErrors.InvalidHangingComponent`, which extends `TypeError`.

A hanging entity's definition lacks its support kind or check interval. The entity data in
the loaded packs is malformed.

## `PRISMARINE_INVALID_LOGGED_FIELD`

`{field} cannot hold {value}`

Thrown as `PrismarineEntityErrors.InvalidLoggedField`, which extends `LoggedFieldError`.

An entity's saved field holds a value of the wrong shape, so the save or the replay that
holds it is damaged.

## `PRISMARINE_INVALID_PLAYER_FIELD`

`{field} cannot hold {value}`

Thrown as `PrismarineEntityErrors.InvalidPlayerField`, which extends `TypeError`.

A player's saved field holds a value of the wrong shape, so the save or the replay that holds
it is damaged.

## `PRISMARINE_INVALID_SAVED_GAME_MODE`

`abilities.gamemode cannot hold {value}`

Thrown as `PrismarineEntityErrors.InvalidSavedGameMode`, which extends `TypeError`.

A player's saved game mode is not one of the game modes, so the save or the replay that holds
it is damaged.

## `PRISMARINE_INVALID_SAVED_MEAL`

`consumption.meal cannot hold {value}`

Thrown as `PrismarineEntityErrors.InvalidSavedMeal`, which extends `TypeError`.

A player's saved eating state holds a value of the wrong shape, so the save or the replay
that holds it is damaged.

## `PRISMARINE_INVALID_SAVED_MERCHANT`

`merchant cannot hold {value}`

Thrown as `PrismarineEntityErrors.InvalidSavedMerchant`, which extends `LoggedFieldError`.

A villager's saved trades hold a value of the wrong shape, so the save or the replay that
holds it is damaged.

## `PRISMARINE_INVALID_SAVED_MINING`

`mining.block cannot hold {value}`

Thrown as `PrismarineEntityErrors.InvalidSavedMining`, which extends `TypeError`.

A player's saved mining state holds a value of the wrong shape, so the save or the replay
that holds it is damaged.

## `PRISMARINE_INVALID_SAVED_SPAWN_POINT`

`respawn.spawnPoint cannot hold {value}`

Thrown as `PrismarineEntityErrors.InvalidSavedSpawnPoint`, which extends `TypeError`.

A player's saved spawn point holds a value of the wrong shape, so the save or the replay that
holds it is damaged.

## `PRISMARINE_ITEM_COMPONENT_FIELD_NOT_NUMBER`

`{itemComponent} needs a number for {key}`

Thrown as `PrismarineEntityErrors.ItemComponentFieldNotNumber`, which extends `TypeError`.

An item entity's tuning component has a field that is not a number. The entity data in the
loaded packs is malformed.

## `PRISMARINE_MEMBERSHIP_ENTRY_HAS_NO_RECORD`

`a membership entry carries no record to add the entity back from`

Thrown as `PrismarineEntityErrors.MembershipEntryHasNoRecord`, which extends `LoggedFieldError`.

An undone removal carries no record to restore the entity from. This is a bug in the server;
report it with the stack trace.

## `PRISMARINE_MERCHANT_HAS_NO_PLAIN_FORM`

`a merchant snapshot has no plain form`

Thrown as `PrismarineEntityErrors.MerchantHasNoPlainForm`, which extends `LoggedFieldError`.

A villager's trades could not be recorded as plain data. This is a bug in the server; report
it with the stack trace.

## `PRISMARINE_MISSING_ITEM_COMPONENT`

`{identifier} has no {itemComponent} component`

Thrown as `PrismarineEntityErrors.MissingItemComponent`, which extends `TypeError`.

An item entity's definition lacks the component that tunes dropped items. The entity data in
the loaded packs is incomplete.

## `PRISMARINE_NO_ENTITY_WRITER`

`No writer knows {addressed}`

Thrown as `PrismarineEntityErrors.NoEntityWriter`, which extends `Error`.

The change log addressed an entity no part of the server holds. This is a bug in the server;
report it with the stack trace.

## `PRISMARINE_NO_FIELD_WRITER`

`no writer for {field}`

Thrown as `PrismarineEntityErrors.NoFieldWriter`, which extends `LoggedFieldError`.

A change to an entity names a field nothing records. This is a bug in the server; report it
with the stack trace.

## `PRISMARINE_NO_WORLD_FOR_ENTITIES`

`no world is loaded, so its entities cannot be read or changed`

Thrown as `PrismarineEntityErrors.NoWorldForEntities`, which extends `Error`.

Content reached for entities while no world is loaded, such as during startup or shutdown.

## `PRISMARINE_RUNTIME_IDS_EXHAUSTED`

`Entity runtime id counter exceeded Number.MAX_SAFE_INTEGER`

Thrown as `PrismarineEntityErrors.RuntimeIdsExhausted`, which extends `RangeError`.

The server handed out so many entity ids that the next would lose precision. Restart the
server.

## `PRISMARINE_STORE_PLAYER_ALREADY_ATTACHED`

`store player {id} is already in a store`

Thrown as `PrismarineEntityErrors.StorePlayerAlreadyAttached`, which extends `Error`.

A player record was attached twice. This is a bug in the server; report it with the stack
trace.

## `PRISMARINE_STORE_PLAYER_ENTITY_MISMATCH`

`store player {id} cannot take entity {entityId}`

Thrown as `PrismarineEntityErrors.StorePlayerEntityMismatch`, which extends `Error`.

A player record was attached to a different entity than its own. This is a bug in the server;
report it with the stack trace.

## `PRISMARINE_UNSUPPORTED_MOB_EFFECT`

`Cannot serialize unsupported mob effect '{id}'`

Thrown as `PrismarineEntityErrors.UnsupportedMobEffect`, which extends `Error`.

An entity has a status effect Bedrock has no id for, so it cannot be saved or sent.

## `PRISMARINE_VALUE_HAS_NO_PLAIN_FORM`

`A logged value has no plain form: {value}`

Thrown as `PrismarineEntityErrors.ValueHasNoPlainForm`, which extends `TypeError`.

A value written to an entity cannot be recorded as plain data, such as a function or a class
instance. This is a bug in the server; report it with the stack trace.
<!-- /fact -->
