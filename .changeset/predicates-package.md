---
'@jsprismarine/predicates': patch
---

Add `@jsprismarine/predicates`, the Java Edition predicate, item modifier and value provider
evaluator that loot, advancements and enchantments call. It implements the 20 loot condition types,
42 loot function types, 23 int and 28 float context providers, 7 enchantment level based values and
23 of the 25 entity sub-predicate types of Java 26.3, all read out of the 26.3 server jar. One
helper resolves 26.3's composition rule, where every field of a composable type takes an inline
value, a namespaced id, a list mixing both, or a `#tag`. A `PredicateContext` carries the 16 loot
context parameters and declares which of the 31 context key sets it belongs to, so reading a
parameter that set does not provide reports a diagnostic instead of quietly passing. The random
source, reference resolver, level view, item stack operations, enchantment view and content view
are all injected, and a grammar member the package does not implement reports a diagnostic and
evaluates false rather than throwing.
