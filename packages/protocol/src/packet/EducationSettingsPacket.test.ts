import { describe, expect, it } from 'vitest';
import EducationSettingsPacket from './EducationSettingsPacket';

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

describe('EducationSettingsPacket', () => {
    it('encodes the three optionals with the deprecated boolean between the last two', () => {
        const packet = Object.assign(new EducationSettingsPacket(), {
            codeBuilderDefaultUri: 'u',
            codeBuilderTitle: 't',
            canResizeCodeBuilder: true,
            canModifyBlocks: true,
            codeBuilderOverrideUri: 'o',
            externalLinkSettings: { url: 'x', displayName: 'y' }
        });
        packet.encode();

        expect(packet.getBuffer()).toEqual(ENCODED);
    });

    it('decodes every field and consumes the whole buffer', () => {
        const packet = new EducationSettingsPacket(ENCODED);
        packet.decode();

        expect(packet.codeBuilderDefaultUri).toBe('u');
        expect(packet.codeBuilderTitle).toBe('t');
        expect(packet.canResizeCodeBuilder).toBe(true);
        expect(packet.disableLegacyTitleBar).toBe(false);
        expect(packet.postProcessFilter).toBe('');
        expect(packet.screenshotBorderResourcePath).toBe('');
        expect(packet.canModifyBlocks).toBe(true);
        expect(packet.codeBuilderOverrideUri).toBe('o');
        expect(packet.hasQuiz).toBe(false);
        expect(packet.externalLinkSettings).toEqual({ url: 'x', displayName: 'y' });
        expect(packet.feof()).toBe(true);
    });

    it('encodes an empty packet as ten bytes, one per field with every optional absent', () => {
        const packet = new EducationSettingsPacket();
        packet.encode();

        expect(packet.getBuffer()).toEqual(
            Buffer.from([0x89, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
        );
    });

    it('decodes absent optionals without reading into the fields after them', () => {
        const packet = new EducationSettingsPacket(
            Buffer.from([0x89, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00])
        );
        packet.decode();

        expect(packet.canModifyBlocks).toBeUndefined();
        expect(packet.codeBuilderOverrideUri).toBeUndefined();
        expect(packet.hasQuiz).toBe(true);
        expect(packet.externalLinkSettings).toBeUndefined();
        expect(packet.feof()).toBe(true);
    });
});
