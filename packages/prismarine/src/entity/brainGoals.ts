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
import { entityFileIdentifier } from './definitionOverlay';

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

/** A component map with every goal component taken out. */
const withoutGoals = (components: unknown): unknown =>
    isRecord(components)
        ? Object.fromEntries(Object.entries(components).filter(([name]) => !name.startsWith(GOAL_PREFIX)))
        : components;

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
    if (javaGoals === undefined || !isRecord(data)) return data;
    const entity = data['minecraft:entity'];
    if (!isRecord(entity)) return data;
    const groups = entity['component_groups'];
    const components = withoutGoals(entity['components']);
    return {
        ...data,
        'minecraft:entity': {
            ...entity,
            components: { ...(isRecord(components) ? components : {}), ...javaGoals },
            ...(isRecord(groups)
                ? {
                      component_groups: Object.fromEntries(
                          Object.entries(groups).map(([name, group]) => [name, withoutGoals(group)])
                      )
                  }
                : {})
        }
    };
};
