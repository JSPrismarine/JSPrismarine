import type PlayerListPacket from '@jsprismarine/protocol/bedrock/packet/PlayerListPacket';
import { PlayerListAction } from '@jsprismarine/protocol/bedrock/wire/structures/PlayerListEntry';
import Skin from '@jsprismarine/protocol/bedrock/wire/structures/skin/Skin';
import UUID from '@jsprismarine/protocol/bedrock/wire/structures/UUID';
import { describe, expect, it } from 'vitest';

import { stub } from '../testing/stub.test.helper';
import type { ShownPlayer } from '../world/ShownPlayer';
import { listedPlayerOf, setPlayerListName } from './playerListEntry';

const STEVE_UUID = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';

/** A one-pixel classic skin with no geometry, the shape a login skin without extras takes. */
const classicSkin = () =>
    Skin.fromJWT({
        SkinId: 'steve',
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

/** A joined player as the network layer shows them, with the fields the entry reads. */
const steve = () =>
    stub<ShownPlayer>({
        getUUID: () => UUID.fromString(STEVE_UUID),
        getRuntimeId: () => 7n,
        getName: () => 'Steve',
        xuid: '2535400000000000',
        platformChatId: '',
        device: null,
        skin: classicSkin()
    });

/** The list with the entry built at login, and a broadcast that keeps every packet it gets. */
const setUp = () => {
    const player = steve();
    const list = new Map([[STEVE_UUID, listedPlayerOf(player)]]);
    const broadcast: PlayerListPacket[] = [];
    const rename = (name?: string) =>
        setPlayerListName(
            list,
            async (packet) => {
                broadcast.push(packet);
            },
            player,
            STEVE_UUID,
            name
        );
    /** Each broadcast packet as its action and the names of its entries. */
    const sent = () =>
        broadcast.map((packet) => [packet.type, packet.entries.map((entry) => entry.getName())] as const);
    return { player, list, rename, sent };
};

describe('setPlayerListName', () => {
    it('replaces the entry a later joiner gets with one carrying the name, every other field kept', async () => {
        const { list, rename } = setUp();
        const login = list.get(STEVE_UUID)!;

        await rename('§aSteve');

        // `sendPlayerList` sends the list's values, so this is what a player who joins later sees.
        const entry = list.get(STEVE_UUID)!;
        expect(entry).not.toBe(login);
        expect(entry).toEqual({ ...login, name: '§aSteve' });
    });

    it('sends every client a Remove for the entry and then an Add with the name', async () => {
        const { rename, sent } = setUp();

        await rename('§aSteve');

        expect(sent()).toEqual([
            [PlayerListAction.TYPE_REMOVE, [null]],
            [PlayerListAction.TYPE_ADD, ['§aSteve']]
        ]);
    });

    it('gives the entry its login name back without a name', async () => {
        const { list, rename, sent } = setUp();
        await rename('§aSteve');

        await rename();

        expect(list.get(STEVE_UUID)?.name).toBe('Steve');
        expect(sent().at(-1)).toEqual([PlayerListAction.TYPE_ADD, ['Steve']]);
    });

    it('adds the entry the list holds once the Remove has gone, and none for a player who left meanwhile', async () => {
        const player = steve();
        const list = new Map([[STEVE_UUID, listedPlayerOf(player)]]);
        const sent: [PlayerListAction, string | null][] = [];
        /** Settles each broadcast only when the test says, as a slow transport would. */
        const releases: (() => void)[] = [];
        const broadcast = (packet: PlayerListPacket) =>
            new Promise<void>((resolve) => {
                sent.push([packet.type, packet.entries[0]?.getName() ?? null]);
                releases.push(resolve);
            });
        /** Lets each broadcast go, one turn of the event loop at a time, until the rename has settled. */
        const settle = async (rename: Promise<void>): Promise<void> => {
            let done = false;
            void rename.then(() => {
                done = true;
            });
            while (!done) {
                releases.shift()?.();
                await new Promise<void>((resolve) => setImmediate(resolve));
            }
        };
        const leaving = setPlayerListName(list, broadcast, player, STEVE_UUID, 'gone soon');
        // The player leaves between the Remove and the Add: their entry goes from the list.
        list.delete(STEVE_UUID);
        await settle(leaving);
        expect(sent).toEqual([[PlayerListAction.TYPE_REMOVE, null]]);
        sent.length = 0;

        // A skin change replaces the entry while the Remove is on its way; the Add carries the new entry, name kept.
        list.set(STEVE_UUID, listedPlayerOf(player));
        const renaming = setPlayerListName(list, broadcast, player, STEVE_UUID, 'renamed');
        list.set(STEVE_UUID, { ...list.get(STEVE_UUID)!, skin: classicSkin() });
        await settle(renaming);
        expect(sent).toEqual([
            [PlayerListAction.TYPE_REMOVE, null],
            [PlayerListAction.TYPE_ADD, 'renamed']
        ]);
        sent.length = 0;

        // Two renames in flight: each Add lists the newer name, so no client ends on the older one.
        const older = setPlayerListName(list, broadcast, player, STEVE_UUID, 'older');
        const newer = setPlayerListName(list, broadcast, player, STEVE_UUID, 'newer');
        await settle(older);
        await settle(newer);
        expect(sent.map(([type]) => type)).toEqual([
            PlayerListAction.TYPE_REMOVE,
            PlayerListAction.TYPE_REMOVE,
            PlayerListAction.TYPE_ADD,
            PlayerListAction.TYPE_ADD
        ]);
        expect(sent.filter(([type]) => type === PlayerListAction.TYPE_ADD).map(([, name]) => name)).toEqual([
            'newer',
            'newer'
        ]);
    });

    it('leaves a player who has no entry yet alone', async () => {
        const { list, rename, sent } = setUp();
        list.clear();

        await rename('§aSteve');

        expect(list.size).toBe(0);
        expect(sent()).toEqual([]);
    });
});
