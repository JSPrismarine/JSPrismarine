import type { ComponentFactory } from '@jsprismarine/content';

import type { EntityHooks } from '../hooks';
import type { EntityInstance } from '../entityInstance';
import type { ComponentRecord } from './schemas';
import { recordSchema } from './schemas';

/**
 * Whether the entity has strayed far enough to settle a new home where it is: Java's
 * `HappyGhast.checkRestriction` and `AbstractNautilus.checkRestriction`. Neither moves the home of
 * a leashed mob or one that carries a rider, the nautilus only moves a tamed one's, and the home
 * stays while the mob is within the restriction radius plus `rehome_beyond` blocks of it.
 */
const strayedFromHome = (entity: EntityInstance, radius: number, beyond: number, tamedOnly: boolean): boolean => {
    const self = entity.filterContext().self;
    if (self.flag?.('is_leashed') === true || (self.measure?.('rider_count') ?? 0) > 0) return false;
    if (tamedOnly && self.flag?.('is_tamed') !== true) return false;
    const home = entity.homePosition;
    const here = entity.actuator?.position();
    if (here === undefined) return false;
    if (home === undefined) return true;
    // Java's `BlockPos.closerThan`: block positions, squared distance under the reach squared.
    const dx = Math.floor(home.x) - Math.floor(here.x);
    const dy = Math.floor(home.y) - Math.floor(here.y);
    const dz = Math.floor(home.z) - Math.floor(here.z);
    const reach = radius + beyond;
    return dx * dx + dy * dy + dz * dz >= reach * reach;
};

/**
 * `minecraft:home`, which records the entity's spawning position for home-based behavior.
 *
 * Two server keys carry Java's re-homing: with `rehome_beyond` set, a mob that strays past its
 * `restriction_radius` plus that many blocks from home takes the block it stands in as its new
 * home, as Java's happy ghast and nautilus do once a ride or a leash has taken them away, and
 * `rehome_tamed_only` limits that to a tamed mob, as the nautilus has it.
 */
export const home: ComponentFactory<EntityHooks, ComponentRecord> = {
    name: 'minecraft:home',
    hooks: ['onInitialize', 'onTick'],
    schema: recordSchema,
    create: (params) => {
        const radius = typeof params.restriction_radius === 'number' ? params.restriction_radius : 0;
        const beyond = typeof params.rehome_beyond === 'number' ? params.rehome_beyond : undefined;
        const tamedOnly = params.rehome_tamed_only === true;
        return {
            onInitialize: (entity) => {
                if (entity.homePosition !== undefined) return;
                const position = entity.actuator?.position();
                if (position !== undefined) entity.setHomePosition(position);
            },
            onTick: (entity) => {
                if (beyond === undefined || !strayedFromHome(entity, radius, beyond, tamedOnly)) return;
                const here = entity.actuator?.position();
                if (here !== undefined)
                    entity.setHomePosition({ x: Math.floor(here.x), y: Math.floor(here.y), z: Math.floor(here.z) });
            }
        };
    }
};
