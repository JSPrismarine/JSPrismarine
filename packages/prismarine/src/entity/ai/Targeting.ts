import { Gametype } from '@jsprismarine/minecraft';
import type { Entity } from '../Entity';
import type Player from '../../Player';
import type { Mob } from '../Mob';

/**
 * Who a mob is willing to go after, and how far away that is.
 *
 * Shared by the goals that pick a target and the ones that act on it, so "is that worth chasing"
 * is answered the same way everywhere. A goal that decided it for itself would let one goal walk
 * towards something another had already ruled out.
 *
 * Everything here is a plain function over `Entity`, and `Player` is imported for its type only -
 * these are reached from `Mob`, and anything importing `Player` for real would close a cycle.
 */

/** What a mob might want to fight, and what it does about it. */
export type TargetFilter = (candidate: Entity, mob: Mob) => boolean;

/**
 * Species a golem or a tamed wolf will start a fight with.
 *
 * Not the same list as `MobSpawner`'s hostile species, and deliberately so: that one is a table of
 * spawn weights, which is a different question. Creepers are absent for vanilla's reason - a golem
 * that charged a creeper would set it off in the middle of the village it is guarding.
 */
const DEFENDS_AGAINST: ReadonlySet<string> = new Set([
    'minecraft:cave_spider',
    'minecraft:drowned',
    'minecraft:husk',
    'minecraft:pillager',
    'minecraft:ravager',
    'minecraft:silverfish',
    'minecraft:skeleton',
    'minecraft:spider',
    'minecraft:stray',
    'minecraft:vex',
    'minecraft:vindicator',
    'minecraft:witch',
    'minecraft:wither_skeleton',
    'minecraft:zoglin',
    'minecraft:zombie',
    'minecraft:zombie_villager',
    'minecraft:zombie_villager_v2'
]);

/** The identifier every human entity carries. */
const PLAYER_TYPE = 'minecraft:player';

/**
 * Whether an entity is a person.
 *
 * By identifier rather than `instanceof`, for the reason `DeathMessages` gives: importing `Player`
 * for real from anything a `Mob` reaches would close a runtime cycle.
 * @param {Entity} entity - Who to test.
 * @returns {boolean} `true` for a player.
 */
export const isPlayer = (entity: Entity): boolean => entity.getType() === PLAYER_TYPE;

/**
 * Whether this is something a mob could attack at all.
 *
 * Creative and spectator players are not prey - vanilla mobs ignore them, and a zombie beating on
 * somebody who cannot be hurt is both wrong and a permanent distraction from anything real.
 * @param {Entity} candidate - Who is being sized up.
 * @returns {boolean} `true` if it is worth going after.
 */
export const isAttackable = (candidate: Entity): boolean => {
    if (!candidate.isAlive()) return false;

    if (isPlayer(candidate)) {
        const { gamemode } = candidate as Player;
        return gamemode !== Gametype.CREATIVE && gamemode !== Gametype.SPECTATOR;
    }

    return true;
};

/** A filter that picks out players, which is what an ordinary hostile mob hunts. */
export const players: TargetFilter = (candidate) => isPlayer(candidate) && isAttackable(candidate);

/**
 * A filter that picks out the monsters a village's defenders drive off.
 * @param {Entity} candidate - Who is being sized up.
 * @returns {boolean} `true` if a golem should see to it.
 */
export const monsters: TargetFilter = (candidate) =>
    DEFENDS_AGAINST.has(candidate.getType()) && isAttackable(candidate);

/**
 * Flat distance between two entities, ignoring how far apart they are vertically.
 *
 * Flat because that is the distance a mob actually has to walk, and because the two positions are
 * not measured from the same place: a player's is their eyes and a mob's is its feet, so the
 * vertical difference between them is partly just a height difference and not a gap at all.
 * @param {Entity} from - One of them.
 * @param {Entity} to - The other.
 * @returns {number} Blocks apart, horizontally.
 */
export const flatDistance = (from: Entity, to: Entity): number => {
    const a = from.getPosition();
    const b = to.getPosition();

    return Math.hypot(b.getX() - a.getX(), b.getZ() - a.getZ());
};
