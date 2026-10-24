import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import PresenceConfig from './PresenceConfig';

/** A set rich presence on the wire: the presence byte, then richPresenceId "lobby". */
const LOBBY = Buffer.from([
    0x01, // richPresenceId is present
    ...[0x05, ...Buffer.from('lobby', 'utf8')] // richPresenceId
]);

describe('PresenceConfig', () => {
    it('writes a presence byte then the id', () => {
        const stream = new NetworkBinaryStream();
        new PresenceConfig('lobby').serialize(stream);

        expect(stream.getBuffer()).toEqual(LOBBY);
    });

    it('writes a single zero byte when no id is set', () => {
        const stream = new NetworkBinaryStream();
        new PresenceConfig().serialize(stream);

        expect(stream.getBuffer()).toEqual(Buffer.from([0x00]));
    });

    it('reads a set id and consumes exactly it', () => {
        const stream = new NetworkBinaryStream(LOBBY);
        const config = PresenceConfig.deserialize(stream);

        expect(config).toEqual(new PresenceConfig('lobby'));
        expect(stream.feof()).toBe(true);
    });

    it('reads an absent id as undefined', () => {
        const stream = new NetworkBinaryStream(Buffer.from([0x00]));
        const config = PresenceConfig.deserialize(stream);

        expect(config.richPresenceId).toBeUndefined();
        expect(stream.feof()).toBe(true);
    });
});
