import { describe, expect, it } from 'vitest';

import { Item } from '../item/Item';
import ContainerEntry from './ContainerEntry';

describe('a container entry', () => {
    it('uses the item stack count when no separate count is provided', () => {
        const entry = new ContainerEntry({ item: new Item({ name: 'minecraft:diamond', count: 12 }) });

        expect(entry.getCount()).toBe(12);
    });
});
