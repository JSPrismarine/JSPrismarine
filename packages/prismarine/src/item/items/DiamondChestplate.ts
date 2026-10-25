import { Item } from '../Item';

/**
 * `minecraft:diamond_chestplate`.
 *
 * @deprecated There are no item classes any more; every number this answers
 *   comes from Java's data components through {@link Item}. Kept only so the
 *   entity tests that still construct one keep compiling - build
 *   `new Item({ name: 'minecraft:diamond_chestplate' })` instead.
 */
export default class DiamondChestplate extends Item {
    public constructor() {
        super({ name: 'minecraft:diamond_chestplate' });
    }
}
