import { Vector3 } from '@jsprismarine/math';
import { LevelSoundEvent } from '@jsprismarine/minecraft';
import { Position } from '../world/Position';
import type { Entity } from './Entity';
import Arrow from './other/Arrow';

/**
 * Loosing an arrow from a bow.
 *
 * Split out from the packet handler because the charge maths is the interesting part and belongs
 * where it can be read and tested, rather than in the middle of a switch on transaction types.
 * @see https://minecraft.wiki/w/Bow
 */

/** The item that does this. */
export const BOW = 'minecraft:bow';

/** Ticks to draw a bow fully. Vanilla's second. */
const FULL_DRAW_TICKS = 20;

/** Blocks per tick a fully-drawn shot leaves at. Vanilla's three. */
const MAX_SPEED = 3;

/** Below this the bow is barely drawn and the shot is not worth taking. */
const MIN_POWER = 0.1;

/**
 * How much of a full draw was actually pulled.
 *
 * Vanilla's curve rather than a straight fraction of the time, and the difference matters: the
 * curve is slow at first and fast at the end, so the last few ticks of a draw are worth far more
 * than the first few. That is what makes half-drawing a bow feel weak rather than merely weaker.
 * @param {number} ticks - How long the bow was held.
 * @returns {number} Nought to one.
 */
export const drawPower = (ticks: number): number => {
    const drawn = ticks / FULL_DRAW_TICKS;
    const power = (drawn * drawn + drawn * 2) / 3;

    return Math.min(1, power);
};

/**
 * The unit vector an entity is looking along.
 *
 * Minecraft's own convention, and it is not the obvious one: yaw runs clockwise from south, so the
 * x term is a negative sine and the z term a positive cosine. Getting it wrong sends every arrow
 * off at ninety degrees to where the player was aiming, which looks like a physics bug rather than
 * a sign error.
 * @param {number} yaw - Degrees.
 * @param {number} pitch - Degrees; positive is downwards.
 * @returns {Vector3} Where they are looking, of length one.
 */
export const lookVector = (yaw: number, pitch: number): Vector3 => {
    const yawRadians = (yaw * Math.PI) / 180;
    const pitchRadians = (pitch * Math.PI) / 180;
    const flat = Math.cos(pitchRadians);

    return new Vector3(-Math.sin(yawRadians) * flat, -Math.sin(pitchRadians), Math.cos(yawRadians) * flat);
};

/**
 * Fires an arrow from where an entity is looking.
 *
 * The shot starts at the shooter's own position, which for a player is already their eyes - so
 * nothing has to be added on top, and adding an eye height would put the arrow above their head.
 * @param {Entity} shooter - Who drew the bow.
 * @param {number} ticks - How long they drew it for.
 * @returns {Promise<boolean>} `false` if the draw was too short to be worth loosing.
 */
export const loose = async (shooter: Entity, ticks: number): Promise<boolean> => {
    const power = drawPower(ticks);
    if (power < MIN_POWER) return false;

    const world = shooter.getWorld();
    const from = shooter.getPosition();
    const heading = lookVector(shooter.yaw, shooter.pitch);
    const speed = power * MAX_SPEED;

    const arrow = new Arrow({
        position: new Position(from.getX(), from.getY(), from.getZ(), world),
        velocity: new Vector3(heading.getX() * speed, heading.getY() * speed, heading.getZ() * speed),
        owner: shooter
    });

    // Vanilla crits on a *full* draw rather than on falling, which is why the flag is set at launch
    // and not worked out on impact the way a melee critical is.
    arrow.setCritical(power >= 1);

    await world.addEntity(arrow);
    await world.sendActorSound(shooter, LevelSoundEvent.BOW);

    return true;
};
