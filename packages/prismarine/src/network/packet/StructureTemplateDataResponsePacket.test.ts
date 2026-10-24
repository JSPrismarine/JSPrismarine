import { describe, expect, it } from 'vitest';
import StructureTemplateDataResponsePacket, {
    StructureTemplateResponseType
} from './StructureTemplateDataResponsePacket';

const ENCODED_WITHOUT_TEMPLATE = Buffer.concat([
    Buffer.from([0x85, 0x01]), // Header: id 133 as LEB128.
    Buffer.from([0x01]),
    Buffer.from('s', 'utf8'), // Structure Name.
    Buffer.from([0x00]), // Success false, so no NBT follows.
    Buffer.from([0x02]) // Response Type Query.
]);

const ENCODED_WITH_TEMPLATE = Buffer.concat([
    Buffer.from([0x85, 0x01]),
    Buffer.from([0x01]),
    Buffer.from('s', 'utf8'),
    Buffer.from([0x01]), // Success true.
    Buffer.from([0x0a, 0x00, 0x00]), // An empty network NBT compound: TAG_Compound, no name, TAG_End.
    Buffer.from([0x01]) // Response Type Export.
]);

describe('StructureTemplateDataResponsePacket', () => {
    it('encodes a missing template as a false Success with no NBT between it and the type', () => {
        const packet = Object.assign(new StructureTemplateDataResponsePacket(), {
            structureName: 's',
            responseType: StructureTemplateResponseType.Query
        });
        packet.encode();

        expect(packet.getBuffer()).toEqual(ENCODED_WITHOUT_TEMPLATE);
    });

    it('decodes a missing template and consumes the whole buffer', () => {
        const packet = new StructureTemplateDataResponsePacket(ENCODED_WITHOUT_TEMPLATE);
        packet.decode();

        expect(packet.structureName).toBe('s');
        expect(packet.structureTemplate).toBeNull();
        expect(packet.responseType).toBe(StructureTemplateResponseType.Query);
        expect(packet.feof()).toBe(true);
    });

    it('reads the compound and still finds the response type after it', () => {
        const packet = new StructureTemplateDataResponsePacket(ENCODED_WITH_TEMPLATE);
        packet.decode();

        expect(packet.structureTemplate?.size()).toBe(0);
        expect(packet.responseType).toBe(StructureTemplateResponseType.Export);
        expect(packet.feof()).toBe(true);
    });

    it('round trips a compound back to the same bytes', () => {
        const decoded = new StructureTemplateDataResponsePacket(ENCODED_WITH_TEMPLATE);
        decoded.decode();

        const encoded = Object.assign(new StructureTemplateDataResponsePacket(), {
            structureName: decoded.structureName,
            structureTemplate: decoded.structureTemplate,
            responseType: decoded.responseType
        });
        encoded.encode();

        expect(encoded.getBuffer()).toEqual(ENCODED_WITH_TEMPLATE);
    });
});
