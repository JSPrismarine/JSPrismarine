import type { RegisterableGoal } from '../goal';
import { goal } from '../goal';
import { bodySchema, isRecord } from '../params';
import type { GoalSupport } from '../support';
import type { GoalMob } from '../world';

/**
 * Java's `LandOnOwnersShoulderGoal`, which a tamed parrot registers.
 *
 * Java has no goal that walks a parrot to its owner's shoulder. The parrot's `FollowOwnerGoal`
 * brings it close, and this goal seats it once its box touches its owner's: only on its owner,
 * only while it is not ordered to sit, not leashed and has been off a shoulder for more than 100
 * ticks, and only while the owner is not flying and not in water or powder snow. Bedrock's parrot
 * runs `minecraft:behavior.find_mount` instead, which walks to any mount within 16 blocks, so the
 * server swaps that goal for this one.
 */

/** The goal's name. Bedrock has no goal of this kind, so it carries the server's namespace. */
export const LAND_ON_OWNERS_SHOULDER = 'jsprismarine:behavior.land_on_owners_shoulder';

/** `ShoulderRidingEntity.canSitOnShoulder`: `rideCooldownCounter > 100`, counted in entity ticks. */
const RIDE_COOLDOWN_TICKS = 100;

/**
 * A player's box, which Java's `Avatar.STANDING_DIMENSIONS` sizes 0.6 across and 1.8 tall.
 *
 * @javaSource Avatar.STANDING_DIMENSIONS
 */
const PLAYER_BOX = { width: 0.6, height: 1.8 } as const;

/** The entity's own box, from `minecraft:collision_box`. */
const ownBox = (support: GoalSupport): { readonly width: number; readonly height: number } => {
    const box = support.entity.componentParams('minecraft:collision_box');
    return {
        width: isRecord(box) && typeof box.width === 'number' ? box.width : 0.5,
        height: isRecord(box) && typeof box.height === 'number' ? box.height : 0.9
    };
};

/** Whether the entity's box and the owner's intersect, as `AABB.intersects` tests them. */
const touches = (support: GoalSupport, owner: GoalMob): boolean => {
    const here = support.position();
    const there = owner.position();
    const box = ownBox(support);
    const across = (box.width + PLAYER_BOX.width) / 2;
    return (
        Math.abs(here.x - there.x) < across &&
        Math.abs(here.z - there.z) < across &&
        here.y < there.y + PLAYER_BOX.height &&
        there.y < here.y + box.height
    );
};

/**
 * Whether the owner can carry a parrot now: a player who is not flying and not in water or
 * powder snow, as `LandOnOwnersShoulderGoal.canUse` asks.
 */
const ownerCanCarry = (owner: GoalMob): boolean => {
    const view = owner.view();
    if (view.names?.('is_family')?.includes('player') !== true) return false;
    if (view.flag?.('in_water') === true) return false;
    if (view.names?.('has_ability')?.includes('flying') === true) return false;
    return view.names?.('in_block')?.includes('minecraft:powder_snow') !== true;
};

/** Java's `LandOnOwnersShoulderGoal`: see the module comment. */
export const landOnOwnersShoulder = goal<Record<string, unknown>>({
    name: LAND_ON_OWNERS_SHOULDER,
    // Java's goal sets no flags, so it runs beside the parrot's following and wandering.
    controlFlags: [],
    schema: bodySchema((body) => body),
    create: (_params, support) => {
        // `rideCooldownCounter` starts at 0 when the parrot appears and again when it leaves a shoulder.
        let offShoulderSince: number | undefined = support.world.gameTime?.();
        const now = (): number => support.world.gameTime?.() ?? 0;
        const cooledDown = (): boolean => {
            if (support.world.vehicle?.() !== undefined) offShoulderSince = undefined;
            offShoulderSince ??= now();
            return now() - offShoulderSince > RIDE_COOLDOWN_TICKS;
        };
        const usable = (): boolean => {
            const owner = support.world.owner?.();
            const ready = cooledDown();
            return owner !== undefined && ownerCanCarry(owner) && !support.flag('is_sitting') && ready;
        };
        return {
            canStart: usable,
            canContinue: usable,
            tick: () => {
                const owner = support.world.owner?.();
                if (owner === undefined || support.world.vehicle?.() !== undefined) return;
                if (support.flag('is_sitting') || support.flag('is_leashed')) return;
                if (touches(support, owner)) support.world.mount?.(owner);
            }
        };
    }
});

/** The goals Java registers that Bedrock writes no goal for. */
export const javaOnlyGoals: readonly RegisterableGoal[] = [landOnOwnersShoulder];
