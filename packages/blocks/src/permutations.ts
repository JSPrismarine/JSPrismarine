import type { ComponentEntry } from '@jsprismarine/content';
import type { Molang } from '@jsprismarine/molang';

import type { BlockDefinitionDocument } from './definition';
import type { BlockStateValue } from './hooks';

/**
 * Which permutations of a definition match one state, as an index list in
 * declaration order. The order is what decides the winner, so it is also the
 * key the resolver groups states by.
 */
export type PermutationMask = readonly number[];

/**
 * Evaluates a block permutation's Molang condition against one state.
 *
 * The docs limit a condition to `query.block_state('name')`, so the only
 * scope member a condition needs is `block.blockState`. A condition that does
 * not parse compiles to a constant 0 in `@jsprismarine/molang`, which is the
 * engine's own content-error behavior, so it simply does not match.
 *
 * @param values - Every state value of the block, keyed by state name.
 * @returns Whether the condition evaluated to a truthy number.
 */
export const conditionMatches = (
    molang: Molang,
    condition: string,
    values: Readonly<Record<string, BlockStateValue>>
): boolean => {
    const result = molang.compile(condition).evaluate({
        block: { blockState: (name) => values[name] }
    });
    return typeof result === 'number' && result !== 0;
};

/** Every permutation of a definition that matches one state, in declaration order. */
export const permutationsFor = (
    document: BlockDefinitionDocument,
    values: Readonly<Record<string, BlockStateValue>>,
    molang: Molang
): PermutationMask =>
    document.permutations.flatMap((permutation, index) =>
        conditionMatches(molang, permutation.condition, values) ? [index] : []
    );

/**
 * The component list for one state: the base components, then the components
 * of each matching permutation in declaration order, with the later entry
 * winning for a name that appears more than once.
 *
 * That is Mojang's rule. A component a permutation sets keeps the position
 * the base list gave it, so hook dispatch order does not change under a
 * permutation, and every entry a permutation contributed carries `override`
 * so a component that does bind handlers replaces the base ones rather than
 * running after them.
 */
export const componentsForPermutation = (
    document: BlockDefinitionDocument,
    mask: PermutationMask
): readonly ComponentEntry[] => {
    const merged = new Map<string, ComponentEntry>();
    for (const entry of document.components) merged.set(entry.name, { ...entry });

    for (const index of mask) {
        for (const entry of document.permutations[index]!.components) {
            merged.set(entry.name, { ...entry, override: true });
        }
    }

    return [...merged.values()];
};
