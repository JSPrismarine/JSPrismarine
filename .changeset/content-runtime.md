---
'@jsprismarine/content': patch
---

Add `@jsprismarine/content`, the runtime every content domain builds on. It holds the three layers
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
