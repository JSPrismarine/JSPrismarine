import type { RandomSource } from '@jsprismarine/worldgen';

import { asArray, asInteger, asNumber, asObject, fail } from '../json';
import { normalizeIdentifier, predicateTypeNameOf } from '../registry';
import type { BlockState } from '../world/BlockState';
import { blockStateKey } from '../world/BlockState';
import type { BlockOracle, BlockPos } from '../world/FeatureWorld';
import { parseBlockState } from '../providers/blockStateProvider';

/**
 * A test on a block state and its position, Java's `RuleTest`.
 *
 * Ores use these to decide what they may cut through, which is why `ore_diamond` can place
 * deepslate diamond below y 8 and ordinary diamond above it from one feature. Unlike a
 * {@link import('../providers/blockPredicate').BlockPredicate} it never reads the world: it is
 * handed the state it is judging, and two of the ten types draw from the random stream.
 */
export type RuleTest = (blocks: BlockOracle, state: BlockState, position: BlockPos, random: RandomSource) => boolean;

/** The ten types Java 26.3 registers in `rule_test`. */
export type RuleTestTypeName =
    | 'always_true'
    | 'block_match'
    | 'blockstate_match'
    | 'tag_match'
    | 'random_block_match'
    | 'random_blockstate_match'
    | 'height_match'
    | 'not'
    | 'any_of'
    | 'all_of';

/** Reads a `rule_test` document. The dispatch key is `predicate_type`, not `type`. */
export const parseRuleTest = (source: unknown, path: string): RuleTest => {
    const raw = asObject(source, path);
    const type = predicateTypeNameOf(raw['predicate_type'], path);
    switch (type) {
        case 'always_true':
            return () => true;

        case 'block_match': {
            const block = normalizeIdentifier(raw['block'], `${path}.block`);
            return (_blocks, state) => state.name === block;
        }

        case 'blockstate_match': {
            const wanted = blockStateKey(parseBlockState(raw['block_state'], `${path}.block_state`));
            return (_blocks, state) => blockStateKey(state) === wanted;
        }

        case 'tag_match': {
            const tag = normalizeIdentifier(raw['tag'], `${path}.tag`);
            return (blocks, state) => blocks.hasTag(state, tag);
        }

        case 'random_block_match': {
            const block = normalizeIdentifier(raw['block'], `${path}.block`);
            const probability = asNumber(raw['probability'], `${path}.probability`);
            return (_blocks, state, _position, random) => state.name === block && random.nextFloat() < probability;
        }

        case 'random_blockstate_match': {
            const wanted = blockStateKey(parseBlockState(raw['block_state'], `${path}.block_state`));
            const probability = asNumber(raw['probability'], `${path}.probability`);
            return (_blocks, state, _position, random) =>
                blockStateKey(state) === wanted && random.nextFloat() < probability;
        }

        case 'height_match': {
            const min = asInteger(raw['min_inclusive'], `${path}.min_inclusive`);
            const max = asInteger(raw['max_inclusive'], `${path}.max_inclusive`);
            return (_blocks, _state, position) => min <= position.y && position.y <= max;
        }

        case 'not': {
            const inner = parseRuleTest(raw['rule'], `${path}.rule`);
            return (blocks, state, position, random) => !inner(blocks, state, position, random);
        }

        case 'any_of': {
            const rules = parseRuleList(raw['rules'], `${path}.rules`);
            return (blocks, state, position, random) => rules.some((rule) => rule(blocks, state, position, random));
        }

        case 'all_of': {
            const rules = parseRuleList(raw['rules'], `${path}.rules`);
            return (blocks, state, position, random) => rules.every((rule) => rule(blocks, state, position, random));
        }

        default:
            return fail(path, `unknown rule test type ${JSON.stringify(type)}`);
    }
};

const parseRuleList = (source: unknown, path: string): RuleTest[] =>
    asArray(source, path).map((entry, index) => parseRuleTest(entry, `${path}[${index}]`));

/** A rule test paired with the state to write when it holds, Java's `BlockReplacement`. */
export interface BlockReplacement {
    /** What the block already there has to be. */
    readonly target: RuleTest;
    /** What to write in its place. */
    readonly state: BlockState;
}

/** Reads a `{"target": ..., "state": ...}` replacement. */
export const parseBlockReplacement = (source: unknown, path: string): BlockReplacement => {
    const raw = asObject(source, path);
    return {
        target: parseRuleTest(raw['target'], `${path}.target`),
        state: parseBlockState(raw['state'], `${path}.state`)
    };
};

/** Reads the list of replacements an ore or a `replace_single_block` carries. */
export const parseBlockReplacements = (source: unknown, path: string): BlockReplacement[] =>
    asArray(source, path).map((entry, index) => parseBlockReplacement(entry, `${path}[${index}]`));
