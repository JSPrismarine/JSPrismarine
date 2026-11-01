# @jsprismarine/molang

## 0.17.0

### Minor Changes

- [#2661](https://github.com/JSPrismarine/JSPrismarine/pull/2661) [`9061024`](https://github.com/JSPrismarine/JSPrismarine/commit/9061024a45c9e8b00be4963b61406d7474f2f82d) Thanks [@filiphsps](https://github.com/filiphsps)! - Remove CommonJS package outputs

## 0.16.0

### Minor Changes

- [#2628](https://github.com/JSPrismarine/JSPrismarine/pull/2628) [`db4b039`](https://github.com/JSPrismarine/JSPrismarine/commit/db4b039894d90ab3a7ee6fc700728adadfc678f5) Thanks [@filiphsps](https://github.com/filiphsps)! - Add `@jsprismarine/molang`: a Molang parser, compiler and evaluator for Bedrock behavior packs. It
  parses the full grammar with a Pratt parser, compiles each expression once per (source, version)
  into a cached closure over a typed scope, implements the 61 documented `math.*` functions with
  Bedrock's semantics, registers the 21 vanilla server-side queries with their declared contexts, and
  applies the versioned operator precedence rules (ternary associativity at 1.18.10, `&&` over `||`
  and comparison over equality at 1.18.20, the negative-divisor fix at 1.19.60). Unknown identifiers
  are reported through compile diagnostics and evaluate to 0.0 at run time, as the engine does.
