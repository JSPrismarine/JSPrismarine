---
'@jsprismarine/prismarine': minor
'@jsprismarine/advancements': minor
---

Build the content from the pack stack on every server. `config.yaml`'s `content-packs` key and the
`JSP_CONTENT` environment override are gone, and with them every branch that asked whether a build
exists. `Server.getContent()` and `Server.getContentWorld()` return a value instead of
`undefined`, `Server.getEntityRuntime(dimension)` returns that dimension's runtime, and
`Server.setContent` takes a build rather than a build or nothing. A stack that will not load now
stops the server at startup, because there is no table left behind it to fall back to.
`content-strict`, `content-world-packs` and `content-datapacks` are unchanged.

`/loot` and `/recipe` are offered unconditionally. `CONTENT_ONLY_COMMANDS` and `unwiredCommands()`
are gone; `UNWIRED_COMMANDS` is the whole list of what this server leaves out, and the command set
is 53 whatever the stack holds. Rolling a table nobody registered still refuses by name.

`AdvancementEngine.listensFor(trigger)` is new, and is what the trigger call sites now check before
building an event. It answers whether any loaded criterion names that trigger, which replaces a
check on whether a content build existed at all with one on what the stack actually declared, so a
stack with no advancements in it costs a damage event nothing.
