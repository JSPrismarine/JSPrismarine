import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import EduSharedUriResource from './EduSharedUriResource';

/** A shared link on the wire: Button Name "Lesson" then Link Uri "https://edu.example/1". */
const LESSON = Buffer.from([
    ...[0x06, ...Buffer.from('Lesson', 'utf8')], // Button Name
    ...[0x15, ...Buffer.from('https://edu.example/1', 'utf8')] // Link Uri, 21 bytes
]);

describe('EduSharedUriResource', () => {
    it('writes the button name then the link', () => {
        const stream = new NetworkBinaryStream();
        new EduSharedUriResource('Lesson', 'https://edu.example/1').serialize(stream);

        expect(stream.getBuffer()).toEqual(LESSON);
    });

    it('writes two empty strings when the world shares no link', () => {
        const stream = new NetworkBinaryStream();
        new EduSharedUriResource().serialize(stream);

        expect(stream.getBuffer()).toEqual(Buffer.from([0x00, 0x00]));
    });

    it('reads both strings and consumes exactly them', () => {
        const stream = new NetworkBinaryStream(LESSON);
        const resource = EduSharedUriResource.deserialize(stream);

        expect(resource).toEqual(new EduSharedUriResource('Lesson', 'https://edu.example/1'));
        expect(stream.feof()).toBe(true);
    });
});
