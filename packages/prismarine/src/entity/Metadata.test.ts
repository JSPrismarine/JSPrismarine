import { describe, expect, it } from 'vitest';
import { MetadataWriter } from './Metadata';

describe('MetadataWriter', () => {
    it('should set and get property values correctly', () => {
        const metadata = new MetadataWriter();
        metadata.setLong(1, 123n);
        metadata.setShort(2, 456);
        metadata.setString(3, 'hello');
        metadata.setFloat(4, 3.14);

        expect(metadata.getPropertyValue(1)).toBe(123n);
        expect(metadata.getPropertyValue(2)).toBe(456);
        expect(metadata.getPropertyValue(3)).toBe('hello');
        expect(metadata.getPropertyValue(4)).toBe(3.14);
    });
});
