import { DROPPED_BLOCK_PROPERTIES, bedrockBlockPropertiesOf, javaBlockStateToBedrock } from '@jsprismarine/mapping';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import type { JavaBlockPropertyRow } from './goldens.ts';
import { loadJavaBlockProperties } from './goldens.ts';
import { javaDefaultStates, loadJavaBlockStates } from './javaBlockStates.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';

/**
 * Phase 1's exit criterion: the per-state block property table against the Java 26.3 jar dump,
 * for every state the server can hold.
 *
 * The unit of comparison is the Bedrock block state, because that is the server's identity. A
 * Bedrock state usually has several Java sources, since Bedrock's state set is smaller, so the
 * comparison first picks the Java state the Bedrock one stands for and then compares the ten
 * property fields against that state's dumped row.
 *
 * Gap ids: `<bedrock id>#<field>` where the shipped value differs from Java's, and
 * `no-row:<bedrock id>` where the table has no properties for a state a Java block maps onto.
 */

/**
 * The Java properties whose information travels in Bedrock's second block storage layer.
 *
 * Only `waterlogged` is one today. A waterlogged Java block and a dry one are the same Bedrock
 * block with water beside it, so the Bedrock block's own row is the dry block's row and the
 * water layer carries the water's light and movement. Picking the wet source instead would
 * fail 61 coral and conduit states for a difference the second layer already carries.
 */
const SECOND_LAYER_PROPERTIES = new Set(
    DROPPED_BLOCK_PROPERTIES.filter((dropped) => dropped.recovery === 'second-layer').map((dropped) => dropped.property)
);

/** One Java state's dumped row, with the state it came from for the failure message. */
interface JavaSource {
    /** How far the state is from Java's default state, in properties that differ. */
    distance: number;
    row: Record<string, string | number | boolean>;
    describe: string;
}

/** The dumped row of one Java state: the block's base row with that state's overrides folded in. */
const rowOf = (block: JavaBlockPropertyRow, stateKey: string): Record<string, string | number | boolean> => ({
    ...block.base,
    ...(block.stateOverrides?.[stateKey] ?? {})
});

/**
 * Chooses, for each Bedrock state, the Java state it stands for.
 *
 * Preference goes to a state with no water in the second layer, then to the state nearest
 * Java's own default, which is the state a player places. A Bedrock identifier that several
 * Java blocks reach keeps one candidate per block, and the comparison accepts the shipped
 * value when it matches any of them.
 */
const javaSourcesByBedrockState = (): ReadonlyMap<string, JavaSource[]> => {
    const dump = loadJavaBlockProperties();
    const defaults = javaDefaultStates();
    const byBedrock = new Map<string, Map<string, JavaSource>>();

    for (const { javaId, values, key } of loadJavaBlockStates()) {
        const block = dump[javaId];
        if (block === undefined) continue;
        const result = javaBlockStateToBedrock(javaId, values);
        if (result.kind !== 'mapped') continue;

        const bedrockKey = `${result.bedrock.name}|${Object.entries(result.bedrock.states)
            .map(([property, value]) => `${property}=${String(value)}`)
            .join(',')}`;

        const javaDefaults = defaults.get(javaId) ?? {};
        const inSecondLayer = Object.keys(values).some(
            (property) => SECOND_LAYER_PROPERTIES.has(property) && values[property] !== 'false'
        );
        const distance =
            (inSecondLayer ? SECOND_LAYER_PENALTY : 0) +
            Object.keys(values).filter((property) => values[property] !== javaDefaults[property]).length;

        const candidates = byBedrock.get(bedrockKey) ?? new Map<string, JavaSource>();
        const current = candidates.get(javaId);
        if (current === undefined || distance < current.distance) {
            candidates.set(javaId, { distance, row: rowOf(block, key), describe: `${javaId}[${key}]` });
        }
        byBedrock.set(bedrockKey, candidates);
    }

    return new Map([...byBedrock].map(([bedrockKey, candidates]) => [bedrockKey, [...candidates.values()]]));
};

/** Larger than any block's property count, so a wet source never wins over a dry one. */
const SECOND_LAYER_PENALTY = 1000;

/** Reads a Bedrock state key back into the values `bedrockBlockPropertiesOf` takes. */
const statesOf = (stateKey: string): Record<string, string | number> =>
    Object.fromEntries(
        stateKey
            .split(',')
            .filter(Boolean)
            .map((pair) => {
                const separator = pair.indexOf('=');
                const raw = pair.slice(separator + 1);
                const asNumber = Number(raw);
                return [pair.slice(0, separator), raw === '' || Number.isNaN(asNumber) ? raw : asNumber];
            })
    );

const compareBlockProperties = (): { gaps: string[]; states: number; fields: number; detail: string[] } => {
    const sources = javaSourcesByBedrockState();
    const gaps = new Set<string>();
    const detail: string[] = [];
    let fields = 0;

    for (const [bedrockKey, candidates] of sources) {
        const separator = bedrockKey.indexOf('|');
        const name = bedrockKey.slice(0, separator);
        const stateKey = bedrockKey.slice(separator + 1);

        const shipped = bedrockBlockPropertiesOf(name, statesOf(stateKey));
        if (shipped === undefined) {
            gaps.add(`no-row:${name}`);
            continue;
        }

        for (const [field, value] of Object.entries(shipped)) {
            fields += 1;
            if (candidates.some((candidate) => candidate.row[field] === value)) continue;
            gaps.add(`${name}#${field}`);
            if (detail.length < 20) {
                detail.push(
                    `${name}[${stateKey}] ${field}: table ${String(value)}, Java ${candidates
                        .map((candidate) => `${String(candidate.row[field])} from ${candidate.describe}`)
                        .join(' or ')}`
                );
            }
        }
    }

    return { gaps: [...gaps], states: sources.size, fields, detail };
};

describeFamily(FAMILIES.blocksProperties, [REFERENCES.javaBlockProperties], () => {
    const { gaps, states, fields, detail } = compareBlockProperties();
    const verdict = checkAllowList(FAMILIES.blocksProperties, gaps);

    it('gives every Bedrock state the Java block it stands for, field by field', () => {
        expect(verdict.unexpected, detail.join('\n')).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it('compares every state in the palette, not a sample of them', () => {
        // The Java registry collapses onto 15953 distinct Bedrock states
        // (docs/research/java-to-bedrock-translation.md section 1), less the one the two test
        // blocks fall back to, and the table carries ten property fields per state.
        expect(states).toBe(15952);
        expect(fields).toBe(states * 10);
    });
});
