import { describe, expect, it } from 'vitest';
import { netIdFor } from '../codec/v2193';

import UpdateSoftEnumPacket, { SoftEnumUpdateType } from './UpdateSoftEnumPacket';

/** A varuint length and the UTF-8 bytes. */
const text = (value: string): number[] => {
    const bytes = Buffer.from(value, 'utf8');

    return [bytes.byteLength, ...bytes];
};

describe('network', () => {
    describe('UpdateSoftEnumPacket', () => {
        it('writes Enum Name, Values and Update Type in docs order', () => {
            const packet = Object.assign(new UpdateSoftEnumPacket(), {
                enumName: 'players',
                values: ['alice', 'bob'],
                type: SoftEnumUpdateType.REPLACE
            });
            packet.encode();

            expect([...packet.getBuffer()]).toEqual([
                netIdFor('UpdateSoftEnumPacket'),
                ...text('players'),
                2,
                ...text('alice'),
                ...text('bob'),
                SoftEnumUpdateType.REPLACE
            ]);
        });

        it('writes an empty value list as a bare zero count, with the type still after it', () => {
            const packet = Object.assign(new UpdateSoftEnumPacket(), {
                enumName: 'x',
                values: [],
                type: SoftEnumUpdateType.REMOVE
            });
            packet.encode();

            expect([...packet.getBuffer()]).toEqual([
                netIdFor('UpdateSoftEnumPacket'),
                ...text('x'),
                0,
                SoftEnumUpdateType.REMOVE
            ]);
        });

        it('round-trips Enum Name, Values and Update Type', () => {
            const packet = Object.assign(new UpdateSoftEnumPacket(), {
                enumName: 'playerNames',
                values: ['Steve', 'Alex'],
                type: SoftEnumUpdateType.REPLACE
            });
            packet.encode();

            const decoded = new UpdateSoftEnumPacket(packet.getBuffer());
            decoded.decode();

            expect(decoded.enumName).toBe('playerNames');
            expect(decoded.values).toEqual(['Steve', 'Alex']);
            expect(decoded.type).toBe(SoftEnumUpdateType.REPLACE);
            expect(decoded.feof()).toBe(true);
        });
    });
});
