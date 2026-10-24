---
'@jsprismarine/prismarine': minor
---

`ConfigBuilder` keeps the comments and blank lines in a config file when it writes a key, and a key it writes for the first time can carry a comment: `get(key, defaults, comment)` and `set(key, value, comment)`. Reading goes through the new `ConfigDocument` layer (exported too), built on `yaml` and `jsonc-parser`, which edit the file text in place rather than dumping a value over it. A `.json` config may hold `//` and `/* */` comments and trailing commas; JSON5-only syntax such as unquoted keys is no longer accepted. A file that does not parse now raises an error naming the file instead of being treated as empty and overwritten with defaults.
