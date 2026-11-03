/**
 * Java's `block_transformer` registry: what an axe strips, a shovel paths and
 * a hoe tills.
 *
 * 26.3 moved the whole table out of the tool classes and into
 * `data/minecraft/block_transformer/*.json`. An item names a transformer in
 * its `minecraft:block_transformer` component, and the file is a list of
 * entries, each a `rule_based` block state provider over block predicates.
 * The first entry whose provider answers decides what the clicked block
 * becomes.
 *
 * The predicates and the results name Java blocks, so the clicked Bedrock
 * block is read through `@jsprismarine/mapping` both ways: its Java identity
 * answers the predicates, and the rule's Java state maps back to the Bedrock
 * placement the world writes.
 *
 * Three entry fields are resolved here: the rules, `disallowed_faces` and the
 * result state. The per-entry `sound` and `item_damage_per_use` stay with the
 * behavior that calls this, whose constants say what every vanilla entry
 * says; `loot`, `particle` and `update_from_neighbors` are not surfaced yet.
 */
import type { BlockPlacement } from '@jsprismarine/item-behaviors';
import { bedrockBlockStateToJava, javaBlockStateToBedrock } from '@jsprismarine/mapping';
import type { Definition } from '@jsprismarine/packs';

import type { BlockStateValue } from '../block/state/BlockState';
import type { ContentTags } from '../content/tags';

/** The block a transformer is asked about: what stands there, and where. */
export interface TransformTarget {
    readonly identifier: string;
    readonly states: Readonly<Record<string, BlockStateValue>>;
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
}

/** The face of the clicked block, as the use event names it. */
export type TransformFace = 'down' | 'up' | 'north' | 'south' | 'west' | 'east';

/** A block read for the predicates that test a neighbor, such as the hoe's air-above rule. */
export type TransformBlockAt = (position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}) => { readonly identifier: string; readonly states: Readonly<Record<string, BlockStateValue>> } | undefined;

/** One parsed transformer file: its entries, raw but shaped. */
export interface BlockTransformerRegistry {
    /** The entries of one transformer, or undefined for a transformer no pack declares. */
    entriesOf(transformer: string): readonly TransformerEntry[] | undefined;
}

/** One entry of a transformer file: one tool pass over the clicked block. */
interface TransformerEntry {
    readonly rules: readonly TransformerRule[];
    readonly disallowedFaces: readonly string[];
}

