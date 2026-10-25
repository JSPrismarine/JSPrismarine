import { Item } from '../Item';

/**
 * `minecraft:iron_chestplate`.
 *
 * @deprecated There are no item classes any more; every number this answers
 *   comes from Java's data components through {@link Item}. Kept only so the
 *   entity tests that still construct one keep compiling - build
 *   `new Item({ name: 'minecraft:iron_chestplate' })` instead.
 */
export default class IronChestplate extends Item {
    public constructor() {
        super({ name: 'minecraft:iron_chestplate' });
    }
}
