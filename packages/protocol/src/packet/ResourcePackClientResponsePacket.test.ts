import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import { PacketIdentifier } from '../PacketIdentifier';
import ResourcePackClientResponsePacket, { ResourcePackStatus } from './ResourcePackClientResponsePacket';

import type { ResourcePackResponse } from './ResourcePackClientResponsePacket';

/** The packet id header, a varuint32 holding 8 with both subclient ids zero. */
const HEADER = 0x08;

/** `Response` for `Cancel`: alternative 0, then its 6 byte `Response Type`. */
const CANCEL = [0x00, 0x06, ...Buffer.from('cancel', 'utf8')];

/** `Response` for `DownloadingFinished`: alternative 2, then its 19 byte `Response Type`. */
const DOWNLOADING_FINISHED = [0x02, 0x13, ...Buffer.from('downloadingfinished', 'utf8')];

/** `Response` for `ResourcePackStackFinished`: alternative 3, then its 25 byte `Response Type`. */
const STACK_FINISHED = [0x03, 0x19, ...Buffer.from('resourcepackstackfinished', 'utf8')];

/** `Response` for `Downloading` with one pack: alternative 1, `Response Type`, then `Downloading Packs`. */
const DOWNLOADING_ONE_PACK = [
    0x01, // alternative index
    ...[0x0b, ...Buffer.from('downloading', 'utf8')], // Response Type
    0x01, // Downloading Packs count, a varuint32
    ...[0x07, ...Buffer.from('a_1.0.0', 'utf8')] // the one pack id
];

const encode = (data: ResourcePackResponse) => [
    ...new ResourcePackClientResponsePacket(data).serialize(new NetworkBinaryStream())
];

const decode = (bytes: number[]) => {
    const stream = new NetworkBinaryStream(Buffer.from(bytes));
    const data = new ResourcePackClientResponsePacket().deserialize(stream);
    return { data, stream };
};

describe('ResourcePackClientResponsePacket', () => {
    it.each([2193, 2225])('writes and reads the same bytes at protocol %i', (protocol) => {
        // The docs renumber the ResourcePackResponse enum at 2225, but it is written as a string and the
        // selector is the oneOf alternative index, so no byte changes between the two versions.
        const cases = [
            { status: ResourcePackStatus.Refused, packIds: [], tail: CANCEL },
            { status: ResourcePackStatus.SendPacks, packIds: ['a_1.0.0'], tail: DOWNLOADING_ONE_PACK },
            { status: ResourcePackStatus.HaveAllPacks, packIds: [], tail: DOWNLOADING_FINISHED },
            { status: ResourcePackStatus.Completed, packIds: [], tail: STACK_FINISHED }
        ];

        for (const { tail, ...data } of cases) {
            const packet = new ResourcePackClientResponsePacket(data);
            packet.codecProtocol = protocol;
            expect([...packet.serialize(new NetworkBinaryStream())]).toEqual([HEADER, ...tail]);

            const reader = new ResourcePackClientResponsePacket();
            reader.codecProtocol = protocol;
            expect(reader.deserialize(new NetworkBinaryStream(Buffer.from([HEADER, ...tail])))).toEqual(data);
        }
    });

    it('uses packet id 8', () => {
        expect(new ResourcePackClientResponsePacket().id).toBe(PacketIdentifier.RESOURCE_PACK_CLIENT_RESPONSE);
        expect(new ResourcePackClientResponsePacket().id).toBe(HEADER);
    });

    it('encodes Refused as alternative 0 with its name and nothing else', () => {
        expect(encode({ status: ResourcePackStatus.Refused, packIds: [] })).toEqual([HEADER, ...CANCEL]);
    });

    it('encodes HaveAllPacks as alternative 2 with its name and nothing else', () => {
        expect(encode({ status: ResourcePackStatus.HaveAllPacks, packIds: [] })).toEqual([
            HEADER,
            ...DOWNLOADING_FINISHED
        ]);
    });

    it('encodes Completed as alternative 3 with its name and nothing else', () => {
        expect(encode({ status: ResourcePackStatus.Completed, packIds: [] })).toEqual([HEADER, ...STACK_FINISHED]);
    });

    it('encodes SendPacks as alternative 1 followed by Downloading Packs', () => {
        expect(encode({ status: ResourcePackStatus.SendPacks, packIds: ['a_1.0.0'] })).toEqual([
            HEADER,
            ...DOWNLOADING_ONE_PACK
        ]);
    });

    it('refuses to encode None', () => {
        expect(() => encode({ status: ResourcePackStatus.None, packIds: [] })).toThrow(
            'No resource pack response alternative for status 0'
        );
    });

    it('decodes Refused to its end', () => {
        const { data, stream } = decode([HEADER, ...CANCEL]);

        expect(data).toEqual({ status: ResourcePackStatus.Refused, packIds: [] });
        expect(stream.feof()).toBe(true);
    });

    it('decodes HaveAllPacks to its end', () => {
        const { data, stream } = decode([HEADER, ...DOWNLOADING_FINISHED]);

        expect(data).toEqual({ status: ResourcePackStatus.HaveAllPacks, packIds: [] });
        expect(stream.feof()).toBe(true);
    });

    it('decodes Completed to its end', () => {
        const { data, stream } = decode([HEADER, ...STACK_FINISHED]);

        expect(data).toEqual({ status: ResourcePackStatus.Completed, packIds: [] });
        expect(stream.feof()).toBe(true);
    });

    it('decodes SendPacks with its Downloading Packs to its end', () => {
        const { data, stream } = decode([HEADER, ...DOWNLOADING_ONE_PACK]);

        expect(data).toEqual({ status: ResourcePackStatus.SendPacks, packIds: ['a_1.0.0'] });
        expect(stream.feof()).toBe(true);
    });

    it('ignores the casing of Response Type, as the docs spell it differently', () => {
        const { data, stream } = decode([HEADER, 0x02, 0x13, ...Buffer.from('DownloadingFinished', 'utf8')]);

        expect(data.status).toBe(ResourcePackStatus.HaveAllPacks);
        expect(stream.feof()).toBe(true);
    });

    it('rejects an alternative index past the four alternatives', () => {
        expect(() => decode([HEADER, 0x04, 0x00])).toThrow('Unknown resource pack response alternative 4');
    });
});
