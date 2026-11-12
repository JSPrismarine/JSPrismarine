---
'@jsprismarine/prismarine': minor
'@jsprismarine/server': patch
---

The server now reports usage statistics to [bStats](https://bstats.org), embedded servers included. The start that adds the bStats settings to `config.json` logs a notice saying how to turn reporting off. A report holds a random server UUID, a description of the host, and counts and labels about the server and its online players, never player names, account IDs, chat or world data. The [usage statistics guide](https://github.com/JSPrismarine/JSPrismarine/blob/master/docs/guide/usage-statistics.md) lists everything a report holds, the new `config.json` settings and every way to turn reporting off.

The numbers come from a stats registry that providers read, and bStats is the first provider. A program that embeds `@jsprismarine/prismarine` can pass its own providers in the new `statsProviders` option of `Server`. [Extending](https://github.com/JSPrismarine/JSPrismarine/blob/master/docs/guide/extending.md) lists the entry points that export the types a provider uses.

Breaking: `TransportConnection` has a new required `transport` field naming the transport that carried the connection. A program with its own `TransportConnection` implementation must set it.
