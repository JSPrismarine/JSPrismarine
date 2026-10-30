import { describe, expect, it } from 'vitest';

import { CommandRequestPacket, SetHealthPacket, SetTimePacket } from '@jsprismarine/protocol';
import SetCommandsEnabledPacket from '@jsprismarine/protocol/packet/SetCommandsEnabledPacket';
import SetDifficultyPacket from '@jsprismarine/protocol/packet/SetDifficultyPacket';
import ChangeDimensionPacket from '@jsprismarine/protocol/packet/ChangeDimensionPacket';
import PlayerHotbarPacket from '@jsprismarine/protocol/packet/PlayerHotbarPacket';
import RespawnPacket from '@jsprismarine/protocol/packet/RespawnPacket';
import SetSpawnPositionPacket from '@jsprismarine/protocol/packet/SetSpawnPositionPacket';
import Identifiers from '../Identifiers';
import * as Packets from '../Packets';
import Codec2193 from './Codec2193';
import { codecForProtocol, latestCodec } from './CodecRegistry';

describe('network/codec', () => {
    describe('Codec2193', () => {
        it('speaks protocol 2193, which Identifiers lists among the supported versions', () => {
            expect(Codec2193.protocolVersion).toBe(2193);
            expect(Identifiers.Protocol).toBe(latestCodec.protocolVersion);
            for (const version of Codec2193.minecraftVersions) {
                expect(Identifiers.MinecraftVersions).toContain(version);
            }
        });

        it('lists every packet id under its class name, each id once', () => {
            const entries = Object.entries(Codec2193.ids);
            const implemented = new Set([
                ...Object.keys(Packets),
                CommandRequestPacket.name,
                SetCommandsEnabledPacket.name,
                SetDifficultyPacket.name,
                SetHealthPacket.name,
                ChangeDimensionPacket.name,
                PlayerHotbarPacket.name,
                RespawnPacket.name,
                SetSpawnPositionPacket.name,
                SetTimePacket.name
            ]);
            expect(entries.length).toBeGreaterThan(0);
            for (const [name, id] of entries) {
                expect(Codec2193.netIdOf(name), name).toBe(id);
                // Ids without a class are protocol surface the server has not implemented;
                // the codec resolves exactly the ones the barrel exports.
                if (implemented.has(name)) expect(Codec2193.createPacket(id)?.getName(), name).toBe(name);
                else expect(Codec2193.createPacket(id), name).toBeNull();
            }
            expect(new Set(entries.map(([, id]) => id)).size).toBe(entries.length);
        });

        it('builds a packet that decodes the bytes it was given', () => {
            const outbound = new SetTimePacket({ time: 4321 });
            outbound.encode();

            const inbound = Codec2193.createPacket(Codec2193.netIdOf('SetTimePacket')!, outbound.getBuffer());
            expect(inbound).toBeInstanceOf(SetTimePacket);
            inbound!.decode();
            expect(inbound?.getPacketData()).toEqual({ time: 4321 });
        });

        it('returns null for an id it does not list', () => {
            expect(Codec2193.createPacket(0x3ff)).toBeNull();
        });
    });

    describe('CodecRegistry', () => {
        it('resolves 2193 and refuses a version no codec speaks', () => {
            expect(codecForProtocol(2193)).toBe(Codec2193);
            expect(codecForProtocol(1)).toBeUndefined();
            expect(latestCodec.protocolVersion).toBeGreaterThanOrEqual(Codec2193.protocolVersion);
        });
    });
});