/** One rule: a predicate over the clicked block, and the state it becomes. */
interface TransformerRule {
    readonly ifTrue: unknown;
    readonly then: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads one transformer file's entries, dropping whatever is not shaped like an entry. */
const entriesIn = (data: unknown): TransformerEntry[] => {
    if (!Array.isArray(data)) return [];

    const entries: TransformerEntry[] = [];
    for (const entry of data) {
        if (!isRecord(entry)) continue;
        const provider = entry.block_state_provider;
        if (!isRecord(provider) || provider.type !== 'minecraft:rule_based' || !Array.isArray(provider.rules)) continue;

        entries.push({
            rules: provider.rules
                .filter(isRecord)
                .map((rule) => ({ ifTrue: rule.if_true, then: rule.then }))
                .filter((rule) => rule.ifTrue !== undefined && rule.then !== undefined),
            disallowedFaces: Array.isArray(entry.disallowed_faces)
                ? entry.disallowed_faces.filter((face): face is string => typeof face === 'string')
                : []
        });
    }

    return entries;
};

/** Parses the loaded `block_transformer` registry into a lookup by transformer id. */
export const parseBlockTransformers = (definitions: ReadonlyMap<string, Definition>): BlockTransformerRegistry => {
    const parsed = new Map<string, TransformerEntry[]>();
    for (const [identifier, definition] of definitions) parsed.set(identifier, entriesIn(definition.data));
    return { entriesOf: (transformer) => parsed.get(transformer) };
};

/** The names the predicates may know one block by: its Java identity, then its own. */
const namesOf = (identifier: string, states: Readonly<Record<string, BlockStateValue>>): string[] => {
    const mapped = bedrockBlockStateToJava(identifier, states);
    return mapped.kind === 'mapped' && mapped.java.name !== identifier ? [mapped.java.name, identifier] : [identifier];
};

/** What the resolver reads of the world and the content. */
interface ResolveContext {
    readonly tags: Pick<ContentTags, 'includes'>;
    readonly blockAt: TransformBlockAt;
}

/** Whether one predicate holds at the clicked block, or at the neighbor its `offset` names. */
const predicateHolds = (context: ResolveContext, predicate: unknown, target: TransformTarget): boolean => {
    if (!isRecord(predicate)) return false;

    if (predicate.type === 'minecraft:all_of') {
        return (
            Array.isArray(predicate.predicates) &&
            predicate.predicates.every((member) => predicateHolds(context, member, target))
        );
    }

    // `offset` moves the question to a neighbor, which is how the hoe asks for air above.
    const offset = Array.isArray(predicate.offset) ? predicate.offset : [0, 0, 0];
    const [dx, dy, dz] = [Number(offset[0] ?? 0), Number(offset[1] ?? 0), Number(offset[2] ?? 0)];
    let subject: { identifier: string; states: Readonly<Record<string, BlockStateValue>> } | undefined = target;
    if (dx !== 0 || dy !== 0 || dz !== 0) {
        subject = context.blockAt({
            x: target.position.x + dx,
            y: target.position.y + dy,
            z: target.position.z + dz
        });
    }
    if (subject === undefined) return false;
    const names = namesOf(subject.identifier, subject.states);

    if (predicate.type === 'minecraft:matching_blocks') {
        const blocks = Array.isArray(predicate.blocks) ? predicate.blocks : [predicate.blocks];
        return blocks.some((block) => typeof block === 'string' && names.includes(block));
    }

    if (predicate.type === 'minecraft:matching_block_tag') {
        const tag = predicate.tag;
        return typeof tag === 'string' && names.some((name) => context.tags.includes('block', tag, name));
    }

    // A predicate type this resolver does not read; holding would transform on a guess.
    return false;
};

/** The Java state one rule's `then` resolves to, in both of its written forms. */
const resultStateOf = (
    then: unknown,
    target: TransformTarget
): { id: string; properties: Record<string, string> } | undefined => {
    if (!isRecord(then)) return undefined;

    // The plain form: a fixed state, the way the hoe writes dry farmland.
    if (typeof then.id === 'string') {
        const properties = isRecord(then.properties) ? then.properties : {};
        return {
            id: then.id,
            properties: Object.fromEntries(Object.entries(properties).map(([name, value]) => [name, String(value)]))
        };
    }

    // `copy_properties`: the source's defaults, with the clicked block's own values kept for
    // every property the source also declares - what keeps a stripped log on its axis.
    if (then.type === 'minecraft:copy_properties' && isRecord(then.source) && typeof then.source.id === 'string') {
        const defaults = isRecord(then.source.properties) ? then.source.properties : {};
        const clicked = bedrockBlockStateToJava(target.identifier, target.states);
        const carried = clicked.kind === 'mapped' ? clicked.java.properties : {};
        return {
            id: then.source.id,
            properties: Object.fromEntries(
                Object.entries(defaults).map(([name, value]) => [name, String(carried[name] ?? value)])
            )
        };
    }

    return undefined;
};

/**
 * Resolves what a transformer turns one clicked block into.
 *
 * @returns The Bedrock placement, or undefined when no entry has a rule for
 *   the block - which is the tool declining, not an error.
 */
export const resolveTransform = (
    registry: BlockTransformerRegistry,
    context: ResolveContext,
    transformer: string,
    target: TransformTarget,
    face: TransformFace
): BlockPlacement | undefined => {
    const entries = registry.entriesOf(transformer);
    if (entries === undefined) return undefined;

    for (const entry of entries) {
        if (entry.disallowedFaces.includes(face)) continue;

        for (const rule of entry.rules) {
            if (!predicateHolds(context, rule.ifTrue, target)) continue;

            const result = resultStateOf(rule.then, target);
            if (result === undefined) return undefined;

            const mapped = javaBlockStateToBedrock(result.id, result.properties);
            if (mapped.kind === 'unknown') return undefined;
            return { identifier: mapped.bedrock.name, states: mapped.bedrock.states };
        }
    }

    return undefined;
};
