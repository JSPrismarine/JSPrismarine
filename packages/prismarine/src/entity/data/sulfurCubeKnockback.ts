/**
 * The push a sulfur cube carrying a block takes, Java's `SulfurCube.knockback`.
 *
 * A cube with something in its body does not take `LivingEntity.knockback`. Its archetype's
 * `knockback_modifiers` size the push, and three angles aim it: how far off the cube's center the
 * attacker looks (`applyHorizontalHitAngleScale`), how high on the cube it looks
 * (`applyVerticalHitAnglePowerTransfer`), and how far above or below the cube it stands
 * (`applyVerticalPositionAnglePowerRotation`). The push adds to what the cube was doing rather than
 * halving it.
 */
import type { EntityPosition } from '@jsprismarine/entities';

/** An archetype's `knockback_modifiers`: the horizontal and vertical power of a push. */
export interface SulfurCubeKnockbackModifiers {
    readonly horizontal: number;
    readonly vertical: number;
}

/**
 * Each archetype's `knockback_modifiers`, from Java 26.3's
 * `data/minecraft/sulfur_cube_archetype/<archetype>.json`, by the archetype's name, which is also
 * the value of Bedrock's `minecraft:sulfur_cube_archetype` property. The items of
 * `#minecraft:sulfur_cube_archetype/<archetype>` give a cube that archetype.
 */
export const SULFUR_CUBE_KNOCKBACK: ReadonlyMap<string, SulfurCubeKnockbackModifiers> = new Map([
    ['bouncy', { horizontal: 0.4125, vertical: 0.105 }],
    ['explosive', { horizontal: 0.4125, vertical: 0.09 }],
    ['fast_flat', { horizontal: 0.9125, vertical: 0.09 }],
    ['fast_sliding', { horizontal: 0.6625, vertical: 0.09 }],
    ['high_resistance', { horizontal: 0.4125, vertical: 0.09 }],
    ['hot', { horizontal: 0.4125, vertical: 0.09 }],
    ['light', { horizontal: 0.4125, vertical: 0.18 }],
    ['regular', { horizontal: 0.4125, vertical: 0.09 }],
    ['slow_bouncy', { horizontal: 0.4125, vertical: 0.24 }],
    ['slow_flat', { horizontal: 0.4125, vertical: 0.105 }],
    ['slow_sliding', { horizontal: 0.4125, vertical: 0.09 }],
    ['sticky', { horizontal: 0.4125, vertical: 0.09 }]
]);

/** How much an off-center look turns the push, `SulfurCube.knockback`'s 1.6. */
const HIT_ANGLE_SCALE = 1.6;
/** How much of the push a look at the cube's top or bottom moves between the two powers, its 0.5. */
const POWER_TRANSFER_SCALE = 0.5;
/** How much standing above or below the cube turns the powers, its 0.8. */
const POSITION_ROTATION_SCALE = 0.8;
/** What the horizontal power is scaled by before it is applied, its 0.4. */
const HORIZONTAL_SCALE = 0.4;
/** What the vertical power is scaled by as it is applied, its 1.2. */
const VERTICAL_SCALE = 1.2;
/** What the strength of an extra push scales it by, its 0.25. */
const EXTRA_SCALE = 0.25;
/** The most either power can be, `Mth.clamp(power, -128, 128)`. */
const POWER_CAP = 128;

/** Where the attacker is and where it looks. */
export interface SulfurCubeAttacker {
    /** Its feet. */
    readonly position: EntityPosition;
    /** Its eyes, Java's `getEyePosition`. */
    readonly eye: EntityPosition;
    /** The way it looks, Java's `getLookAngle`. Only its direction counts. */
    readonly look: EntityPosition;
}

/** One push on a cube carrying a block. */
export interface SulfurCubeShove {
    /** The cube's velocity before the push. */
    readonly velocity: EntityPosition;
    /** The cube's feet. */
    readonly position: EntityPosition;
    /** The cube's height, which puts the center of its box and its top and bottom. */
    readonly height: number;
    /** The cube's knockback resistance. */
    readonly resistance: number;
    readonly modifiers: SulfurCubeKnockbackModifiers;
    readonly attacker: SulfurCubeAttacker;
    /** The way toward what pushes, horizontally, Java's `xd` and `zd`. */
    readonly toward: { readonly x: number; readonly z: number };
    /** The strength `knockback` was called with, which only an extra push reads. */
    readonly power: number;
    /** The blow's damage, whose square root scales the push. */
    readonly damage: number;
    /** Whether this is an attack's extra push, Java's last `knockback` argument. */
    readonly extra: boolean;
}

