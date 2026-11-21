---
title: '@jsprismarine/prismarine command errors'
description: The code, message and meaning of every error in the command catalog of @jsprismarine/prismarine.
group: Documents
category: Errors
---

# @jsprismarine/prismarine command errors

These are the errors in the `command` catalog of `@jsprismarine/prismarine`. [The error reference](../README.md) explains how to read an entry, and [the package's page](../prismarine.md) lists its other catalogs and the classes that group its errors.

<!-- fact:errors.page.prismarine.command -->
## `PRISMARINE_COMMAND_CANNOT_RUN_FROM_CONSOLE`

`This command can't be run from the console`

Thrown as `PrismarineCommandErrors.CommandCannotRunFromConsole`, which extends `Error`.

The command acts on the player who runs it, so the console cannot run it. Run it in game, or
use `/execute as` with a player.

## `PRISMARINE_DUPLICATE_COMMAND_RANDOM_SEQUENCE_STATE`

`Duplicate command random sequence state: {entry}`

Thrown as `PrismarineCommandErrors.DuplicateCommandRandomSequenceState`, which extends `TypeError`.

The saved random sequences of `/random` list one sequence twice, so the save or the replay
that holds it is damaged.

## `PRISMARINE_INVALID_COMMAND_RANDOM_SEQUENCE_STATE`

`Invalid command random sequence state`

Thrown as `PrismarineCommandErrors.InvalidCommandRandomSequenceState`, which extends `TypeError`.

The saved random sequences of `/random` do not have the shape the server writes, so the save
or the replay that holds it is damaged.

## `PRISMARINE_INVALID_NAMED_COMMAND_RANDOM_SEQUENCE_STATE`

`Invalid named command random sequence state`

Thrown as `PrismarineCommandErrors.InvalidNamedCommandRandomSequenceState`, which extends `TypeError`.

A saved `/random` sequence does not have the shape the server writes, so the save or the
replay that holds it is damaged.

## `PRISMARINE_INVALID_NAMED_RANDOM_STREAM_STATE`

`Invalid {sequence} random stream state`

Thrown as `PrismarineCommandErrors.InvalidNamedRandomStreamState`, which extends `TypeError`.

A saved `/random` sequence's stream does not have the shape the server writes, so the save or
the replay that holds it is damaged.

## `PRISMARINE_INVALID_RANDOM_SEQUENCE_SEED`

`Invalid random sequence seed`

Thrown as `PrismarineCommandErrors.InvalidRandomSequenceSeed`, which extends `TypeError`.

A saved `/random` sequence has a seed that is not a whole number, so the save or the replay
that holds it is damaged.

## `PRISMARINE_INVALID_RANDOM_STREAM_STATE`

`Invalid random stream state`

Thrown as `PrismarineCommandErrors.InvalidRandomStreamState`, which extends `TypeError`.

A saved `/random` stream does not have the shape the server writes, so the save or the replay
that holds it is damaged.

## `PRISMARINE_RETURN_OUTSIDE_FUNCTION`

`/return can only be used inside a function`

Thrown as `PrismarineCommandErrors.ReturnOutsideFunction`, which extends `Error`.

`/return` was run outside an `.mcfunction` file, where it has nothing to return from.

## `PRISMARINE_STARTUP_ONLY_SETTING`

`Config key "{key}" can't be set at runtime`

Thrown as `PrismarineCommandErrors.StartupOnlySetting`, which extends `Error`.

`/debug` was asked to change a setting that only takes effect at startup. Change it in
`config.json` and restart.

## `PRISMARINE_UNCLEAN_SHUTDOWN`

`The server did not shut down cleanly`

Thrown as `PrismarineCommandErrors.UncleanShutdown`, which extends `Error`.

`/stop` or `/reload` asked the server to stop, and part of the shutdown failed. The log
before this line says which part.

## `PRISMARINE_UNKNOWN_CONFIGURED_WORLD`

`No world {data} in config`

Thrown as `PrismarineCommandErrors.UnknownConfiguredWorld`, which extends `Error`.

`/debug` named a world `config.json` does not list.

## `PRISMARINE_UNKNOWN_DEBUG_ACTION`

`Invalid action!`

Thrown as `PrismarineCommandErrors.UnknownDebugAction`, which extends `Error`.

`/debug` was given an action it does not have.

## `PRISMARINE_WORLD_NOT_LOADED`

`No world {data} is loaded`

Thrown as `PrismarineCommandErrors.WorldNotLoaded`, which extends `Error`.

`/debug` named a world that is not loaded.
<!-- /fact -->
