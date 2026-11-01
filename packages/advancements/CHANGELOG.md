# @jsprismarine/advancements

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

### Patch Changes

- Updated dependencies [[`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d)]:
  - @jsprismarine/predicates@0.17.0

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d6c235d`](https://github.com/JSPrismarine/JSPrismarine/commit/d6c235da420d30ee681ea6c74fc229e2307bedb5) Thanks [@filiphsps](https://github.com/filiphsps)! - Build the content from the pack stack on every server. `config.yaml`'s `content-packs` key and the
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

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`89ab0e0`](https://github.com/JSPrismarine/JSPrismarine/commit/89ab0e0af955bbd8212b9761f044507da2d42dff) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/advancements`, the Java Edition advancement engine. It parses the 26.3 file
  shape (`parent`, `display`, `criteria`, `requirements`, `rewards`, `sends_telemetry_event`), links
  the parent tree with cycle detection reported as a diagnostic, and evaluates the conjunctive normal
  form in `requirements`, including the default Java derives for a file that writes none. All 58
  trigger types in `minecraft:trigger_type` are implemented, read out of the pinned 26.3 server jar
  rather than from memory: the registry report for the ids, and the `TriggerInstance` records for
  each one's fields. The 58 ids share 29 Java instance shapes, so the ids that read the same JSON
  share one parser, and every condition inside a criterion compiles through
  `@jsprismarine/predicates` instead of being reimplemented. Per-player progress records completed
  criteria with their instants, derives completion from the advancement's current requirements rather
  than a stored flag, and serializes to a plain JSON shape. Rewards reach a host through four
  injected hooks, with the function hook left for `@jsprismarine/mcfunction`. Criteria are indexed by
  trigger, and the four triggers whose event names a registry element are indexed by that element as
  well, which is what keeps the recipe-unlock path cheap: a `recipe_unlocked` event evaluates one
  criterion against the full vanilla corpus, where a scan would touch 1739. A gated corpus test
  parses all 1866 vanilla advancements with zero diagnostics and pins the counts: 4045 criteria, 54
  of the 58 triggers used, 30 of those exactly once, 6 roots and no parent cycle.
- Updated dependencies [[`1e9ada2`](https://github.com/JSPrismarine/JSPrismarine/commit/1e9ada27d7fd15b209521870328a5257440ee4a7), [`d42e7c3`](https://github.com/JSPrismarine/JSPrismarine/commit/d42e7c33d23361c5b159078ae6635a230ff70701), [`33c3920`](https://github.com/JSPrismarine/JSPrismarine/commit/33c39204cf625a581b63f3f133bfc68f7adb6510), [`815800d`](https://github.com/JSPrismarine/JSPrismarine/commit/815800d3410bfd829fc583eb9bcd896369812247)]:
  - @jsprismarine/predicates@0.16.0