/** `Vec2.rotate`. */
const rotate = (x: number, y: number, angle: number): { readonly x: number; readonly y: number } => ({
    x: x * Math.cos(angle) - y * Math.sin(angle),
    y: y * Math.cos(angle) + x * Math.sin(angle)
});

/** `Vec3.normalize`, which leaves a vector too short to have a direction at zero. */
const normalize = (vector: EntityPosition): EntityPosition => {
    const length = Math.hypot(vector.x, vector.y, vector.z);
    return length < 1e-5 ? { x: 0, y: 0, z: 0 } : { x: vector.x / length, y: vector.y / length, z: vector.z / length };
};

const minus = (a: EntityPosition, b: EntityPosition): EntityPosition => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

/** `Mth.clampedMap`. */
const clampedMap = (value: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number => {
    const delta = (value - fromMin) / (fromMax - fromMin);
    if (delta < 0) return toMin;
    if (delta > 1) return toMax;
    return toMin + delta * (toMax - toMin);
};

const clampPower = (power: number): number => Math.min(POWER_CAP, Math.max(-POWER_CAP, power));

/**
 * The velocity one push leaves a cube carrying a block with, Java's `SulfurCube.knockback`.
 *
 * @returns The new velocity.
 */
export const sulfurCubeKnockback = (shove: SulfurCubeShove): EntityPosition => {
    const { attacker, modifiers } = shove;
    const look = normalize(attacker.look);
    const center = { ...shove.position, y: shove.position.y + shove.height / 2 };

    // applyHorizontalHitAngleScale: the signed angle between the look and the line to the center.
    const toCenter = normalize(minus(center, attacker.eye));
    const offCenter = Math.atan2(look.x * toCenter.z - look.z * toCenter.x, look.x * toCenter.x + look.z * toCenter.z);
    const direction = rotate(shove.toward.x, shove.toward.z, offCenter * HIT_ANGLE_SCALE);

    // applyVerticalHitAnglePowerTransfer: a look at the bottom moves power from across to up.
    const half = shove.height / 2;
    const toTop = normalize(minus({ ...center, y: center.y + half }, attacker.eye));
    const toBottom = normalize(minus({ ...center, y: center.y - half }, attacker.eye));
    const transfer = clampedMap(look.y, toTop.y, toBottom.y, -1, 1) * POWER_TRANSFER_SCALE;
    const transferred = { x: modifiers.horizontal * (1 - transfer), y: modifiers.vertical * (1 + transfer) };

    // applyVerticalPositionAnglePowerRotation: standing below turns power upward, never past the archetype's own.
    const offset = minus(shove.position, attacker.position);
    const elevation = Math.atan2(-offset.y, Math.hypot(offset.x, offset.z));
    let powers = rotate(transferred.x, transferred.y, -elevation * POSITION_ROTATION_SCALE);
    const overHorizontal = modifiers.horizontal > 0 ? Math.abs(powers.x) / modifiers.horizontal : 0;
    const overVertical = modifiers.vertical > 0 ? Math.abs(powers.y) / modifiers.vertical : 0;
    const over = Math.max(overHorizontal, overVertical);
    if (over > 1) powers = { x: powers.x / over, y: powers.y / over };

    const strength = Math.sqrt(shove.damage) * (shove.extra ? shove.power * EXTRA_SCALE : 1);
    const resisted = 1 - shove.resistance;
    const horizontal = clampPower(powers.x * strength * resisted * HORIZONTAL_SCALE);
    const vertical = clampPower(powers.y * strength * resisted);

    const across = Math.hypot(direction.x, direction.y);
    const pushX = across < 1e-5 ? 0 : (direction.x / across) * horizontal;
    const pushZ = across < 1e-5 ? 0 : (direction.y / across) * horizontal;
    return {
        x: shove.velocity.x - pushX,
        y: shove.velocity.y + vertical * VERTICAL_SCALE,
        z: shove.velocity.z - pushZ
    };
};
