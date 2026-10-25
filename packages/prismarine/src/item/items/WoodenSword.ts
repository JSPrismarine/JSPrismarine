import { Item } from '../Item';

/**
 * `minecraft:wooden_sword`.
 *
 * @deprecated There are no item classes any more; every number this answers
 *   comes from Java's data components through {@link Item}. Kept only so the
 *   entity tests that still construct one keep compiling - build
 *   `new Item({ name: 'minecraft:wooden_sword' })` instead.
 */
export default class WoodenSword extends Item {
    public constructor() {
        super({ name: 'minecraft:wooden_sword' });
    }
}
