import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it, vi } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import type SessionManager from '../../SessionManager';
import { stub } from '../../testing/stub.test.helper';
import UUID from '../../utils/UUID';
import Skin from '../../utils/skin/Skin';
import type ClientConnection from '../ClientConnection';
import type PlayerSession from '../PlayerSession';
import PlayerSkinPacket from '../packet/PlayerSkinPacket';
import PlayerSkinHandler from './PlayerSkinHandler';

const SENDER_UUID = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';

const classicSkin = (id: string) =>
    Skin.fromJWT({
        SkinId: id,
        CapeId: '',
        SkinResourcePatch: '',
        PlayFabId: '',
        SkinImageHeight: 1,
        SkinImageWidth: 1,
        SkinGeometryData: '',
        SkinAnimationData: '',
        CapeImageHeight: 0,
        CapeImageWidth: 0,
        CapeOnClassicSkin: false,
        SkinData: Buffer.from([0, 0, 0, 255]).toString('base64'),
        CapeData: '',
        PremiumSkin: false,
        PersonaSkin: false,
        SkinColor: '#0',
        ArmSize: 'wide',
        AnimatedImageData: [],
        PersonaPieces: [],
        PieceTintColors: []
    });

/** An online player with a connection whose sends the test can count. */
const onlinePlayer = (name: string, uuid: string) => {
    const sendDataPacket = vi.fn(async () => {});
    const player = stub<Player>({
        getName: () => name,
        getUUID: () => UUID.fromString(uuid),
        skin: classicSkin(`${name}-old`),
        getNetworkSession: () =>
            stub<PlayerSession>({ getConnection: () => stub<ClientConnection>({ sendDataPacket }) })
    });
    return { player, sendDataPacket };
};

const skinChange = (uuid: string) =>
    Object.assign(new PlayerSkinPacket(), {
        uuid: UUID.fromString(uuid),
        skin: classicSkin('new-skin'),
        newSkinName: 'New',
        oldSkinName: 'Old'
    });

const setUp = () => {
    const sender = onlinePlayer('runner', SENDER_UUID);
    const alice = onlinePlayer('alice', '11111111-1111-4111-8111-111111111111');
    const bob = onlinePlayer('bob', '22222222-2222-4222-8222-222222222222');
    const debug = vi.fn();
    const server = stub<Server>({
        getLogger: () => stub<Logger>({ debug }),
        getSessionManager: () =>
            stub<SessionManager>({ getAllPlayers: () => [sender.player, alice.player, bob.player] })
    });
    const session = stub<PlayerSession>({ getPlayer: () => sender.player });
    return { sender, alice, bob, debug, server, session };
};

describe('PlayerSkinHandler', () => {
    it('stores the skin on the sender and forwards the packet to everyone else', async () => {
        const { sender, alice, bob, debug, server, session } = setUp();
        const packet = skinChange(SENDER_UUID);

        await new PlayerSkinHandler().handle(packet, server, session);

        expect(sender.player.skin).toBe(packet.skin);
        // Forwarded as received, so the other clients decode the same bytes the sender wrote.
        expect(alice.sendDataPacket).toHaveBeenCalledExactlyOnceWith(packet);
        expect(bob.sendDataPacket).toHaveBeenCalledExactlyOnceWith(packet);
        expect(sender.sendDataPacket).not.toHaveBeenCalled();
        expect(debug).toHaveBeenCalledOnce();
        expect(debug.mock.calls[0]?.[0]).toContain('runner');
        expect(debug.mock.calls[0]?.[0]).toContain('new-skin');
    });

    it('drops a packet that names another player', async () => {
        // The packet is forwarded unchanged, so a client naming someone else's UUID would
        // change that player's skin on every other screen.
        const { sender, alice, bob, debug, server, session } = setUp();
        const packet = skinChange('11111111-1111-4111-8111-111111111111');

        await new PlayerSkinHandler().handle(packet, server, session);

        expect(sender.player.skin?.getId()).toBe('runner-old');
        expect(alice.sendDataPacket).not.toHaveBeenCalled();
        expect(bob.sendDataPacket).not.toHaveBeenCalled();
        expect(debug).toHaveBeenCalledOnce();
        expect(debug.mock.calls[0]?.[0]).toContain('Dropped');
    });
});
