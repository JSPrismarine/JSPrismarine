---
'@jsprismarine/molang': minor
---

Add `@jsprismarine/molang`: a Molang parser, compiler and evaluator for Bedrock behavior packs. It
parses the full grammar with a Pratt parser, compiles each expression once per (source, version)
into a cached closure over a typed scope, implements the 61 documented `math.*` functions with
Bedrock's semantics, registers the 21 vanilla server-side queries with their declared contexts, and
applies the versioned operator precedence rules (ternary associativity at 1.18.10, `&&` over `||`
and comparison over equality at 1.18.20, the negative-divisor fix at 1.19.60). Unknown identifiers
are reported through compile diagnostics and evaluate to 0.0 at run time, as the engine does.
