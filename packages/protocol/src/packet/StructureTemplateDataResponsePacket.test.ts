import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import StructureTemplateDataResponsePacket, {
    StructureTemplateResponseType
} from './StructureTemplateDataResponsePacket';

const ENCODED_WITHOUT_TEMPLATE = Buffer.from([0x85, 0x01, 0x01, 0x73, 0x00, 0x02]);
const ENCODED_WITH_TEMPLATE = Buffer.from([0x85, 0x01, 0x01, 0x73, 0x01, 0x0a, 0x00, 0x00, 0x01]);

describe('StructureTemplateDataResponsePacket', () => {
    it('encodes a missing template as false with no NBT before the response type', () => {
        const data = {
            structureName: 's',
            structureTemplate: null,
            responseType: StructureTemplateResponseType.Query
        };

        expect(new StructureTemplateDataResponsePacket(data).serialize(new NetworkBinaryStream())).toEqual(
            ENCODED_WITHOUT_TEMPLATE
        );
    });

    it('decodes a missing template and consumes the whole buffer', () => {
        const stream = new NetworkBinaryStream(ENCODED_WITHOUT_TEMPLATE);
        const decoded = new StructureTemplateDataResponsePacket().deserialize(stream);

        expect(decoded.structureName).toBe('s');
        expect(decoded.structureTemplate).toBeNull();
        expect(decoded.responseType).toBe(StructureTemplateResponseType.Query);
        expect(stream.feof()).toBe(true);
    });

    it('reads an NBT compound and finds the response type after it', () => {
        const stream = new NetworkBinaryStream(ENCODED_WITH_TEMPLATE);
        const decoded = new StructureTemplateDataResponsePacket().deserialize(stream);

        expect(decoded.structureTemplate?.size()).toBe(0);
        expect(decoded.responseType).toBe(StructureTemplateResponseType.Export);
        expect(stream.feof()).toBe(true);
    });

    it('round trips an NBT compound to the same bytes', () => {
        const decoded = new StructureTemplateDataResponsePacket().deserialize(
            new NetworkBinaryStream(ENCODED_WITH_TEMPLATE)
        );

        expect(new StructureTemplateDataResponsePacket(decoded).serialize(new NetworkBinaryStream())).toEqual(
            ENCODED_WITH_TEMPLATE
        );
    });
});
