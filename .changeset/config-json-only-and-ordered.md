---
'@jsprismarine/prismarine': minor
---

The server config is one `config.json`, written in definition order, and YAML configs are gone.

Three config bugs had the same root: the content settings (`content-strict`,
`content-world-packs`, `content-datapacks`) lived in a `config.yaml` of their own, which the
server then mistook for a legacy config and converted, so `config.json` began with the content
keys, `$schema` landed last, and a `config.yaml` always sat beside the file. The content keys now
live in `config.json` with everything else, and a new key is inserted where the definition says
it goes - `$schema` first - no matter which part of the server writes it first. Existing files
are never reordered.

Reading `config.yml` and `config.yaml` is removed, along with the `yaml` dependency. A server
that finds one refuses to start and says to move the settings into `config.json` and delete the
file, rather than silently running on defaults or ignoring the file. `ConfigBuilder` now accepts
only `.json` paths and its `getType()` is gone; `parseConfigDocument` takes the text alone, and
`ConfigSyntaxError` no longer names a format.
