import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it, vi } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import type SessionManager from '../../SessionManager';
import { stub } from '../../testing/stub.test.helper';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import Skin from '@jsprismarine/protocol/wire/structures/skin/Skin';
import type PlayerSession from '../PlayerSession';
import { PlayerListEntry } from '@jsprismarine/protocol/wire/structures/PlayerListEntry';
import PlayerSkinPacket from '@jsprismarine/protocol/packet/PlayerSkinPacket';
import PlayerSkinHandler from './PlayerSkinHandler';

const SENDER_UUID = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';

type ClientData = Parameters<typeof Skin.fromJWT>[0];

/** A one-pixel classic skin with no geometry, the shape a login skin without extras takes. */
const classicSkin = (id: string, overrides: Partial<ClientData> = {}) =>
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
        PieceTintColors: [],
        ...overrides
    });

/** An online player whose session records what it is sent. */
const onlinePlayer = (name: string, uuid: string) => {
    const send = vi.fn(async () => {});
    const player = stub<Player>({
        getName: () => name,
        getUUID: () => UUID.fromString(uuid),
        skin: classicSkin(`${name}-old`),
        getNetworkSession: () => stub<PlayerSession>({ send })
    });
    return { player, send };
};

const skinChange = (uuid: string, skin = classicSkin('new-skin')) =>
    Object.assign(new PlayerSkinPacket(), {
        uuid: UUID.fromString(uuid),
        skin,
        newSkinName: 'New',
        oldSkinName: 'Old'
    });

const setUp = () => {
    const sender = onlinePlayer('runner', SENDER_UUID);
    const alice = onlinePlayer('alice', '11111111-1111-4111-8111-111111111111');
    const bob = onlinePlayer('bob', '22222222-2222-4222-8222-222222222222');
    const debug = vi.fn();

    // The entry built at login, which `sendPlayerList` hands to whoever joins later.
    const loginEntry = new PlayerListEntry({
        uuid: UUID.fromString(SENDER_UUID),
        runtimeId: 7n,
        name: 'runner',
        xuid: '2535400000000000',
        buildPlatform: 8,
        skin: sender.player.skin,
        isTeacher: false,
        isHost: false,
        color: 0xff112233
    });
    const playerList = new Map([[SENDER_UUID, loginEntry]]);

    const server = stub<Server>({
        getLogger: () => stub<Logger>({ debug }),
        getSessionManager: () =>
            stub<SessionManager>({
                getAllPlayers: () => [sender.player, alice.player, bob.player],
                getPlayerList: () => playerList
            })
    });
    const session = stub<PlayerSession>({ getPlayer: () => sender.player });
    return { sender, alice, bob, debug, server, session, playerList, loginEntry };
};

/** The one packet a session was sent, typed for the assertions that follow. */
const sentPacket = (send: ReturnType<typeof vi.fn>): PlayerSkinPacket => {
    expect(send).toHaveBeenCalledOnce();
    const [packet] = send.mock.calls[0] ?? [];
    expect(packet).toBeInstanceOf(PlayerSkinPacket);
    if (!(packet instanceof PlayerSkinPacket)) throw new Error('unreachable');
    return packet;
};

