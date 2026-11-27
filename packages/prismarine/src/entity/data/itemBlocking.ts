/**
 * What a raised shield does to a blow, Java's `LivingEntity.applyItemBlocking` and the
 * `minecraft:blocks_attacks` component it reads.
 *
 * A Bedrock player raises a shield by sneaking, which is input the client decides (exclusion 2
 * of the parity claim). Whether the raised shield turns a blow aside, by how much, and what that
 * does to the shield and the attacker is the server's, and these are Java's rules for it.
 *
 * @javaSee LivingEntity.applyItemBlocking
 */
import type { EntityPosition } from '@jsprismarine/entities';
import type { HolderSet } from '@jsprismarine/items';

/** One entry of `minecraft:blocks_attacks.damage_reductions`, as the item component parses it. */
export interface DamageReduction {
    /** The damage types it blocks, or every type when left out. */
    readonly type?: HolderSet;
    readonly base?: number;
    readonly factor?: number;
    /** The widest angle, in degrees, between the look and the blow it blocks. */
    readonly horizontal_blocking_angle?: number;
}

/** What {@link blockedDamage} reads of `minecraft:blocks_attacks`. */
export interface BlockingRules {
    readonly damage_reductions?: readonly DamageReduction[];
}

/**
 * The reduction a `minecraft:blocks_attacks` without `damage_reductions` gets, Java's codec
 * default: the whole blow, from up to 90 degrees off the look.
 */
const DEFAULT_REDUCTIONS: readonly DamageReduction[] = [{ horizontal_blocking_angle: 90, base: 0, factor: 1 }];

/** Ticks per second, which `block_delay_seconds` and the disable time are written in. */
const TICKS_PER_SECOND = 20;

/**
 * The angle between where a blocker looks and where a blow came from, horizontally, in radians,
 * as `applyItemBlocking` measures it: `acos` of the look along the yaw and the way to the blow.
 * A blow with no position, such as a fall, is π, which no reduction blocks.
 *
 * @param at - The blocker's position.
 * @param yaw - The blocker's head yaw, in degrees.
 * @param from - Where the blow came from, or undefined when it came from nowhere.
 */
export const blockingAngle = (at: EntityPosition, yaw: number, from: EntityPosition | undefined): number => {
    if (from === undefined) return Math.PI;
    const dx = from.x - at.x;
    const dz = from.z - at.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-5) return Math.PI / 2;
    const radians = (yaw * Math.PI) / 180;
    // `calculateViewVector(0, yaw)`.
    const dot = (-Math.sin(radians) * dx + Math.cos(radians) * dz) / length;
    return Math.acos(Math.min(1, Math.max(-1, dot)));
};

/**
 * How much of a blow a raised item blocks, Java's `BlocksAttacks.resolveBlockedDamage`: the sum
 * of each reduction that applies, `base + factor * amount` held within the blow, and the total
 * held within it too.
 *
 * @param inSet - Whether the blow's damage type is in a reduction's `type` set.
 * @javaSource BlocksAttacks.resolveBlockedDamage
 */
export const blockedDamage = (
    rules: BlockingRules,
    amount: number,
    angle: number,
    inSet: (set: HolderSet) => boolean
): number => {
    let blocked = 0;
    for (const reduction of rules.damage_reductions ?? DEFAULT_REDUCTIONS) {
        if (angle > ((reduction.horizontal_blocking_angle ?? 90) * Math.PI) / 180) continue;
        if (reduction.type !== undefined && !inSet(reduction.type)) continue;
        blocked += Math.min(amount, Math.max(0, (reduction.base ?? 0) + (reduction.factor ?? 1) * amount));
    }
    return Math.min(amount, Math.max(0, blocked));
};

/** The ticks a raised item takes to start blocking, `BlocksAttacks.blockDelayTicks`. */
export const blockDelayTicks = (seconds: number | undefined): number => Math.round((seconds ?? 0) * TICKS_PER_SECOND);

/**
 * How long a blow disables a raised item, `BlocksAttacks.disableBlockingForTicks`: the weapon's
 * `disable_blocking_for_seconds` scaled by the item's `disable_cooldown_scale`, in ticks.
 */
export const disableTicks = (seconds: number, scale: number | undefined): number => {
    const scaled = seconds * (scale ?? 1);
    return scaled > 0 ? Math.round(scaled * TICKS_PER_SECOND) : 0;
};

/**
 * The push a ravager whose blow was blocked gives the blocker instead of being stunned, Java's
 * `Ravager.strongKnockback`: 4 across, over the square of the distance, and 0.2 up. Java decides
 * it, as it decides a goal's numbers (ADR 0024), over the 3 of the pack's `knockback_strength`.
 *
 * @param from - The ravager.
 * @param to - The blocker.
 */
export const strongKnockback = (from: EntityPosition, to: EntityPosition): EntityPosition => {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const squared = Math.max(dx * dx + dz * dz, 0.001);
    return { x: (dx / squared) * 4, y: 0.2, z: (dz / squared) * 4 };
};
