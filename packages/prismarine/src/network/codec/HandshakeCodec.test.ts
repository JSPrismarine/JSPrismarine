import { describe, expect, it } from 'vitest';
import {
    DisconnectPacket,
    NetworkSettingsPacket,
    PlayStatusPacket,
    RequestNetworkSettingsPacket
} from '@jsprismarine/protocol';

import Codec2193 from './Codec2193';
import { latestCodec } from './CodecRegistry';
import HandshakeCodec from './HandshakeCodec';
import LoginPacket from '../packet/LoginPacket';

describe('network/codec/HandshakeCodec', () => {
    const handshakePackets = [RequestNetworkSettingsPacket, NetworkSettingsPacket, PlayStatusPacket, DisconnectPacket];

    it('builds exactly the pre-negotiation packets, with their 2193 ids', () => {
        for (const packetClass of handshakePackets) {
            const netId = HandshakeCodec.netIdOf(packetClass.name);
            expect(netId, packetClass.name).toBe(Codec2193.netIdOf(packetClass.name));
            expect(HandshakeCodec.createPacket(netId!), packetClass.name).toBeInstanceOf(packetClass);
        }
    });

    it('does not build a packet negotiation has not been completed for', () => {
        const loginId = Codec2193.netIdOf(LoginPacket.name)!;
        expect(Codec2193.createPacket(loginId)).toBeInstanceOf(LoginPacket);
        expect(HandshakeCodec.createPacket(loginId)).toBeNull();
        expect(HandshakeCodec.netIdOf(LoginPacket.name)).toBeUndefined();
    });

    it('advertises the newest protocol version, which is what a refusal names', () => {
        expect(HandshakeCodec.protocolVersion).toBe(latestCodec.protocolVersion);
        expect(HandshakeCodec.minecraftVersions).toStrictEqual(latestCodec.minecraftVersions);
    });
});