describe('PlayerSkinHandler', () => {
    it('stores the skin on the sender and relays a fresh packet to everyone else', async () => {
        const { sender, alice, bob, debug, server, session } = setUp();
        const packet = skinChange(SENDER_UUID);

        await new PlayerSkinHandler().handle(packet, server, session);

        expect(sender.player.skin).toBe(packet.skin);
        expect(sender.send).not.toHaveBeenCalled();

        // A new packet for the server's writer to encode, not the client's bytes forwarded.
        for (const other of [alice, bob]) {
            const relay = sentPacket(other.send);
            expect(relay).not.toBe(packet);
            expect(relay.getEncoded()).toBe(false);
            expect(relay.uuid.equals(packet.uuid)).toBe(true);
            expect(relay.skin).toBe(packet.skin);
            expect(relay.newSkinName).toBe('New');
            expect(relay.oldSkinName).toBe('Old');
        }

        expect(debug).toHaveBeenCalledOnce();
        expect(debug.mock.calls[0]?.[0]).toContain('runner');
        expect(debug.mock.calls[0]?.[0]).toContain('new-skin');
    });

    it('puts the new skin on the player list entry and keeps the rest of it', async () => {
        const { server, session, playerList, loginEntry } = setUp();
        const packet = skinChange(SENDER_UUID);

        await new PlayerSkinHandler().handle(packet, server, session);

        const entry = playerList.get(SENDER_UUID);
        expect(entry).toBeDefined();
        expect(entry).not.toBe(loginEntry);
        expect(entry?.getSkin()).toBe(packet.skin);
        expect(entry?.getRuntimeId()).toBe(7n);
        expect(entry?.getName()).toBe('runner');
        expect(entry?.getXUID()).toBe('2535400000000000');
        expect(entry?.getBuildPlatform()).toBe(8);
        expect(entry?.getColor()).toBe(0xff112233 | 0);
        expect(loginEntry.getSkin()?.getId()).toBe('runner-old');
    });

    it('drops a packet that names another player', async () => {
        // The relay names the UUID the client sent, so a client naming someone else's would
        // change that player's skin on every other screen.
        const { sender, alice, bob, debug, server, session, playerList, loginEntry } = setUp();
        const packet = skinChange('11111111-1111-4111-8111-111111111111');

        await new PlayerSkinHandler().handle(packet, server, session);

        expect(sender.player.skin?.getId()).toBe('runner-old');
        expect(playerList.get(SENDER_UUID)).toBe(loginEntry);
        expect(alice.send).not.toHaveBeenCalled();
        expect(bob.send).not.toHaveBeenCalled();
        expect(debug).toHaveBeenCalledOnce();
        expect(debug.mock.calls[0]?.[0]).toContain('Dropped');
    });

    it.each([
        {
            problem: 'image bytes that do not fill its size',
            overrides: { SkinImageWidth: 2, SkinImageHeight: 2 } satisfies Partial<ClientData>,
            reason: '16'
        },
        {
            problem: 'a cape whose bytes do not fill its size',
            overrides: { CapeImageWidth: 1, CapeImageHeight: 1 } satisfies Partial<ClientData>,
            reason: 'cape image'
        },
        {
            problem: 'an image more than 4096 pixels a side',
            overrides: { SkinImageWidth: 4097, SkinImageHeight: 1 } satisfies Partial<ClientData>,
            reason: '4096'
        },
        {
            problem: 'an animation whose bytes do not fill its size',
            overrides: {
                AnimatedImageData: [
                    { ImageWidth: 1, ImageHeight: 1, Image: '', Frames: 1, Type: 1, AnimationExpression: 0 }
                ]
            } satisfies Partial<ClientData>,
            reason: 'animation 0'
        },
        {
            problem: 'geometry that is not JSON',
            overrides: { SkinGeometryData: Buffer.from('not json').toString('base64') } satisfies Partial<ClientData>,
            reason: 'not JSON'
        }
    ])('drops a skin with $problem', async ({ overrides, reason }) => {
        const { sender, alice, bob, debug, server, session, playerList, loginEntry } = setUp();
        const packet = skinChange(SENDER_UUID, classicSkin('bad-skin', overrides));

        await new PlayerSkinHandler().handle(packet, server, session);

        expect(sender.player.skin?.getId()).toBe('runner-old');
        expect(playerList.get(SENDER_UUID)).toBe(loginEntry);
        expect(alice.send).not.toHaveBeenCalled();
        expect(bob.send).not.toHaveBeenCalled();
        expect(debug).toHaveBeenCalledOnce();
        expect(debug.mock.calls[0]?.[0]).toContain('Dropped');
        expect(debug.mock.calls[0]?.[0]).toContain(reason);
    });

    it('accepts a skin whose geometry is JSON', async () => {
        const { sender, alice, server, session } = setUp();
        const packet = skinChange(
            SENDER_UUID,
            classicSkin('geometry-skin', {
                SkinGeometryData: Buffer.from('{"format_version":"1.12.0"}').toString('base64')
            })
        );

        await new PlayerSkinHandler().handle(packet, server, session);

        expect(sender.player.skin).toBe(packet.skin);
        expect(alice.send).toHaveBeenCalledOnce();
    });
});
