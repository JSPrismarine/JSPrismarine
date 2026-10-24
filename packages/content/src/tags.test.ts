import { beforeEach, describe, expect, it } from 'vitest';

import { Registry } from './registry';
import type { TagSource } from './tags';
import { Tags } from './tags';

const WOODS = ['jsp:oak_log', 'jsp:birch_log', 'jsp:oak_planks'] as const;

let registry: Registry<{ name: string }>;
let tags: Tags<{ name: string }>;

beforeEach(() => {
    registry = new Registry('blocks');
    registry.rebuild(WOODS.map((key) => [key, { name: key }] as const));
    tags = new Tags(registry);
});

const source = (tag: string, pack: string, values: TagSource['values'], replace?: boolean): TagSource => ({
    tag,
    pack,
    path: `tags/block/${tag.split(':')[1]}.json`,
    values,
    ...(replace === undefined ? {} : { replace })
});

describe('Tags', () => {
    it('appends a later pack onto an earlier one', () => {
        tags.rebuild([source('jsp:logs', 'base', ['jsp:oak_log']), source('jsp:logs', 'overlay', ['jsp:birch_log'])]);

        expect(tags.get('jsp:logs')?.members.map((member) => member.key)).toEqual(['jsp:oak_log', 'jsp:birch_log']);
        expect(tags.diagnostics).toEqual([]);
    });

    it('drops everything earlier packs added when a later file declares replace', () => {
        tags.rebuild([
            source('jsp:logs', 'base', ['jsp:oak_log']),
            source('jsp:logs', 'overlay', ['jsp:birch_log'], true)
        ]);

        expect(tags.get('jsp:logs')?.members.map((member) => member.key)).toEqual(['jsp:birch_log']);
    });

    it('keeps the first position when two packs add the same member', () => {
        tags.rebuild([
            source('jsp:logs', 'base', ['jsp:oak_log', 'jsp:birch_log']),
            source('jsp:logs', 'overlay', ['jsp:birch_log'])
        ]);

        expect(tags.get('jsp:logs')?.members.map((member) => member.key)).toEqual(['jsp:oak_log', 'jsp:birch_log']);
    });

    it('expands a tag reference transitively', () => {
        tags.rebuild([
            source('jsp:oak', 'base', ['jsp:oak_log']),
            source('jsp:logs', 'base', ['#jsp:oak', 'jsp:birch_log']),
            source('jsp:wood', 'base', ['#jsp:logs', 'jsp:oak_planks'])
        ]);

        expect(tags.get('jsp:wood')?.members.map((member) => member.key)).toEqual([
            'jsp:oak_log',
            'jsp:birch_log',
            'jsp:oak_planks'
        ]);
        expect(tags.diagnostics).toEqual([]);
    });

    it('reports a cycle instead of throwing and keeps the members outside it', () => {
        tags.rebuild([
            source('jsp:a', 'base', ['jsp:oak_log', '#jsp:b']),
            source('jsp:b', 'base', ['jsp:birch_log', '#jsp:a'])
        ]);

        expect(tags.get('jsp:a')?.members.map((member) => member.key)).toEqual(['jsp:oak_log', 'jsp:birch_log']);
        expect(tags.diagnostics).toHaveLength(1);
        expect(tags.diagnostics[0]).toMatchObject({ severity: 'error', code: 'tag.cycle', pack: 'base' });
        expect(tags.diagnostics[0]?.message).toContain('jsp:a');
        expect(tags.diagnostics[0]?.message).toContain('jsp:b');
    });

    it('reports a tag that references itself', () => {
        tags.rebuild([source('jsp:a', 'base', ['#jsp:a', 'jsp:oak_log'])]);

        expect(tags.get('jsp:a')?.members.map((member) => member.key)).toEqual(['jsp:oak_log']);
        expect(tags.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['tag.cycle']);
    });

    it('reports a required member the registry does not have, and keeps its holder', () => {
        tags.rebuild([source('jsp:logs', 'base', ['jsp:oak_log', 'jsp:cherry_log'])]);

        expect(tags.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['tag.unknown-member']);
        expect(tags.get('jsp:logs')?.members.map((member) => member.key)).toEqual(['jsp:oak_log', 'jsp:cherry_log']);
        expect(tags.get('jsp:logs')?.values()).toEqual([{ name: 'jsp:oak_log' }]);
    });

    it('drops an optional member the registry does not have without reporting', () => {
        tags.rebuild([source('jsp:logs', 'base', ['jsp:oak_log', { id: 'jsp:cherry_log', required: false }])]);

        expect(tags.diagnostics).toEqual([]);
        expect(tags.get('jsp:logs')?.members.map((member) => member.key)).toEqual(['jsp:oak_log']);
    });

    it('reports a reference to a tag no pack declares', () => {
        tags.rebuild([source('jsp:logs', 'base', ['#jsp:missing'])]);

        expect(tags.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['tag.unknown-tag']);
        expect(tags.get('jsp:logs')?.members).toEqual([]);
    });

    it('follows the registry across a rebuild, because members are holders', () => {
        tags.rebuild([source('jsp:logs', 'base', ['jsp:oak_log'])]);
        registry.rebuild([['jsp:oak_log', { name: 'renamed' }]]);

        expect(tags.get('jsp:logs')?.values()).toEqual([{ name: 'renamed' }]);
    });

    it('answers membership and the tags one key belongs to', () => {
        tags.rebuild([
            source('jsp:oak', 'base', ['jsp:oak_log']),
            source('jsp:logs', 'base', ['#jsp:oak', 'jsp:birch_log'])
        ]);

        expect(tags.get('jsp:logs')?.has('jsp:oak_log')).toBe(true);
        expect(tags.get('jsp:logs')?.has('jsp:oak_planks')).toBe(false);
        expect(tags.tagsOf('jsp:oak_log')).toEqual(['jsp:oak', 'jsp:logs']);
        expect(tags.names()).toEqual(['jsp:oak', 'jsp:logs']);
    });
});
