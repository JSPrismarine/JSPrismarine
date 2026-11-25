---
'@jsprismarine/prismarine': patch
---

The server checks for a newer JSPrismarine. A minute after it starts, and then every `updates.interval` minutes, it reads the update feed for its channel, `release` or `nightly`, from `https://jsprismarine.dev/updates/v1/` or the `owner/repo` or URL in `updates.source`. A newer build is logged once and sent in chat to players who hold `jsprismarine.updates.notify`, which operators hold through `*`; a player who holds it and joins later hears about it after spawning, and `/version` shows the last check's result. A server run from a checkout doesn't check or load the checker unless `updates.enabled` is `true`, and `JSP_UPDATE_CHECK=0`, `CI` and the test runner turn checks off. `config.json` gains an empty `updates` section with a comment naming its keys. `BuildDefines` gains `updateSource`, the feed a fork's executables read.
