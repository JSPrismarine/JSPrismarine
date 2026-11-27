import { describe, expect, it } from 'vitest';

import {
    configurationModuleSource,
    isSnapshotProtocol,
    javaReleasesSource,
    langSource,
    newestSource,
    packetTableSource,
    registriesModuleSource,
    releaseSource
} from './source.ts';

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

    it('registers every dumped release but snapshots, newest first', () => {
        const source = javaReleasesSource([
            { version: '26.3', protocolVersion: 777 },
            { version: '26.4-pre-1', protocolVersion: 0x4000_0000 | 300 },
            { version: '26.4', protocolVersion: 780 }
        ]);

        expect(source).toContain("import { PACKETS as PACKETS_26_4 } from './26.4/packets';");
        expect(source).toContain(
            'export const NEWEST_JAVA_RELEASE: JavaProtocol = { ...RELEASE_26_4, packets: PACKETS_26_4 };'
        );
        expect(source).toContain(
            'export const JAVA_RELEASES: readonly JavaProtocol[] = [NEWEST_JAVA_RELEASE, JAVA_26_3];'
        );
        expect(source).not.toContain('26.4-pre-1');
    });

    it('refuses to register when every release is a snapshot', () => {
        expect(isSnapshotProtocol(0x4000_0000 | 300)).toBe(true);
        expect(isSnapshotProtocol(777)).toBe(false);
        expect(() => javaReleasesSource([{ version: '26.4-pre-1', protocolVersion: 0x4000_0000 | 300 }])).toThrow(
            'every dumped release is a snapshot'
        );
    });

    it("names the newest release's data under each release module's own names", () => {
        const source = newestSource([
            { version: '26.3', protocolVersion: 777 },
            { version: '26.4', protocolVersion: 780 }
        ]);

        expect(source).toContain("import { BLOCK_STATES as RELEASE_BLOCK_STATES } from './26.4/blockStates';");
        expect(source).toContain('export const BLOCK_STATES = RELEASE_BLOCK_STATES;');
        expect(source).toContain('export const ENTITY_TYPES = RELEASE_ENTITY_TYPES;');
        expect(source).toContain("import type { PACKETS } from './26.4/packets';");
        expect(source).not.toContain("'./26.3/");
    });

    it('writes one constant for each static registry, and the configuration capture module', () => {
        expect(registriesModuleSource('26.4')).toContain(
            'export const ENTITY_TYPES = new JavaRegistry(registries.entity_type);'
        );
        expect(registriesModuleSource('26.4')).toContain('export const ITEMS = new JavaRegistry(registries.item);');
        expect(configurationModuleSource('26.4')).toContain('export const CONFIGURATION: JavaConfiguration = capture;');
    });
});
