/**
 * Two blocks rules Java's mobs run in `aiStep`, which Bedrock writes as components the server
 * otherwise keeps as data.
 *
 * - `minecraft:trail`, the snow golem's: `SnowGolem.aiStep` checks the four blocks under the
 *   corners of a 0.5-block square around its feet, and with `mobGriefing` on fills each one that
 *   is air and that snow can survive in. Java reads no biome for the snow it places, only for the
 *   melting that hurts the golem, so the pack's `spawn_filter` temperature test does not apply.
 * - `minecraft:break_blocks`, the ravager's: `Ravager.aiStep` destroys every `LeavesBlock` in its
 *   box inflated by 0.2 when it collides horizontally with `mobGriefing` on, and jumps when it
 *   broke none and stands on the ground. Java breaks leaves only, where the pack also lists crops
 *   and plants.
 */
import type { EntityPosition } from '@jsprismarine/entities';
import { isRecord } from '@jsprismarine/entities';

import type { DataEntity } from './DataEntity';

/** The component that gives a mob a trail. */
export const TRAIL_COMPONENT = 'minecraft:trail';

/** The component that lets a mob break blocks it walks into. */
export const BREAK_BLOCKS_COMPONENT = 'minecraft:break_blocks';

/** `SnowGolem.aiStep` offsets each corner this far from its feet along x and z. */
const TRAIL_CORNER = 0.25;

/** `Ravager.aiStep` inflates its box by this much before it looks for leaves. */
const LEAF_REACH = 0.2;

/** What the two rules read of the world and do to it. */
export interface MobBlockHost {
    /** Whether `mobGriefing` is on. */
    mobGriefing(): boolean;
    isAir(at: EntityPosition): boolean;
    /**
     * Whether a block placed at a position survives there, as Java's `BlockState.canSurvive`.
     *
     * @javaSee BlockBehaviour$BlockStateBase.canSurvive
     */
    canSurvive(identifier: string, at: EntityPosition): boolean;
    place(entity: DataEntity, identifier: string, at: EntityPosition): void;
    /** Whether a block is one of Java's `LeavesBlock`s. */
    isLeaves(at: EntityPosition): boolean;
    /** Destroys a block as a mob does, with its drops. */
    destroy(at: EntityPosition): void;
    jump(entity: DataEntity): void;
}

/** The block a trail leaves, or undefined for an entity without one. */
const trailBlockOf = (entity: DataEntity): string | undefined => {
    const params = entity.instance.componentParams(TRAIL_COMPONENT);
    if (!isRecord(params)) return undefined;
    const block = params['block_type'];
    return typeof block === 'string' ? block : undefined;
};

/** Runs `SnowGolem.aiStep`'s trail for one entity that declares `minecraft:trail`. */
export const leaveTrail = (entity: DataEntity, host: MobBlockHost): void => {
    const block = trailBlockOf(entity);
    if (block === undefined || !host.mobGriefing()) return;
    const { x, y, z } = entity.position;
    for (let corner = 0; corner < 4; corner += 1) {
        const at = {
            x: Math.floor(x + ((corner % 2) * 2 - 1) * TRAIL_CORNER),
            y: Math.floor(y),
            z: Math.floor(z + ((Math.floor(corner / 2) % 2) * 2 - 1) * TRAIL_CORNER)
        };
        if (host.isAir(at) && host.canSurvive(block, at)) host.place(entity, block, at);
    }
};

/**
 * Runs `Ravager.aiStep`'s leaf breaking for one entity that declares `minecraft:break_blocks` and
 * collided horizontally this tick: it breaks the leaves it touches, and a grounded mob that broke
 * none jumps.
 */
export const breakLeaves = (entity: DataEntity, host: MobBlockHost): void => {
    if (!entity.instance.hasComponent(BREAK_BLOCKS_COMPONENT) || !host.mobGriefing()) return;
    const { position } = entity;
    const { width, height } = entity.facts.box;
    const half = width / 2 + LEAF_REACH;
    let broke = false;
    for (let x = Math.floor(position.x - half); x <= Math.floor(position.x + half); x += 1)
        for (let y = Math.floor(position.y - LEAF_REACH); y <= Math.floor(position.y + height + LEAF_REACH); y += 1)
            for (let z = Math.floor(position.z - half); z <= Math.floor(position.z + half); z += 1) {
                const at = { x, y, z };
                if (!host.isLeaves(at)) continue;
                host.destroy(at);
                broke = true;
            }
    if (!broke && entity.body.conditions.has('on_ground')) host.jump(entity);
};
