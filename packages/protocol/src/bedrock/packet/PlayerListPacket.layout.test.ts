import BinaryStream from '@jsprismarine/binaryutils';
import { BuildPlatform } from '@jsprismarine/minecraft';
import { layoutAt } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import UUID from '@jsprismarine/protocol/bedrock/wire/structures/UUID';
import Skin from '@jsprismarine/protocol/bedrock/wire/structures/skin/Skin';
import PlayerListPacket, { PlayerListAction, PlayerListEntry } from './PlayerListPacket';
import { playerListPacket } from '@jsprismarine/protocol/bedrock/wire/definitions/playerList';
import { capture, enumDumpMembers } from '../../testing/evidence.test.helper';

/**
 * The declarative layout must produce the same bytes as the classes it replaces, at both
 * versions, before anything switches over to it. The old 2225 sibling class moved the
 * PlayFab id from inside each entry's skin onto the entry itself, between the XUID and the
 * platform online id.
 */
describe('the declarative PlayerList layout against the packet class it replaces', () => {
    const PLAYFAB_ID = 'PFID-abc123';

    const skin = () =>
        Skin.fromJWT({
            SkinId: 'classic-skin',
            CapeId: '',
            SkinResourcePatch: '',
            PlayFabId: PLAYFAB_ID,
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

    const entry = () =>
        new PlayerListEntry({
            uuid: UUID.fromString('0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0'),
            runtimeId: 11n,
            name: 'Terracotta',
            xuid: '2535',
            platformChatId: '',
            buildPlatform: BuildPlatform.WIN32,
            skin: skin()
        });

    const fill = (packet: PlayerListPacket, type = PlayerListAction.TYPE_ADD): PlayerListPacket => {
        packet.type = type;
        packet.entries =
            type === PlayerListAction.TYPE_ADD ? [entry()] : [new PlayerListEntry({ uuid: entry().getUUID() })];
        return packet;
    };

    const payload = (type = PlayerListAction.TYPE_ADD) => {
        const body = {
            type,
            entries: type === PlayerListAction.TYPE_ADD ? [entry()] : [new PlayerListEntry({ uuid: entry().getUUID() })]
        };
        return { bodyWithPlayFabIdInSkin: body, bodyWithPlayFabIdOnEntry: body };
    };

    it('matches the 2193 class byte for byte for an Add entry', () => {
        const classPacket = fill(new PlayerListPacket());
        classPacket.encodePayload();

        const stream = new BinaryStream();
        layoutAt(playerListPacket, 2193).encode(stream, payload());

        expect(stream.getBuffer()).toEqual(classPacket.getBuffer());
    });

    it('matches the 2193 class byte for byte for a Remove entry', () => {
        const classPacket = fill(new PlayerListPacket(), PlayerListAction.TYPE_REMOVE);
        classPacket.encodePayload();

        const stream = new BinaryStream();
        layoutAt(playerListPacket, 2193).encode(stream, payload(PlayerListAction.TYPE_REMOVE));

        expect(stream.getBuffer()).toEqual(classPacket.getBuffer());
    });

    it('matches the class stamped 2225 byte for byte', () => {
        const classPacket = fill(new PlayerListPacket());
        classPacket.codecProtocol = 2225;
        classPacket.encodePayload();

        const stream = new BinaryStream();
        layoutAt(playerListPacket, 2225).encode(stream, payload());

        expect(stream.getBuffer()).toEqual(classPacket.getBuffer());
    });

    it('moves the PlayFab id rather than duplicating or dropping it at 2225', () => {
        const base = new BinaryStream();
        layoutAt(playerListPacket, 2193).encode(base, payload());

        const moved = new BinaryStream();
        layoutAt(playerListPacket, 2225).encode(moved, payload());

        // The same fields, a different order: both layouts carry the id exactly once and are
        // the same size, so the change is a move, not an addition.
        const occurrences = (buffer: Buffer) => buffer.toString('latin1').split(PLAYFAB_ID).length - 1;
        expect(occurrences(base.getBuffer())).toBe(1);
        expect(occurrences(moved.getBuffer())).toBe(1);
        expect(moved.getBuffer().byteLength).toBe(base.getBuffer().byteLength);
        expect(moved.getBuffer().equals(base.getBuffer())).toBe(false);
    });

    it('decodes what the class encoded, at both versions', () => {
        for (const version of [2193, 2225]) {
            const classPacket = fill(new PlayerListPacket());
            classPacket.codecProtocol = version;
            classPacket.encodePayload();

            const stream = new BinaryStream(classPacket.getBuffer());
            const read = layoutAt(playerListPacket, version).decode(stream);
            expect(stream.feof()).toBe(true);

            const body = version === 2193 ? read.bodyWithPlayFabIdInSkin : read.bodyWithPlayFabIdOnEntry;
            expect(body!.entries[0]!.getName()).toBe('Terracotta');
            expect(body!.entries[0]!.getSkin()!.getPlayFabId()).toBe(PLAYFAB_ID);
            expect(body!.entries[0]!.getBuildPlatform()).toBe(BuildPlatform.WIN32);
        }
    });
});

/** One enum's members from Mojang's pinned enum dump, the source of the `Add`/`Remove` and `BuildPlatform` numbers, as name to value. */
const enumFromDump = (name: string): Record<string, number> =>
    Object.fromEntries(enumDumpMembers(name).map((member) => [member.name, member.value]));

describe('the layout against a real server capture', () => {
    for (const version of [2193, 2225]) {
        it(`re-encodes the captured 0x3f payload byte for byte at ${version}`, () => {
            const bytes = capture(version, 0x3f);
            const stream = new BinaryStream(bytes);
            const read = layoutAt(playerListPacket, version).decode(stream);
            expect(stream.feof()).toBe(true);

            const encoded = new BinaryStream();
            layoutAt(playerListPacket, version).encode(encoded, read);
            expect(encoded.getBuffer()).toEqual(bytes);

            const body = version === 2193 ? read.bodyWithPlayFabIdInSkin : read.bodyWithPlayFabIdOnEntry;
            expect(body!.type).toBe(PlayerListAction.TYPE_ADD);
            expect(body!.entries).toHaveLength(1);
        });
    }

    it('opens the 2193 payload with the entry count, as the 1.26.60 page says, not a presence byte', () => {
        // The 1.26.50 page marks `Entries` optional and the 1.26.60 page drops the mark. The
        // capture at 2193 is entry count 1, variant selector 1 (Add), Action 0 (Add): no
        // presence byte, so the mark was the docs' error and nothing is gated.
        expect([...capture(2193, 0x3f).subarray(0, 3)]).toEqual([1, 1, 0]);
        expect([...capture(2225, 0x3f).subarray(0, 3)]).toEqual([1, 1, 0]);
    });
});

describe("the enums the entry carries, against Mojang's pinned enum dump", () => {
    it('numbers the Action 0 for Add and 1 for Remove', () => {
        // The 1.26.50 page prints both as 0; the dump and the 1.26.60 page agree on 0 and 1.
        expect(enumFromDump('PlayerListPacketType')).toEqual({ Add: 0, Remove: 1 });
        expect(PlayerListAction.TYPE_ADD).toBe(0);
        expect(PlayerListAction.TYPE_REMOVE).toBe(1);
    });

    it("numbers Build Platform with the dump's gapped values, not the 1.26.50 page's positions", () => {
        const dump = enumFromDump('BuildPlatform');
        expect(dump.Google).toBe(BuildPlatform.GOOGLE);
        expect(dump.iOS).toBe(BuildPlatform.IOS);
        expect(dump.OSX).toBe(BuildPlatform.OSX);
        expect(dump.Amazon).toBe(BuildPlatform.AMAZON);
        expect(dump.Win32).toBe(BuildPlatform.WIN32);
        expect(dump.Dedicated).toBe(BuildPlatform.DEDICATED);
        expect(dump.Sony).toBe(BuildPlatform.SONY);
        expect(dump.Nx).toBe(BuildPlatform.NINTENDO); // The dump names the Switch `Nx`.
        expect(dump.Xbox).toBe(BuildPlatform.XBOX);
        expect(dump.Linux).toBe(BuildPlatform.LINUX);
        expect(dump.Unknown).toBe(BuildPlatform.UNKNOWN);
    });
});
