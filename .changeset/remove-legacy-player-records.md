---
'@jsprismarine/prismarine': minor
'@jsprismarine/errors': minor
---

A world without player storage in its provider no longer reads or moves a player record still filed under the name it had before player data file names were escaped. Such a record only exists for a player whose name holds `%`, `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|` or a control character. To keep one, rename its file under `playerdata/` to the escaped name, such as `100%.json` to `100%25.json`, before starting the server. Loading a player no longer races a save of another player for that file. `PrismarineWorldErrors.DuplicatePlayerRecord` is gone with the move it guarded.
