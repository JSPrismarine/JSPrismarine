import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it, vi } from 'vitest';

import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type ClientConnection from '../ClientConnection';
import Identifiers from '../Identifiers';
import type DataPacket from '../packet/DataPacket';
import NetworkSettingsPacket from '../packet/NetworkSettingsPacket';
import PlayStatusPacket from '../packet/PlayStatusPacket';
import RequestNetworkSettingsPacket from '../packet/RequestNetworkSettingsPacket';
import PlayStatusType from '../type/PlayStatusType';
import RequestNetworkSettingsHandler from './RequestNetworkSettingsHandler';

/**
 * A connection that records what was sent and whether it was hung up on.
 *
 * Nothing else is on the double: this is the first packet a client sends, so the handler
 * has no session or player to reach for.
 */
const fakeConnection = () => {
    const sent: Array<{ packet: DataPacket; comp: boolean | undefined }> = [];
    const disconnect = vi.fn(async () => {});

    return {
        sent,
        disconnect,
        connection: stub<ClientConnection>({
            hasCompression: false,
            sendDataPacket: async (packet, comp) => void sent.push({ packet, comp }),
            disconnect
        })
    };
};

const request = (protocolVersion: number): RequestNetworkSettingsPacket =>
    Object.assign(new RequestNetworkSettingsPacket(), { protocolVersion });

describe('RequestNetworkSettingsHandler', () => {
    const info = vi.fn();
    const server = stub<Server>({ getLogger: () => stub<Logger>({ info }) });

    it('answers a matching protocol with the network settings', async () => {
        const { sent, disconnect, connection } = fakeConnection();

        await new RequestNetworkSettingsHandler().handle(request(Identifiers.Protocol), server, connection);

        expect(sent).toHaveLength(1);
        expect(sent[0]!.packet).toBeInstanceOf(NetworkSettingsPacket);
        // The one packet that goes out before compression is on.
        expect(sent[0]!.comp).toBe(false);
        expect(connection.hasCompression).toBe(true);
        expect(disconnect).not.toHaveBeenCalled();
    });

    it('tells an older client that it is out of date', async () => {
        // A bare disconnect here showed "Disconnected from Server" and nothing else (#1586).
        const { sent, disconnect, connection } = fakeConnection();

        await new RequestNetworkSettingsHandler().handle(request(Identifiers.Protocol - 10), server, connection);

        expect(sent).toHaveLength(1);
        const { packet, comp } = sent[0]!;
        expect(packet).toBeInstanceOf(PlayStatusPacket);
        expect(packet).toMatchObject({ status: PlayStatusType.LoginFailedClient });
        // Compression was never agreed, so a prefixed batch would be read as garbage.
        expect(comp).toBe(false);
        expect(disconnect).toHaveBeenCalledWith(
            `Outdated client! Please use ${Identifiers.MinecraftVersions.at(-1)}`,
            false
        );
        expect(connection.hasCompression).toBe(false);
    });

    it('tells a newer client that the server is out of date', async () => {
        const { sent, disconnect, connection } = fakeConnection();

        await new RequestNetworkSettingsHandler().handle(request(Identifiers.Protocol + 10), server, connection);

        expect(sent).toHaveLength(1);
        expect(sent[0]!.packet).toMatchObject({ status: PlayStatusType.LoginFailedServer });
        expect(disconnect).toHaveBeenCalledWith('Outdated server!', false);
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
