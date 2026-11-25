import { describe, expect, it } from 'vitest';

import { langSource, packetTableSource, releaseSource } from './source.ts';

describe('dump:java-protocol sources', () => {
    it('writes each phase, direction and packet in name order, without the namespace', () => {
        const source = packetTableSource('26.3', {
            status: { serverbound: { 'minecraft:status_request': 0, 'minecraft:ping_request': 1 } },
            handshake: { serverbound: { 'minecraft:intention': 0 } }
        });

        expect(source.split('\n').slice(4, -1)).toEqual([
            '    handshake: {',
            '        serverbound: {',
            '            intention: 0',
            '        }',
            '    },',
            '    status: {',
            '        serverbound: {',
            '            ping_request: 1,',
            '            status_request: 0',
            '        }',
            '    }',
            '} as const;'
        ]);
    });

    it('quotes a name that is no identifier', () => {
        expect(packetTableSource('26.3', { play: { clientbound: { 'minecraft:debug/event': 29 } } })).toContain(
            "            'debug/event': 29"
        );
    });

    it('refuses a packet outside the minecraft namespace', () => {
        expect(() => packetTableSource('26.3', { play: { clientbound: { 'mod:thing': 0 } } })).toThrow(
            'packet mod:thing is outside the minecraft namespace'
        );
    });

    it('records the release and its protocol number', () => {
        expect(releaseSource('26.3', 777)).toContain(
            "export const RELEASE: JavaRelease = { minecraftVersion: '26.3', protocolVersion: 777 };"
        );
    });

    it('keeps the English of the keys under the prefixes, in key order', () => {
        const lang = {
            'death.attack.lava': '%1$s tried to swim in lava',
            'block.minecraft.stone': 'Stone',
            'death.attack.drown': '%1$s drowned'
        };

        expect(JSON.parse(langSource(lang, ['death.']))).toEqual({
            'death.attack.drown': '%1$s drowned',
            'death.attack.lava': '%1$s tried to swim in lava'
        });
        expect(Object.keys(JSON.parse(langSource(lang, ['death.'])))).toEqual([
            'death.attack.drown',
            'death.attack.lava'
        ]);
    });
});
