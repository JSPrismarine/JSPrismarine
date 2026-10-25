import { Item } from '../Item';

/**
 * `minecraft:diamond_helmet`.
 *
 * @deprecated There are no item classes any more; every number this answers
 *   comes from Java's data components through {@link Item}. Kept only so the
 *   entity tests that still construct one keep compiling - build
 *   `new Item({ name: 'minecraft:diamond_helmet' })` instead.
 */
export default class DiamondHelmet extends Item {
    public constructor() {
        super({ name: 'minecraft:diamond_helmet' });
    }
}
