/**
 * The facts an entity cannot answer about itself.
 *
 * `EntityInstance` answers everything that is in its components and its
 * properties, and leaves the rest to whatever the environment supplies. The
 * rest is all of the same kind: it is about where the entity is and who it is
 * with. Whether it is sitting, who it rides, who tamed it, how far away its
 * target is, and the light at its position. The runtime is the only thing that
 * knows any of that, so this is the runtime's half of `FilterEntityView`.
 *
 * It matters to the goals and not only to the filters. `GoalSupport.flag`
 * reads `is_sitting` and `is_tamed` through the same view, so a sit goal that
 * sets the flag and a goal that refuses to run while the entity is sitting
 * agree only because both go through here.
 */
import type { EntityFlag, EntityMeasure, FilterContext, FilterEntityView } from '@jsprismarine/entities';

import type { MobBody } from './DataEntity';
import { distance } from './DataEntity';
import { blockPositionOf } from './position';
import type { EntityScene } from './scene';

/** The whole filter context for one entity: its own facts and the world's. */
export const entityFilterContextOf = (body: MobBody, scene: EntityScene): FilterContext => ({
    self: entityFilterViewOf(body, scene),
    world: {
        timeOfDay: () => scene.world.level.dayTime(),
        difficulty: () => scene.world.level.difficulty(),
        dimension: () => scene.world.level.dimension,
        weather: () => scene.world.level.weather()
    }
});

/** One entity as a filter reads it, for the facts the runtime owns. */
export const entityFilterViewOf = (body: MobBody, scene: EntityScene): FilterEntityView => ({
    id: () => body.id,
    flag: (name) => flagOf(body, scene, name),
    measure: (name) => measureOf(body, scene, name),
    vehicle: () => viewOf(scene.vehicleOf(body)?.id, scene),
    owner: () => viewOf(body.owner, scene),
    attackTarget: () => viewOf(body.target, scene)
});

/** One of the boolean facts the runtime owns, or undefined when it owns none of that name. */
const flagOf = (body: MobBody, scene: EntityScene, name: EntityFlag): boolean | undefined => {
    switch (name) {
        case 'is_sitting':
            return body.sitting;
        case 'is_sleeping':
            return body.sleeping;
        case 'is_riding':
            return scene.vehicleOf(body) !== undefined;
        case 'has_target':
            return body.target !== undefined;
        case 'is_moving':
        case 'is_navigating':
            return body.walking;
        case 'on_ground':
            return body.conditions.has('on_ground');
        default:
            // Everything else is either the entity's own (`is_baby`, `is_tamed`) or a fact
            // about the blocks the runtime does not track yet, and an unanswered flag makes
            // its test false rather than guessing.
            return body.conditions.has(name) ? true : undefined;
    }
};

/** One of the numeric facts the runtime owns. */
const measureOf = (body: MobBody, scene: EntityScene, name: EntityMeasure): number | undefined => {
    switch (name) {
        case 'rider_count':
            return scene.ridersOf(body).length;
        case 'home_distance':
            return body.home === undefined ? undefined : distance(body.position, body.home);
        case 'owner_distance':
            return awayFrom(body, scene, body.owner);
        case 'target_distance':
            return awayFrom(body, scene, body.target);
        case 'distance_to_nearest_player':
            return nearestPlayerDistance(body, scene);
        case 'is_brightness':
            return scene.world.blocks.light(blockPositionOf(body.position)) / 15;
        case 'light_level':
            return scene.world.blocks.light(blockPositionOf(body.position));
        case 'y_rotation':
            return body.yaw;
        default:
            return undefined;
    }
};

/** How far another entity is, or undefined when there is none or it has gone. */
const awayFrom = (body: MobBody, scene: EntityScene, other: number | undefined): number | undefined => {
    if (other === undefined) return undefined;
    const mob = scene.mobById(other);
    return mob === undefined ? undefined : distance(body.position, mob.position());
};

/** How far the nearest player is, or undefined when the dimension has none. */
const nearestPlayerDistance = (body: MobBody, scene: EntityScene): number | undefined => {
    let nearest: number | undefined;
    for (const player of scene.host.players()) {
        const away = distance(body.position, player.position);
        if (nearest === undefined || away < nearest) nearest = away;
    }
    return nearest;
};

/** Another entity's filter view, by runtime id. */
const viewOf = (id: string | number | undefined, scene: EntityScene): FilterEntityView | undefined =>
    typeof id === 'number' ? scene.mobById(id)?.view() : undefined;
