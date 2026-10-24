import { describe, expect, it } from 'vitest';

import Identifiers from '../Identifiers';
import ResourcePackStatusType from '../type/ResourcePackStatusType';
import ResourcePackClientResponsePacket from './ResourcePackClientResponsePacket';

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

const encode = (status: ResourcePackStatusType, packIds: string[] = []) => {
    const pk = new ResourcePackClientResponsePacket();
    pk.status = status;
    pk.packIds = packIds;
    pk.encode();
    return [...pk.getBuffer()];
};

const decode = (bytes: number[]) => {
    const pk = new ResourcePackClientResponsePacket();
    pk.setReadBuffer(Buffer.from(bytes));
    pk.decode();
    return pk;
};

describe('network', () => {
    describe('packet', () => {
        describe('ResourcePackClientResponsePacket', () => {
            it('uses the network id the client expects', () => {
                expect(ResourcePackClientResponsePacket.NetID).toBe(Identifiers.ResourcePackClientResponsePacket);
                expect(ResourcePackClientResponsePacket.NetID).toBe(HEADER);
            });

            it('encodes Refused as alternative 0 with its name and nothing else', () => {
                expect(encode(ResourcePackStatusType.Refused)).toEqual([HEADER, ...CANCEL]);
            });

            it('encodes HaveAllPacks as alternative 2 with its name and nothing else', () => {
                expect(encode(ResourcePackStatusType.HaveAllPacks)).toEqual([HEADER, ...DOWNLOADING_FINISHED]);
            });

            it('encodes Completed as alternative 3 with its name and nothing else', () => {
                expect(encode(ResourcePackStatusType.Completed)).toEqual([HEADER, ...STACK_FINISHED]);
            });

            it('encodes SendPacks as alternative 1 followed by Downloading Packs', () => {
                expect(encode(ResourcePackStatusType.SendPacks, ['a_1.0.0'])).toEqual([
                    HEADER,
                    ...DOWNLOADING_ONE_PACK
                ]);
            });

            it('refuses to encode a status with no alternative', () => {
                // The enum has no zero member, so the test reaches it through `number`, which
                // numeric enums accept. This is the value a caller gets from a `None` elsewhere.
                const noAnswer: number = 0;
                const pk = new ResourcePackClientResponsePacket();
                pk.status = noAnswer;

                expect(() => pk.encode()).toThrow('No resource pack response alternative for status 0');
            });

            it('refuses to encode a packet whose status was never set', () => {
                expect(() => new ResourcePackClientResponsePacket().encode()).toThrow(
                    'No resource pack response alternative for status undefined'
                );
            });

            it('decodes Refused to its end', () => {
                const pk = decode([HEADER, ...CANCEL]);

                expect(pk.status).toBe(ResourcePackStatusType.Refused);
                expect(pk.packIds).toEqual([]);
                expect(pk.feof()).toBe(true);
            });

            it('decodes HaveAllPacks to its end', () => {
                const pk = decode([HEADER, ...DOWNLOADING_FINISHED]);

                expect(pk.status).toBe(ResourcePackStatusType.HaveAllPacks);
                expect(pk.packIds).toEqual([]);
                expect(pk.feof()).toBe(true);
            });

            it('decodes Completed to its end', () => {
                const pk = decode([HEADER, ...STACK_FINISHED]);

                expect(pk.status).toBe(ResourcePackStatusType.Completed);
                expect(pk.packIds).toEqual([]);
                expect(pk.feof()).toBe(true);
            });

            it('decodes SendPacks with its Downloading Packs to its end', () => {
                const pk = decode([HEADER, ...DOWNLOADING_ONE_PACK]);

                expect(pk.status).toBe(ResourcePackStatusType.SendPacks);
                expect(pk.packIds).toEqual(['a_1.0.0']);
                expect(pk.feof()).toBe(true);
            });

            it('ignores the casing of Response Type, as the docs spell it differently', () => {
                const pk = decode([HEADER, 0x02, 0x13, ...Buffer.from('DownloadingFinished', 'utf8')]);

                expect(pk.status).toBe(ResourcePackStatusType.HaveAllPacks);
                expect(pk.feof()).toBe(true);
            });

            it('rejects an alternative index past the four alternatives', () => {
                expect(() => decode([HEADER, 0x04, 0x00])).toThrow('Unknown resource pack response alternative 4');
            });
        });
    });
});
