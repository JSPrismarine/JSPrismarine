/**
 * How fire and lava destroy a cushion, after Java 26.3's `Cushion`.
 *
 * Java's cushion is a `BlockAttachedEntity`, whose `tick` never runs `Entity.baseTick`, so lava
 * does not hurt it every tick the way it hurts a mob or a boat. Instead its counter runs from 0,
 * and when it reaches 100 `Cushion.tickAtCheckInterval` runs and the counter starts again: the
 * fluid at its block acts on it as `FluidState.entityInside` does, which for lava is
 * `Entity.lavaHurt`, and `destroyIfInFire` hurts it with `inFire` when a block in Java's
 * `minecraft:fire` tag is inside its box. `BlockAttachedEntity.hurtServer` destroys it on either
 * blow, and `Cushion.dropItem` drops the cushion item of its color.
 *
 * Bedrock's `cushion.json` declares lava damage through `minecraft:hurt_on_condition`, which the
 * damage pipeline turns aside because a cushion has no health.
 */
import { defineComponentState, stateField } from '@jsprismarine/entities/componentState';

import type { DataEntity } from './DataEntity';

/** The Bedrock cushion entity. */
const CUSHION = 'minecraft:cushion';

/**
 * How many ticks apart a cushion checks for fire and lava: `BlockAttachedEntity.tick` checks when
 * its counter, counted up from 0, reaches 100, which is on the 101st tick and every 101 after.
 */
export const CUSHION_CHECK_TICKS = 101;

/** `Cushion.DEFAULT_COLOR`, the color of a cushion whose spawn names none. */
const DEFAULT_COLOR = 'white';

/** The ticks a cushion has counted towards its next check. Java does not save the counter. */
const cushionState = defineComponentState('jsprismarine:cushion_check', { ticks: stateField.number }, { saved: false });

/** Whether a data entity is a cushion. */
export const isCushion = (entity: DataEntity): boolean => entity.identifier === CUSHION;

/**
 * The item a destroyed cushion drops: `Cushion.getCushionItemStackWithData`, the cushion item of
 * its color.
 * @param variant - The color the placing item named, kept in the spawn data.
 */
export const cushionItemOf = (variant: unknown): string =>
    `minecraft:${typeof variant === 'string' && variant.length > 0 ? variant : DEFAULT_COLOR}_cushion`;

/** What a cushion's check needs of the runtime. */
export interface CushionHost {
    /** Whether lava is in the cushion's box, which `FluidState.entityInside` hurts it for. */
    inLava(entity: DataEntity): boolean;
    /** Whether a block in Java's `minecraft:fire` tag is inside the cushion's box. */
    touchesFire(entity: DataEntity): boolean;
    /** Removes the cushion and, with entity drops on, drops `item` where it was. */
    destroy(entity: DataEntity, item: string): void;
}

/**
 * Runs one tick of a cushion's counter, and on its check destroys a cushion in lava or fire.
 * @returns Whether the cushion was destroyed.
 */
export const updateCushion = (entity: DataEntity, host: CushionHost): boolean => {
    const ticks = (entity.instance.componentState.get(cushionState)?.ticks ?? 0) + 1;
    const checks = ticks >= CUSHION_CHECK_TICKS;
    entity.instance.componentState.set(cushionState, { ticks: checks ? 0 : ticks });
    if (!checks || !(host.inLava(entity) || host.touchesFire(entity))) return false;
    host.destroy(entity, cushionItemOf(entity.spawnData?.['variant']));
    return true;
};
