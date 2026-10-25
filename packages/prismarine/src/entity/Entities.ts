/**
 * The entity classes this server still writes by hand.
 *
 * Every mob is a component set in the data-driven runtime now, with a `GenericEntity` for a
 * body; see `data/EntityRuntime`. This file used to carry 111 classes beside it, one per
 * species, and all but these seven were a name and a `MOB_ID`.
 *
 * What is left is the entities whose behavior no behavior pack describes. A dropped stack
 * holds an item and a pickup timer, a lit TNT counts a fuse down to an explosion, a falling
 * block carries the block it is made of, and the three thrown things fly a ballistic arc and
 * do something where they land. `Human` is here because a player is one.
 */
import type { SpawnableEntityClass } from './Entity';
import Player from './Human';
import Arrow from './other/Arrow';
import Egg from './other/Egg';
import FallingBlock from './other/FallingBlock';
import { Item } from './other/Item';
import Snowball from './other/Snowball';
import Tnt from './other/Tnt';

export { Arrow, Egg, FallingBlock, Item, Player, Snowball, Tnt };

/** @see {@link writtenEntities} */
let index: ReadonlyMap<string, SpawnableEntityClass> | undefined;

/**
 * The written classes a position alone can build, by the identifier each carries.
 *
 * `FallingBlock` is absent because it also needs the block it is made of, so whatever knows
 * that builds it directly. A function rather than a constant so the map is built after every
 * module in the import cycle has loaded, and memoized because six call sites read it.
 * @returns {ReadonlyMap<string, SpawnableEntityClass>} The classes, keyed by `MOB_ID`.
 */
export const writtenEntities = (): ReadonlyMap<string, SpawnableEntityClass> =>
    (index ??= new Map([Arrow, Egg, Item, Player, Snowball, Tnt].map((written) => [written.MOB_ID, written])));
