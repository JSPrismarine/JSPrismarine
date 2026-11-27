import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { JavaClass } from '@jsprismarine/java-classfile/classFile';
import { parseJavaClass } from '@jsprismarine/java-classfile/classFile';
import type { JavaSourceTag } from '@jsprismarine/java-classfile/sources';
import { describe, expect, it } from 'vitest';

import type { ReleaseJar } from './transcriptions.ts';
import { compareTranscriptions, diffListings, renderTranscriptions, writeDeltaSection } from './transcriptions.ts';

const fixtures = join(import.meta.dirname, '..', '..', '..', '..', 'tools', 'java-classfile', 'fixtures');
const v1 = parseJavaClass(readFileSync(join(fixtures, 'v1', 'Sponge.class')));
const v2 = parseJavaClass(readFileSync(join(fixtures, 'v2', 'Sponge.class')));

/** A release whose jar holds one class. */
const release = (version: string, sponge: JavaClass): ReleaseJar => ({
    version,
    index: { names: [sponge.name], load: (name) => (name === sponge.name ? sponge : undefined) }
});

const tag = (spelling: string, line: number): JavaSourceTag => ({ file: 'a.ts', line, spelling, verified: undefined });

describe('diffListings', () => {
    it('shows changed lines with two lines of context, and elides the unchanged runs between', () => {
        const before = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
        const after = ['a', 'B', 'c', 'd', 'e', 'f', 'g', 'h', 'I'];

        expect(diffListings(before, after)).toEqual([
            '  a',
            '- b',
            '+ B',
            '  c',
            '  d',
            '…',
            '  g',
            '  h',
            '- i',
            '+ I'
        ]);
    });

    it('is empty for equal listings', () => {
        expect(diffListings(['a', 'b'], ['a', 'b'])).toEqual([]);
    });
});

describe('compareTranscriptions', () => {
    it('sorts tagged members into changed, removed and unchanged between two releases', () => {
        // v2 changes the private helper `absorb` calls and adds a lambda elsewhere, which leaves
        // `describe` alone. This release also drops `unrelated`.
        const next: JavaClass = { ...v2, methods: v2.methods.filter((method) => method.name !== 'unrelated') };
        const delta = compareTranscriptions(
            [tag('Sponge.absorb', 1), tag('Sponge.absorb', 9), tag('Sponge.describe', 2), tag('Sponge.unrelated', 3)],
            release('1', v1),
            release('2', next)
        );

        expect(delta.unchanged).toBe(1);
        expect(delta.changed.map((change) => [change.spelling, change.sites])).toEqual([
            ['Sponge.absorb', ['a.ts:1', 'a.ts:9']]
        ]);
        expect(
            delta.changed[0]?.diff.filter((line) => /^[-+]/.test(line)).map((line) => line.replace(/\s+/g, ' '))
        ).toEqual(['- bipush 64', '+ bipush 65']);
        expect(delta.removed.map((gone) => gone.spelling)).toEqual(['Sponge.unrelated']);
        expect(delta.removed[0]?.reason).toMatch(/declares no unrelated/);
    });

    it('renders a section a delta note can carry', () => {
        const section = renderTranscriptions(
            compareTranscriptions([tag('Sponge.absorb', 1)], release('1', v1), release('2', v2))
        );

        expect(section.split('\n')[0]).toBe('## Transcriptions to re-read');
        expect(section).toContain('| 1 | 1 | 0 | 0 |');
        expect(section).toContain('#### `Sponge.absorb`');
        expect(section).toContain('```diff');
    });
});

describe('writeDeltaSection', () => {
    const note = (text: string): string => {
        const path = join(mkdtempSync(join(tmpdir(), 'jsp-delta-')), 'delta.md');
        writeFileSync(path, text);
        return path;
    };

    it('puts the section before Sources, then replaces it in place', () => {
        const path = note('# Delta\n\n## Summary\n\nText.\n\n## Sources\n\n- a\n');
        writeDeltaSection(path, '## Transcriptions to re-read\n\nFirst.\n');
        writeDeltaSection(path, '## Transcriptions to re-read\n\nSecond.\n');

        expect(readFileSync(path, 'utf8')).toBe(
            '# Delta\n\n## Summary\n\nText.\n\n## Transcriptions to re-read\n\nSecond.\n\n## Sources\n\n- a\n'
        );
    });

    it('appends the section to a note without Sources', () => {
        const path = note('# Delta\n\nText.\n');
        writeDeltaSection(path, '## Transcriptions to re-read\n\nFirst.\n');

        expect(readFileSync(path, 'utf8')).toBe('# Delta\n\nText.\n\n## Transcriptions to re-read\n\nFirst.\n');
    });
});
