/**
 * The goals a brain mob's Java class registers beside its brain, written into its entity file as
 * it loads.
 *
 * A dual-system mob runs Bedrock's goal scheduler beside its brain. Where Bedrock's file declares
 * other goals than Java's class registers, as the tadpole's does (its file has a tempt and a look
 * goal its brain already covers, and no avoid goal), `@jsprismarine/entity-brains` transcribes
 * Java's goals as Bedrock goal bodies in `BrainMobDefinition.goals`, and this overlay puts exactly
 * those on the mob in place of every goal the file declares.
 */
import type { BrainMobDefinition } from '@jsprismarine/entity-brains';
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';

import { isRecord } from '../utils/isRecord';
import { entityFileIdentifier, withoutComponents } from './definitionOverlay';

/** The prefix every goal component carries. */
const GOAL_PREFIX = 'minecraft:behavior.';

/** The Java goals of each brain mob that declares its own, by the mob's Bedrock identifier. */
export type BrainGoals = ReadonlyMap<string, NonNullable<BrainMobDefinition['goals']>>;

/** The goals of every brain mob that carries them, keyed by Bedrock identifier. */
export const brainGoalsOf = (brains: Iterable<BrainMobDefinition>): BrainGoals => {
    const goals = new Map<string, NonNullable<BrainMobDefinition['goals']>>();
    for (const brain of brains) {
        if (brain.goals === undefined) continue;
        const entity = javaEntityTypeToBedrock(brain.id);
        goals.set(entity.kind === 'mapped' ? entity.bedrock : brain.id, brain.goals);
    }
    return goals;
};

/**
 * Replaces the goals of one entity file with its brain's Java goals, when its brain declares them.
 *
 * @param data - The parsed JSON of an entity file.
 * @param goals - Each brain mob's Java goals, from {@link brainGoalsOf}.
 * @returns The same object for a file whose mob carries no Java goals; otherwise a copy whose base
 *   components hold exactly those goals and whose component groups hold none.
 */
export const withBrainGoals = (data: unknown, goals: BrainGoals): unknown => {
    const identifier = entityFileIdentifier(data);
    const javaGoals = identifier === undefined ? undefined : goals.get(identifier);
    if (javaGoals === undefined) return data;
    const stripped = withoutComponents(data, (component) => component.startsWith(GOAL_PREFIX));
    const entity = isRecord(stripped) ? stripped['minecraft:entity'] : undefined;
    if (!isRecord(stripped) || !isRecord(entity)) return data;
    const components = entity['components'];
    return {
        ...stripped,
        'minecraft:entity': { ...entity, components: { ...(isRecord(components) ? components : {}), ...javaGoals } }
    };
};
