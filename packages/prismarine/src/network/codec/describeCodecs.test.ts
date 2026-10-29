import { describe, expect, it } from 'vitest';

import { latestCodec, registeredCodecs } from './CodecRegistry';
import { describeSupportedProtocols } from './describeCodecs';

describe('describeSupportedProtocols', () => {
    it('describes every registered codec, newest protocol first', () => {
        const described = describeSupportedProtocols();

        expect(described).toHaveLength(registeredCodecs.length);
        expect(registeredCodecs.map((codec) => codec.protocolVersion)).toStrictEqual(
            [...registeredCodecs.map((codec) => codec.protocolVersion)].sort((a, b) => b - a)
        );
        for (const [index, codec] of registeredCodecs.entries()) {
            expect(described[index]).toContain(`protocol §e${codec.protocolVersion}§r`);
            for (const version of codec.minecraftVersions) expect(described[index]).toContain(`§e${version}§r`);
        }
    });

    it('marks only the codec the MOTD advertises', () => {
        const marked = describeSupportedProtocols().filter((line) => line.includes('advertised in the MOTD'));

        expect(marked).toHaveLength(1);
        expect(marked[0]).toContain(`protocol §e${latestCodec.protocolVersion}§r`);
    });
});
