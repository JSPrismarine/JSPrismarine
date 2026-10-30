import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import ServerboundLoadingScreenPacket, { ServerboundLoadingScreenPacketType } from './ServerboundLoadingScreenPacket';

import type { ServerboundLoadingScreen } from './ServerboundLoadingScreenPacket';

const WITHOUT_ID: ServerboundLoadingScreen = {
    loadingScreenType: ServerboundLoadingScreenPacketType.StartLoadingScreen,
    loadingScreenId: null
};
const WITH_ID: ServerboundLoadingScreen = {
    loadingScreenType: ServerboundLoadingScreenPacketType.EndLoadingScreen,
    loadingScreenId: 0x01020304
};
const WITHOUT_ID_BYTES = Buffer.from([0xb8, 0x02, 0x02, 0x00]);
const WITH_ID_BYTES = Buffer.from([0xb8, 0x02, 0x04, 0x01, 0x04, 0x03, 0x02, 0x01]);

describe('ServerboundLoadingScreenPacket', () => {
    it('writes a start with no id', () => {
        expect(new ServerboundLoadingScreenPacket(WITHOUT_ID).serialize(new NetworkBinaryStream())).toEqual(
            WITHOUT_ID_BYTES
        );
    });

    it('writes an end with an id', () => {
        expect(new ServerboundLoadingScreenPacket(WITH_ID).serialize(new NetworkBinaryStream())).toEqual(WITH_ID_BYTES);
    });

    it('reads both loading screen forms to the end of their buffers', () => {
        const withoutId = new NetworkBinaryStream(WITHOUT_ID_BYTES);
        const withId = new NetworkBinaryStream(WITH_ID_BYTES);

        expect(new ServerboundLoadingScreenPacket().deserialize(withoutId)).toEqual(WITHOUT_ID);
        expect(withoutId.feof()).toBe(true);
        expect(new ServerboundLoadingScreenPacket().deserialize(withId)).toEqual(WITH_ID);
        expect(withId.feof()).toBe(true);
    });
});
