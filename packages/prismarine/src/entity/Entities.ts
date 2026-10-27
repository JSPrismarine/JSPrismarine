/**
 * The entity classes this server still writes by hand.
 *
 * Every mob is a component set in the data-driven runtime now, with a `GenericEntity` for a
 * body; see `data/EntityRuntime`. This file used to carry 111 classes beside it, one per
 * species, and all but these five were a name and a `MOB_ID`.
 *
 * A dropped stack has no behavior-pack entity file, and `Human` is the player body. The projectile
 * classes only restore actors from older saves; new projectiles use their `minecraft:projectile`
 * definitions. Falling blocks and TNT both run through the data-driven runtime.
 */
import type { SpawnableEntityClass } from './Entity';
import Player from './Human';
import Arrow from './other/Arrow';
import Egg from './other/Egg';
import { Item } from './other/Item';
import Snowball from './other/Snowball';

export { Arrow, Egg, Item, Player, Snowball };

/** @see {@link writtenEntities} */
let index: ReadonlyMap<string, SpawnableEntityClass> | undefined;

/**
 * The written classes a position alone can build, by the identifier each carries.
 *
 * A function rather than a constant so the map is built after every module in the import cycle
 * has loaded, then memoized.
 * @returns {ReadonlyMap<string, SpawnableEntityClass>} The classes, keyed by `MOB_ID`.
 */
export const writtenEntities = (): ReadonlyMap<string, SpawnableEntityClass> =>
    (index ??= new Map([Arrow, Egg, Item, Player, Snowball].map((written) => [written.MOB_ID, written])));
