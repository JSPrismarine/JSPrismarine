---
title: '@jsprismarine/prismarine stats errors'
description: The code, message and meaning of every error in the stats catalog of @jsprismarine/prismarine.
group: Documents
category: Errors
---

# @jsprismarine/prismarine stats errors

These are the errors in the `stats` catalog of `@jsprismarine/prismarine`. [The error reference](../README.md) explains how to read an entry, and [the package's page](../prismarine.md) lists its other catalogs and the classes that group its errors.

<!-- fact:errors.page.prismarine.stats -->
## `PRISMARINE_BAD_CHART_NAME`

`bStats chart name "{name}" is not snake_case and has no chart ID`

Thrown as `PrismarineStatsErrors.BadChartName`, which extends `Error`.

A bStats chart name is not `snake_case`, so it has no chart ID. This is a bug in the server;
report it with the stack trace.

## `PRISMARINE_BAD_METRIC_NAME`

`Stats metric name "{name}" must be a snake_case namespace and name, such as "jsprismarine:players"`

Thrown as `PrismarineStatsErrors.BadMetricName`, which extends `Error`.

Code registered a stats metric under a name that is not a `snake_case` namespace and name,
such as `jsprismarine:players`. Rename the metric.

## `PRISMARINE_CHART_TAKES_DEFAULT_ID`

`bStats chart name "{name}" maps onto the default chart "{id}"`

Thrown as `PrismarineStatsErrors.ChartTakesDefaultId`, which extends `Error`.

A bStats chart name maps onto a chart ID bStats fills itself. This is a bug in the server;
report it with the stack trace.

## `PRISMARINE_DUPLICATE_METRIC`

`Stats metric "{name}" is already registered`

Thrown as `PrismarineStatsErrors.DuplicateMetric`, which extends `Error`.

Code registered a stats metric under a name another metric already has. Give the metric a
name of its own, or dispose the other registration first.

## `PRISMARINE_SUBMIT_ABANDONED`

`the server stopped`

Thrown as `PrismarineStatsErrors.SubmitAbandoned`, which extends `Error`.

The server stopped while a usage report was in flight, so the report was abandoned. It is
never logged, since the server logs nothing from bStats after it stops.

## `PRISMARINE_SUBMIT_REJECTED`

`bStats answered {status} {statusText}`

Thrown as `PrismarineStatsErrors.SubmitRejected`, which extends `Error`.

bStats answered a usage report with an error status. The report is dropped and the next one
is sent on schedule; it is logged only when `stats.bstats.log-errors` is on.

## `PRISMARINE_SUBMIT_TIMED_OUT`

`no answer within {seconds} seconds`

Thrown as `PrismarineStatsErrors.SubmitTimedOut`, which extends `Error`.

bStats did not answer a usage report in time, so the server gave up on it. The next report is
sent on schedule; it is logged only when `stats.bstats.log-errors` is on.
<!-- /fact -->
