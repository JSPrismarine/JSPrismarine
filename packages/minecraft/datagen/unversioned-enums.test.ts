import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import manifest from './manifest.json' with { type: 'json' };

/**
 * The enums no `bedrock-protocol-docs` release describes, and the promises made about them.
 *
 * These come from a frozen 1.26.40 `enums.html` and are the same numbers at every protocol
 * this package generates. The point of these tests is that the generated output keeps saying
 * so: a per-version copy of one frozen answer reads as data somebody checked against that
 * release, and nobody did.
 */

const HERE = path.dirname(new URL(import.meta.url).pathname);
const GENERATED = path.join(HERE, '..', 'src', 'generated');
const UNVERSIONED = path.join(GENERATED, manifest.legacy.dir);

const protocols = Object.keys(manifest.versions).filter((key) => !key.startsWith('$'));
const unversionedEnums = fs
    .readdirSync(UNVERSIONED)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => path.basename(file, '.ts'));

describe('minecraft datagen', () => {
    describe('unversioned enums', () => {
        it('writes at least one, because six enums have no schema in any release', () => {
            expect(unversionedEnums.length).toBeGreaterThan(0);
        });

        it.each(unversionedEnums)('says in %s that it is not versioned', (name) => {
            const source = fs.readFileSync(path.join(UNVERSIONED, `${name}.ts`), 'utf8');

            expect(source).toContain('NOT VERSIONED');
            expect(source).toContain(manifest.versions[protocols[0]].source.ref);
            // The provenance has to name the dump's own version, not the release the version
            // targets: claiming the targeted release would be the thing this directory exists
            // to stop.
            expect(source).toContain(`protocol ${manifest.versions[protocols[0]].source.networkProtocolVersion}`);
        });

        it.each(unversionedEnums.flatMap((name) => protocols.map((protocol) => [protocol, name] as const)))(
            'has protocol %s re-export %s rather than keep its own copy',
            (protocol, name) => {
                const source = fs.readFileSync(path.join(GENERATED, `v${protocol}`, `${name}.ts`), 'utf8');

                expect(source).toContain(`export * from '../${manifest.legacy.dir}/${name}'`);
                expect(source).not.toContain('export enum');
            }
        );

        it.each(unversionedEnums)('re-exports %s unversioned at the default path too', (name) => {
            const source = fs.readFileSync(path.join(GENERATED, `${name}.ts`), 'utf8');

            expect(source).toContain(`export * from './${manifest.legacy.dir}/${name}'`);
        });

        it('records a known gap only against an enum that is actually unversioned', () => {
            const recorded = Object.keys(manifest.legacy.knownGaps).filter((key) => !key.startsWith('$'));

            expect(recorded.filter((name) => !unversionedEnums.includes(name))).toStrictEqual([]);
        });

        it.each(Object.keys(manifest.legacy.knownGaps))('carries the recorded gap for %s into the output', (name) => {
            const source = fs.readFileSync(path.join(UNVERSIONED, `${name}.ts`), 'utf8');

            expect(source).toContain('Known to be wrong:');
        });
    });

    describe('LevelEvent, the one with a recorded gap', () => {
        // Each of these is a fact the manifest's note states. If regenerating changes one the
        // note has gone stale, and a stale note about stale data is worse than no note.
        it('is still missing the members added after 1.26.40', async () => {
            const { LevelEvent } = await import('../src/generated/unversioned/LevelEvent');
            const values = new Set(Object.values(LevelEvent).filter((value) => typeof value === 'number'));

            for (const added of [9816, 9817, 9818, 9819, 9820]) expect(values).not.toContain(added);
        });

        it('still numbers its last three members the way the 1.26.40 dump printed them', async () => {
            const { LevelEvent } = await import('../src/generated/unversioned/LevelEvent');

            expect(LevelEvent.ALL_PLAYERS_SLEEPING).toBe(3617);
            expect(LevelEvent.DEPRECATED).toBe(3618);
            expect(LevelEvent._9800).toBe(3619);
        });
    });
});
