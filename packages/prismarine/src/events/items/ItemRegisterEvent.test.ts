import { describe, it, expect } from 'vitest';

import ItemRegisterEvent from './ItemRegisterEvent';
import Item from '../../item/Item';

describe('ItemRegisterEvent', () => {
    it('should construct the event with the provided item', () => {
        const item = new Item({ id: 1, name: 'test' });
        const event = new ItemRegisterEvent(item);
        expect(event.getItem()).toBe(item);
    });
});
