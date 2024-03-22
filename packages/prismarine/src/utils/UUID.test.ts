import { describe, it, expect } from 'vitest';

import BinaryStream from '@jsprismarine/jsbinaryutils';
import UUID from './UUID';

describe('utils', () => {
    describe('UUID', () => {
        it('should create a proper UUID from parts', () => {
            let uuid = new UUID(1, 1, 1, 1);
            expect(uuid.toString()).toBe('00000001-0000-0001-0000-000100000001');
            expect(uuid.getParts()).toStrictEqual([1, 1, 1, 1]);

            uuid = new UUID(75, 8000, 10095, 1337);
            expect(uuid.toString()).toBe('0000004b-0000-1f40-0000-276f00000539');
            expect(uuid.getParts()).toStrictEqual([75, 8000, 10095, 1337]);
        });

        it('toBinary() should return proper parts', () => {
            const uuid = UUID.fromRandom();
            const binary = new BinaryStream(uuid.toBinary());
            const parts = uuid.getParts();

            expect(binary.readInt()).toBe(parts[0]);
            expect(binary.readInt()).toBe(parts[1]);
            expect(binary.readInt()).toBe(parts[2]);
            expect(binary.readInt()).toBe(parts[3]);
        });
    });
});
