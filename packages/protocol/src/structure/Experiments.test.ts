import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import Experiments from './Experiments';

describe('Experiments', () => {
    // Toggles count as a uint32 LE, one toggle (Name string, Enabled boolean), then the
    // ExperimentsEverToggled flag.
    const ONE_TOGGLE = Buffer.from([0x01, 0x00, 0x00, 0x00, 0x08, ...Buffer.from('gametest', 'utf8'), 0x01, 0x01]);

    it('writes the toggles after the fixed width count, then the ever-toggled flag', () => {
        const experiments = new Experiments();
        experiments.toggled = [{ name: 'gametest', enabled: true }];
        experiments.wereEverAlreadyToggled = true;

        const stream = new NetworkBinaryStream();
        experiments.serialize(stream);

        expect(stream.getBuffer()).toEqual(ONE_TOGGLE);
    });

    it('writes five bytes when there are no toggles', () => {
        const stream = new NetworkBinaryStream();
        new Experiments().serialize(stream);

        expect(stream.getBuffer()).toEqual(Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00]));
    });

    it('reads the toggles back and consumes exactly them', () => {
        const stream = new NetworkBinaryStream(ONE_TOGGLE);
        const experiments = new Experiments();
        experiments.deserialize(stream);

        expect(experiments.toggled).toEqual([{ name: 'gametest', enabled: true }]);
        expect(experiments.wereEverAlreadyToggled).toBe(true);
        expect(stream.feof()).toBe(true);
    });
});
