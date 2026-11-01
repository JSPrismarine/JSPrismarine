# @jsprismarine/content

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

## 0.16.0

### Patch Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d4a2a0b`](https://github.com/JSPrismarine/JSPrismarine/commit/d4a2a0b2787e171583e6db0aec1b750e8aeb1e95) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/content`, the runtime every content domain builds on. It holds the three layers
  the plan names, `Definition`, `Type` and `Instance`, plus a `Registry<T>` with dense positional ids
  and a `Holder<T>` that survives a content reload, `Tags<T>` with Java Edition's append-unless-replace
  merge and transitive `#tag` references whose cycles are reported rather than thrown, a
  `ComponentRegistry` whose factories declare an injectable parameter schema and the hooks they may
  implement, a `BehaviorRegistry` that attaches named behaviors by identifier, list or predicate, a
  `HookTable` generic over a domain-supplied hook map that dispatches in declaration order with
  Bedrock's permutation override, and `flatten` for Dragonfly-style load-time flattening into typed
  arrays indexed by a dense id, with a reviewed-exception list that fails the build when a row matches
  nothing. The package names no block, item or entity concept; domains supply their own hooks,
  component factories and definition reader.

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`d220519`](https://github.com/JSPrismarine/JSPrismarine/commit/d220519e2e460148a90cbde9d643033e27bf8f5e) Thanks [@filiphsps](https://github.com/filiphsps)! - Select block behavior from loaded component data

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`bffe7a8`](https://github.com/JSPrismarine/JSPrismarine/commit/bffe7a89abe4151001fe7a8c323f5ce31ad55d1c) Thanks [@filiphsps](https://github.com/filiphsps)! - Serve the vanilla behavior pack alone, and let Mojang's content load without 55 warnings about
  itself.
  
  The default stack handed the whole BDS `behavior_packs` folder to the loader, so a default build
  served the editor pack's five `editor:` entities, chemistry's balloon and ice bomb, and eight
  chemistry reducer recipes that won over the vanilla recipes of the same name. It now composes the
  packs it was asked for, by the header UUID a world references a pack by, and the default asks for
  the vanilla behavior pack: 129 entity types rather than 136. `PackStackRequest.bedrockPacks` names
  more packs by UUID, or `'all'` composes the folder whole, for a server that does want chemistry or
  the editor.
  
  A clean build reported 102 warnings and no error. 26 of them were the `"events": null` an entity
  with no events is written with, and 26 the empty `"remove": {}` of a randomize branch that changes
  nothing; the parser already read both correctly, so the warnings only taught an operator to skip
  the report. Both are silent now, and an events key that is neither an object nor null, and a
  `component_groups` that is there and is not a list, still report. What is left is 47 warnings that
  each name something the server does not do, and an unknown component now names the first file that
  declared it.
