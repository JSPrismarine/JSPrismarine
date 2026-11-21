import { describe, expect, it } from 'vitest';
import NetworkBinaryStream from '../../NetworkBinaryStream';
import { educationSettingsPacket } from '../wire/definitions/educationSettings';
import { layoutAt } from '../../wire/WireLayout';
import EducationSettingsPacket from './EducationSettingsPacket';

import type { EducationSettings } from './EducationSettingsPacket';

const ENCODED = Buffer.concat([
    Buffer.from([0x89, 0x01]), // Header: id 137 as LEB128.
    Buffer.from([0x01]),
    Buffer.from('u', 'utf8'), // Code Builder Default URI.
    Buffer.from([0x01]),
    Buffer.from('t', 'utf8'), // Code Builder Title.
    Buffer.from([0x01]), // Can resize Code Builder.
    Buffer.from([0x00]), // Disable legacy title bar.
    Buffer.from([0x00]), // Post Process Filter "".
    Buffer.from([0x00]), // Screenshot Border Resource Path "".
    Buffer.from([0x01, 0x01]), // Agent Capabilities present, Can Modify Blocks true.
    Buffer.from([0x01, 0x01]),
    Buffer.from('o', 'utf8'), // Local Settings present, Code Builder Override Uri "o".
    Buffer.from([0x00]), // (Deprecated) Always False.
    Buffer.from([0x01, 0x01]),
    Buffer.from('x', 'utf8'), // External Link Settings present, URL "x".
    Buffer.from([0x01]),
    Buffer.from('y', 'utf8') // Display Name "y".
]);

const EMPTY: EducationSettings = {
    codeBuilderDefaultUri: '',
    codeBuilderTitle: '',
    canResizeCodeBuilder: false,
    disableLegacyTitleBar: false,
    postProcessFilter: '',
    screenshotBorderResourcePath: '',
    canModifyBlocks: undefined,
    codeBuilderOverrideUri: undefined,
    hasQuiz: false,
    externalLinkSettings: undefined
};

describe('EducationSettingsPacket', () => {
    it('encodes the three optionals with the deprecated boolean between the last two', () => {
        const buffer = new EducationSettingsPacket({
            ...EMPTY,
            codeBuilderDefaultUri: 'u',
            codeBuilderTitle: 't',
            canResizeCodeBuilder: true,
            canModifyBlocks: true,
            codeBuilderOverrideUri: 'o',
            externalLinkSettings: { url: 'x', displayName: 'y' }
        }).serialize(new NetworkBinaryStream());

        expect(buffer).toEqual(ENCODED);
    });

    it('decodes every field and consumes the whole buffer', () => {
        const stream = new NetworkBinaryStream(ENCODED);
        const data = new EducationSettingsPacket().deserialize(stream);

        expect(data).toEqual({
            codeBuilderDefaultUri: 'u',
            codeBuilderTitle: 't',
            canResizeCodeBuilder: true,
            disableLegacyTitleBar: false,
            postProcessFilter: '',
            screenshotBorderResourcePath: '',
            canModifyBlocks: true,
            codeBuilderOverrideUri: 'o',
            hasQuiz: false,
            externalLinkSettings: { url: 'x', displayName: 'y' }
        });
        expect(stream.feof()).toBe(true);
    });

    it('encodes an empty packet as ten bytes, one per field with every optional absent', () => {
        const buffer = new EducationSettingsPacket(EMPTY).serialize(new NetworkBinaryStream());

        expect(buffer).toEqual(Buffer.from([0x89, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
    });

    it('decodes absent optionals without reading into the fields after them', () => {
        const stream = new NetworkBinaryStream(
            Buffer.from([0x89, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00])
        );
        const data = new EducationSettingsPacket().deserialize(stream);

        expect(data.canModifyBlocks).toBeUndefined();
        expect(data.codeBuilderOverrideUri).toBeUndefined();
        expect(data.hasQuiz).toBe(true);
        expect(data.externalLinkSettings).toBeUndefined();
        expect(stream.feof()).toBe(true);
    });

    it.each([2193, 2225])('writes the same three presence bytes at protocol %i', (protocol) => {
        const stream = new NetworkBinaryStream();
        layoutAt(educationSettingsPacket, protocol).encode(stream, {
            ...EMPTY,
            canModifyBlocks: true,
            codeBuilderOverrideUri: 'o',
            externalLinkSettings: { url: 'x', displayName: 'y' }
        });

        expect(stream.getBuffer()).toEqual(
            Buffer.concat([
                Buffer.alloc(6), // Six empty strings and false booleans.
                Buffer.from([0x01, 0x01, 0x01, 0x01, 0x6f, 0x00, 0x01, 0x01, 0x78, 0x01, 0x79])
            ])
        );
    });
});
