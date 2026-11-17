---
title: '@jsprismarine/entity-brains errors'
description: The code, message and meaning of every error @jsprismarine/entity-brains throws.
group: Documents
category: Errors
---

# @jsprismarine/entity-brains errors

These are the errors `@jsprismarine/entity-brains` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.entity-brains -->
## `ENTITY_BRAINS_ABSENT_MEMORY`

`{name} read an absent memory: {memoryName}`

Thrown as `EntityBrainsErrors.AbsentMemory`, which extends `Error`.

A behavior read a memory it requires to be present, but the mob does not have it. The
behavior's memory requirements are declared wrongly.

## `ENTITY_BRAINS_DUPLICATE_BRAIN_MOB`

`Duplicate brain mob: {id}`

Thrown as `EntityBrainsErrors.DuplicateBrainMob`, which extends `Error`.

Two brain definitions were registered for the same mob.

## `ENTITY_BRAINS_LOOK_INTERVAL_TOO_SHORT`

`SetEntityLookTargetSometimes needs an interval above 1, got {min}`

Thrown as `EntityBrainsErrors.LookIntervalTooShort`, which extends `Error`.

The behavior counts down its interval before looking, so an interval of 1 or less would never
wait. Give it a larger interval.

## `ENTITY_BRAINS_MIN_PITCH_ABOVE_MAX`

`Minimum pitch is larger than maximum pitch! {minPitch} > {maxPitch}`

Thrown as `EntityBrainsErrors.MinPitchAboveMax`, which extends `Error`.

A behavior was built with a pitch range whose minimum is above its maximum.

## `ENTITY_BRAINS_NO_BRAIN_ATTACHED`

`{type} has no brain attached; call attach() first`

Thrown as `EntityBrainsErrors.NoBrainAttached`, which extends `Error`.

A test mob was ticked before it was given a brain. Call `attach()` first.
<!-- /fact -->
