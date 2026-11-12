import { describe, expect, it } from 'vitest';

import type { AttributeWrite } from './attributes';
import { Attributes } from './attributes';

describe('Attributes.setMax', () => {
    it('moves the maximum and holds the base and the value now to it, reporting the write', () => {
        const writes: AttributeWrite[] = [];
        const attributes = new Attributes(new Map(), (write) => writes.push(write));
        attributes.define('health', { base: 20 });
        writes.length = 0;

        expect(attributes.setMax('health', 10)).toBe(10);

        expect(attributes.get('health')).toEqual({ base: 10, min: 0, max: 10, current: 10 });
        expect(writes).toEqual([
            {
                name: 'health',
                before: { base: 20, min: 0, max: 20, current: 20 },
                after: { base: 10, min: 0, max: 10, current: 10 }
            }
        ]);
    });

    it('raises the maximum without filling the value up to it', () => {
        const attributes = new Attributes();
        attributes.define('health', { base: 20 });

        expect(attributes.setMax('health', 40)).toBe(40);

        expect(attributes.get('health')).toEqual({ base: 20, min: 0, max: 40, current: 20 });
    });

    it('keeps the maximum at or above the minimum', () => {
        const attributes = new Attributes();
        attributes.define('health', { base: 20, min: 1 });

        expect(attributes.setMax('health', -5)).toBe(1);
        expect(attributes.get('health')?.current).toBe(1);
    });

    it('answers undefined for an attribute no component declares', () => {
        expect(new Attributes().setMax('health', 10)).toBeUndefined();
    });
});
