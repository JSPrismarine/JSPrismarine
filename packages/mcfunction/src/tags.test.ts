import { describe, expect, it } from 'vitest';

import { FunctionTagRegistry, LOAD_FUNCTION_TAG, TICK_FUNCTION_TAG, resolveFunctionTag } from './tags';

/** Builds a tag registry from plain tag files, as a pack would declare them. */
const registryOf = (tags: Record<string, readonly (string | { id: string; required?: boolean })[]>) => {
    const registry = new FunctionTagRegistry();
    for (const [id, values] of Object.entries(tags)) registry.add(id, { values });
    return registry;
};

describe('lifecycle tags', () => {
    it('names the two tags the server looks up', () => {
        expect([LOAD_FUNCTION_TAG, TICK_FUNCTION_TAG]).toEqual(['minecraft:load', 'minecraft:tick']);
    });
});

describe('resolveFunctionTag', () => {
    it('expands a tag into its functions, in file order', () => {
        const tags = registryOf({ 'minecraft:tick': ['pack:first', 'pack:second'] });

        expect(resolveFunctionTag(tags, TICK_FUNCTION_TAG)).toMatchObject({
            functions: ['pack:first', 'pack:second'],
            exists: true,
            diagnostics: []
        });
    });

    it('accepts the id with or without a leading #', () => {
        const tags = registryOf({ 'minecraft:tick': ['pack:first'] });

        expect(resolveFunctionTag(tags, '#minecraft:tick').functions).toEqual(['pack:first']);
    });

    it('expands a nested tag where it appears', () => {
        const tags = registryOf({
            'pack:outer': ['pack:before', '#pack:inner', 'pack:after'],
            'pack:inner': ['pack:nested']
        });

        expect(resolveFunctionTag(tags, 'pack:outer').functions).toEqual(['pack:before', 'pack:nested', 'pack:after']);
    });

    it('names each function once even when two tags list it', () => {
        const tags = registryOf({ 'pack:outer': ['pack:one', '#pack:inner'], 'pack:inner': ['pack:one'] });

        expect(resolveFunctionTag(tags, 'pack:outer').functions).toEqual(['pack:one']);
    });

    it('cuts a cycle between tags and reports it', () => {
        const tags = registryOf({ 'pack:a': ['pack:one', '#pack:b'], 'pack:b': ['#pack:a', 'pack:two'] });
        const resolved = resolveFunctionTag(tags, 'pack:a');

        expect(resolved.functions).toEqual(['pack:one', 'pack:two']);
        expect(resolved.diagnostics[0]?.code).toBe('tag.cycle');
    });

    it('reports a missing nested tag', () => {
        const tags = registryOf({ 'pack:a': ['#pack:absent'] });
        const resolved = resolveFunctionTag(tags, 'pack:a');

        expect(resolved.functions).toEqual([]);
        expect(resolved.diagnostics[0]?.code).toBe('tag.missing-entry');
    });

    it('stays quiet about a missing nested tag the pack marked optional', () => {
        const tags = registryOf({ 'pack:a': [{ id: '#pack:absent', required: false }] });

        expect(resolveFunctionTag(tags, 'pack:a').diagnostics).toEqual([]);
    });

    it('reports that a tag nobody declared does not exist', () => {
        expect(resolveFunctionTag(registryOf({}), TICK_FUNCTION_TAG)).toMatchObject({
            functions: [],
            exists: false,
            diagnostics: []
        });
    });
});

describe('FunctionTagRegistry', () => {
    it('merges the entries every pack contributes, in pack order', () => {
        const registry = new FunctionTagRegistry();
        registry.add(TICK_FUNCTION_TAG, { values: ['first:tick'] });
        registry.add(TICK_FUNCTION_TAG, { values: ['second:tick'] });

        expect(resolveFunctionTag(registry, TICK_FUNCTION_TAG).functions).toEqual(['first:tick', 'second:tick']);
    });

    it('lets a later pack discard the earlier entries with replace', () => {
        const registry = new FunctionTagRegistry();
        registry.add(TICK_FUNCTION_TAG, { values: ['first:tick'] });
        registry.add(TICK_FUNCTION_TAG, { values: ['second:tick'], replace: true });

        expect(resolveFunctionTag(registry, TICK_FUNCTION_TAG).functions).toEqual(['second:tick']);
    });

    it('fills in the default namespace', () => {
        const registry = new FunctionTagRegistry();
        registry.add('tick', { values: ['pack:tick'] });

        expect(registry.ids()).toEqual(['minecraft:tick']);
    });
});
