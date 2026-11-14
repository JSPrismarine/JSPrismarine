import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import BinaryStream from '@jsprismarine/binaryutils';
import { Gametype } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import { layoutAt } from '../wire/WireLayout';
import { setDefaultGameTypePacket } from '../wire/definitions/setDefaultGameType';

import { PacketIdentifier } from '../PacketIdentifier';
import SetDefaultGameTypePacket from './SetDefaultGameTypePacket';

/**
 * One ZigZag varint32 after the header. Spectator is 6, which ZigZag turns into 12, so a plain
 * LEB128 write of the same number would fail the comparison.
 */
describe('SetDefaultGameTypePacket', () => {
    it('writes the header and the ZigZag varint of the default game type', () => {
        const packet = new SetDefaultGameTypePacket();
        packet.gamemode = Gametype.SPECTATOR;
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([PacketIdentifier.SET_DEFAULT_GAME_TYPE, 0x0c]));
    });

    it('defaults to survival, which is a single zero byte', () => {
        const packet = new SetDefaultGameTypePacket();
        packet.encode();

        expect(packet.getBuffer()).toEqual(Buffer.from([PacketIdentifier.SET_DEFAULT_GAME_TYPE, 0x00]));
    });

    it('reads the default game type and consumes the whole buffer', () => {
        const packet = new SetDefaultGameTypePacket(Buffer.from([PacketIdentifier.SET_DEFAULT_GAME_TYPE, 0x04]));
        packet.decode();

        expect(packet.gamemode).toBe(Gametype.ADVENTURE);
        expect(packet.feof()).toBe(true);
    });
});

/**
 * The 1.26.50 docs page prints Default as 3, Spectator as 4 and WorldDefault as 5, and the 1.26.60
 * page prints 5, 6 and 0 with a changelog row for the change. Mojang's own 1.26.51 enum snapshot,
 * the 2193 release, already carries 5, 6 and 0, as does the one for 2225, so the code uses those
 * numbers at both versions and the 1.26.50 page is the documentation being corrected.
 */
describe('SetDefaultGameTypePacket game type numbering', () => {
    for (const version of ['v2193', 'v2225'] as const) {
        const snapshot: { enums: { GameType: { members: { name: string; value: number }[] } } } = JSON.parse(
            readFileSync(
                fileURLToPath(new URL(`../../../minecraft/datagen/snapshot/${version}/enums.json`, import.meta.url)),
                'utf8'
            )
        );

        it(`matches Mojang's ${version} GameType enum`, () => {
            const expected = Object.fromEntries(snapshot.enums.GameType.members.map((m) => [m.name, m.value]));

            expect(expected).toMatchObject({ Default: 5, Spectator: 6, WorldDefault: 0 });
            expect(Gametype.DEFAULT).toBe(expected.Default);
            expect(Gametype.SPECTATOR).toBe(expected.Spectator);
            expect(Gametype.WORLD_DEFAULT).toBe(expected.WorldDefault);
        });
    }

    for (const protocol of [2193, 2225]) {
        it(`round-trips Spectator as one ZigZag varint32 at protocol ${protocol}`, () => {
            const layout = layoutAt(setDefaultGameTypePacket, protocol);
            const stream = new BinaryStream();
            layout.encode(stream, { gamemode: Gametype.SPECTATOR });

            expect(stream.getBuffer()).toEqual(Buffer.from([0x0c]));
            expect(layout.decode(new BinaryStream(Buffer.from([0x0c])))).toEqual({ gamemode: Gametype.SPECTATOR });
        });
    }
});
