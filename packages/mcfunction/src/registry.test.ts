import { describe, expect, it } from 'vitest';

import type { FunctionPack } from './registry';
import { loadFunctions } from './registry';
import { TICK_FUNCTION_TAG, resolveFunctionTag } from './tags';

/** Builds one pack from a map of pack-relative paths to file text. */
const pack = (name: string, files: Record<string, string>): FunctionPack => ({
    name,
    files: new Map(Object.entries(files))
});

describe('loadFunctions', () => {
    it('keys a function on the namespace and path of its file', () => {
        const { functions, diagnostics } = loadFunctions([
            pack('base', { 'data/pack/function/greet/hello.mcfunction': 'say hello\n' })
        ]);

        expect(diagnostics).toEqual([]);
        expect(functions.ids()).toEqual(['pack:greet/hello']);
        expect(functions.get('pack:greet/hello')?.length).toBe(1);
    });

    it('ignores files outside data/<namespace>/function', () => {
        const { functions } = loadFunctions([
            pack('base', {
                'pack.mcmeta': '{}',
                'data/pack/loot_table/stone.json': '{}',
                'data/pack/function/hello.txt': 'say hello\n'
            })
        ]);

        expect(functions.size).toBe(0);
    });

    it('lets a later pack replace a function an earlier pack declared', () => {
        const { functions } = loadFunctions([
            pack('base', { 'data/pack/function/hello.mcfunction': 'say base\n' }),
            pack('override', { 'data/pack/function/hello.mcfunction': 'say override\n' })
        ]);

        expect(functions.packOf('pack:hello')).toBe('override');
        expect(functions.get('pack:hello')?.instantiate()).toMatchObject({
            commands: [{ command: 'say override', line: 1 }]
        });
    });

    it('reads a function tag file and attributes it to the tag registry', () => {
        const { tags } = loadFunctions([
            pack('base', {
                'data/minecraft/tags/function/tick.json': '{"values":["pack:loop"]}',
                'data/pack/function/loop.mcfunction': 'say loop\n'
            })
        ]);

        expect(resolveFunctionTag(tags, TICK_FUNCTION_TAG).functions).toEqual(['pack:loop']);
    });

    it('merges what two packs add to the same tag', () => {
        const { tags } = loadFunctions([
            pack('base', { 'data/minecraft/tags/function/tick.json': '{"values":["pack:first"]}' }),
            pack('extra', { 'data/minecraft/tags/function/tick.json': '{"values":["pack:second"]}' })
        ]);

        expect(resolveFunctionTag(tags, TICK_FUNCTION_TAG).functions).toEqual(['pack:first', 'pack:second']);
    });

    it('honors replace in a tag file', () => {
        const { tags } = loadFunctions([
            pack('base', { 'data/minecraft/tags/function/tick.json': '{"values":["pack:first"]}' }),
            pack('extra', { 'data/minecraft/tags/function/tick.json': '{"replace":true,"values":["pack:second"]}' })
        ]);

        expect(resolveFunctionTag(tags, TICK_FUNCTION_TAG).functions).toEqual(['pack:second']);
    });

    it('reports a broken function and still loads the rest of the pack', () => {
        const { functions, diagnostics } = loadFunctions([
            pack('base', {
                'data/pack/function/broken.mcfunction': '/say hello\n',
                'data/pack/function/fine.mcfunction': 'say hello\n'
            })
        ]);

        expect(functions.ids()).toEqual(['pack:fine']);
        expect(diagnostics[0]).toMatchObject({ code: 'line.leading-slash', pack: 'base', functionId: 'pack:broken' });
    });

    it('reports a tag file that is not a valid tag', () => {
        const { tags, diagnostics } = loadFunctions([
            pack('base', { 'data/minecraft/tags/function/tick.json': '{"values":42}' })
        ]);

        expect(tags.ids()).toEqual([]);
        expect(diagnostics[0]).toMatchObject({ code: 'load.invalid-file', pack: 'base' });
    });

    it('accepts file bytes as well as text', () => {
        const bytes = new TextEncoder().encode('say hello\n');
        const { functions } = loadFunctions([
            { name: 'base', files: new Map([['data/pack/function/hello.mcfunction', bytes]]) }
        ]);

        expect(functions.has('pack:hello')).toBe(true);
    });
});
