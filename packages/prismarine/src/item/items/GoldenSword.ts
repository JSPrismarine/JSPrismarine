import { Item } from '../Item';

/**
 * `minecraft:golden_sword`.
 *
 * @deprecated There are no item classes any more; every number this answers
 *   comes from Java's data components through {@link Item}. Kept only so the
 *   entity tests that still construct one keep compiling - build
 *   `new Item({ name: 'minecraft:golden_sword' })` instead.
 */
export default class GoldenSword extends Item {
    public constructor() {
        super({ name: 'minecraft:golden_sword' });
    }
}
