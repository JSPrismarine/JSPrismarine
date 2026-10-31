import { describe, expect, it } from 'vitest';

import { toDimensionId } from './support';

describe('toDimensionId', () => {
    it('namespaces a bare Java dimension name', () => {
        expect(toDimensionId('the_nether')).toBe('minecraft:the_nether');
        expect(toDimensionId('overworld')).toBe('minecraft:overworld');
        expect(toDimensionId('the_end')).toBe('minecraft:the_end');
    });

    it('translates the bare Bedrock spelling of the Nether', () => {
        expect(toDimensionId('nether')).toBe('minecraft:the_nether');
    });

    it('leaves a namespaced id alone', () => {
        expect(toDimensionId('minecraft:the_nether')).toBe('minecraft:the_nether');
        expect(toDimensionId('mypack:skylands')).toBe('mypack:skylands');
    });
});
