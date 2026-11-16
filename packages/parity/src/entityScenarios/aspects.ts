import { TRIGGER_COMPONENTS } from '@jsprismarine/entities';
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';

import type { BehaviorAspect } from '../behaviorScenarios.ts';
import { serverContent } from '../serverStack.ts';

/**
 * Components an entity declares that carry no server-decided behavior to compare with Java: the
 * network, rendering, sound and hitbox data the parity claim excludes (categories 1 and 5 of
 * docs/data-driven/parity.md), and the event wiring whose effects are the other components' aspects.
 */
export const PRESENTATION_COMPONENTS: ReadonlySet<string> = new Set([
    'minecraft:ambient_sound_interval',
    'minecraft:body_rotation_always_follows_head',
    'minecraft:body_rotation_blocked',
    'minecraft:collision_box',
    'minecraft:conditional_bandwidth_optimization',
    'minecraft:custom_hit_test',
    'minecraft:free_camera_controlled',
    'minecraft:is_hidden_when_invisible',
    'minecraft:movement_sound_distance_offset',
    'minecraft:renders_when_invisible',
    'minecraft:rotation_axis_aligned',
    'minecraft:rotation_locked_to_vehicle',
    ...TRIGGER_COMPONENTS
]);

/**
 * The behaviors one Java entity has that full parity has to compare with Java: every component
 * its server definition declares, in its base components and its component groups, but the
 * presentation ones and the `minecraft:is_*` state markers, which only record a state another
 * component's behavior sets. An engine entity with no declared components has one aspect, its
 * engine behavior.
 */
export const entityAspects = (javaId: string): readonly BehaviorAspect[] => {
    const mapping = javaEntityTypeToBedrock(javaId);
    if (mapping.kind !== 'mapped') return [];
    const declared = serverContent().entities.registry.get(mapping.bedrock)?.declaredComponents ?? [];
    const aspects = declared
        .filter((component) => !PRESENTATION_COMPONENTS.has(component) && !component.startsWith('minecraft:is_'))
        .map((component) => ({
            id: component,
            description: `what ${component} does for this entity, against Java`
        }));
    return aspects.length > 0
        ? aspects
        : [{ id: 'engine', description: "this engine entity's behavior, against Java" }];
};
