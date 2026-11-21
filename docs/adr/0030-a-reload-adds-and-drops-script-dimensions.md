# A reload adds and drops script dimensions

Status: accepted

Bedrock Dedicated Server takes a custom dimension from `StartupEvent.dimensionRegistry` only in a
world's first run. A `/reload` that registers a new one throws
`CustomDimensionReloadNewDimensionError` ("Please exit and rejoin your world"), and one the reload no
longer registers stays until the server restarts, as the `custom-dimensions` parity scenario
recorded. An addon that manages worlds, such as Multiverse, then cannot open or close a world
without a restart.

JSPrismarine follows the registrations of the latest run instead. A reload adds each new dimension
and sends `DimensionData` to the players already in the level, since a client learns a level's
custom dimensions as it joins. It drops each script dimension the run no longer registers, after
saving its world, unless players are still in it, which keeps it until a later run drops it while
it is empty.

## Consequences

- A script dimension's Bedrock id comes from the level's record, not from registration order. Its
  chunks are filed under that id, and a dimension that registers in another order, or after others
  were dropped, would otherwise read another dimension's chunks. The dimension numbers of
  [ADR 0029](0029-worlds-are-levels-the-server-manages.md) keep every id a dimension was given, a
  dropped script dimension's included, and give none of them to another.
- The `custom-dimensions` scenario's second run differs from the golden on purpose: the new
  dimension registers and exists, and the dimension the reload left out is gone.
- Whether the official client takes a second `DimensionData` once it is in the world has not been
  checked. cinnabar takes it.
