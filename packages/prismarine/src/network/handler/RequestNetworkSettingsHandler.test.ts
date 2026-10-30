import type { Logger } from '@jsprismarine/logger';
import {
    CompressionThreshold,
    NetworkSettingsPacket,
    PlayStatus,
    PlayStatusPacket,
    RequestNetworkSettingsPacket
} from '@jsprismarine/protocol';
import { DisconnectReason } from '@jsprismarine/minecraft';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { describe, expect, it, vi } from 'vitest';

import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type ClientConnection from '../ClientConnection';
import Codec2193 from '../codec/Codec2193';
import Codec2225 from '../codec/Codec2225';
import Identifiers from '../Identifiers';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import RequestNetworkSettingsHandler from './RequestNetworkSettingsHandler';

/**
 * A connection that records what was sent and whether it was hung up on.
 *
 * Nothing else is on the double: this is the first packet a client sends, so the handler
 * has no session or player to reach for.
 */
const fakeConnection = () => {
    const sent: Array<{ packet: NetworkPacket; comp: boolean | undefined }> = [];
    /** Packet names and the hang-up, in the order the handler asked for them. */
    const order: string[] = [];
    const disconnect = vi.fn(async () => void order.push('disconnect'));

    return {
        sent,
        order,
        disconnect,
        connection: stub<ClientConnection>({
            hasCompression: false,
            sendDataPacket: async (packet, comp) => {
                sent.push({ packet, comp });
                order.push(packet.getName());
            },
            disconnect
        })
    };
};

const request = (protocolVersion: number): RequestNetworkSettingsPacket =>
    new RequestNetworkSettingsPacket({ protocolVersion });

describe('RequestNetworkSettingsHandler', () => {
    const info = vi.fn();
    const server = stub<Server>({ getLogger: () => stub<Logger>({ info }) });

    it('answers a matching protocol with the network settings', async () => {
        const { sent, disconnect, connection } = fakeConnection();

        await new RequestNetworkSettingsHandler().handle(request(Codec2193.protocolVersion), server, connection);

        expect(sent).toHaveLength(1);
        expect(sent[0]!.packet).toBeInstanceOf(NetworkSettingsPacket);
        // What every later batch is framed under: Protocol compresses every packet with
        // zlib. Throttling is off.
        expect(sent[0]!.packet.getPacketData()).toMatchObject({
            compressionThreshold: CompressionThreshold.COMPRESS_EVERYTHING,
            compressionAlgorithm: PacketCompressionAlgorithm.ZLIB,
            clientThrottlingEnabled: false,
            clientThrottleThreshold: 0,
            clientThrottleScalar: 0
        });
        // The one packet that goes out before compression is on.
        expect(sent[0]!.comp).toBe(false);
        expect(connection.hasCompression).toBe(true);
        // The negotiation point: the session now speaks the codec the registry resolved.
        expect(connection.codec).toBe(Codec2193);
        expect(disconnect).not.toHaveBeenCalled();
    });

    it('assigns each announced version its own codec', async () => {
        const older = fakeConnection();
        await new RequestNetworkSettingsHandler().handle(request(Codec2193.protocolVersion), server, older.connection);
        expect(older.connection.codec).toBe(Codec2193);

        const newer = fakeConnection();
        await new RequestNetworkSettingsHandler().handle(request(Codec2225.protocolVersion), server, newer.connection);
        expect(newer.connection.codec).toBe(Codec2225);
        expect(newer.disconnect).not.toHaveBeenCalled();
    });

    it('tells an older client that it is out of date', async () => {
        // A bare disconnect here showed "Disconnected from Server" and nothing else (#1586).
        const { sent, order, disconnect, connection } = fakeConnection();

        await new RequestNetworkSettingsHandler().handle(request(Identifiers.Protocol - 10), server, connection);

        expect(sent).toHaveLength(1);
        const { packet, comp } = sent[0]!;
        expect(packet).toBeInstanceOf(PlayStatusPacket);
        expect(packet.getPacketData()).toMatchObject({ status: PlayStatus.LoginFailed_ClientOld });
        // Compression was never agreed, so a prefixed batch would be read as garbage.
        expect(comp).toBe(false);
        // The status first, so the client has a screen to put the reason on.
        expect(order).toEqual(['PlayStatusPacket', 'disconnect']);
        expect(disconnect).toHaveBeenCalledWith(
            `Outdated client! Please use ${Identifiers.MinecraftVersions.at(-1)}`,
            false,
            DisconnectReason.OUTDATED_CLIENT
        );
        expect(connection.hasCompression).toBe(false);
    });

    it('tells a newer client that the server is out of date', async () => {
        const { sent, disconnect, connection } = fakeConnection();

        await new RequestNetworkSettingsHandler().handle(request(Identifiers.Protocol + 10), server, connection);

        expect(sent).toHaveLength(1);
        expect(sent[0]!.packet.getPacketData()).toMatchObject({ status: PlayStatus.LoginFailed_ServerOld });
        expect(disconnect).toHaveBeenCalledWith('Outdated server!', false, DisconnectReason.OUTDATED_SERVER);
    });

    it('logs both protocol numbers when it refuses one', async () => {
        info.mockClear();
        const { connection } = fakeConnection();

        await new RequestNetworkSettingsHandler().handle(request(712), server, connection);

        expect(info).toHaveBeenCalledOnce();
        const [message] = info.mock.calls[0]!;
        expect(message).toContain('712');
        expect(message).toContain(String(Identifiers.Protocol));
    });
});
