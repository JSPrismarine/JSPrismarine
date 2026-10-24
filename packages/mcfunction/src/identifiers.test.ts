import { describe, expect, it } from 'vitest';

import { functionIdForPath, functionTagIdForPath, normalizeIdentifier, parseFunctionReference } from './identifiers';

describe('normalizeIdentifier', () => {
    it('fills in the minecraft namespace', () => {
        expect(normalizeIdentifier('tick')).toBe('minecraft:tick');
    });

    it('keeps an explicit namespace and a nested path', () => {
        expect(normalizeIdentifier('pack:setup/stage_one')).toBe('pack:setup/stage_one');
    });

    it('rejects an uppercase path, which the id grammar does not allow', () => {
        expect(normalizeIdentifier('pack:Setup')).toBeUndefined();
    });
});

describe('parseFunctionReference', () => {
    it('reads a plain id as a function', () => {
        expect(parseFunctionReference('pack:greet')).toEqual({ kind: 'function', id: 'pack:greet' });
    });

    it('reads a # prefix as a tag and drops the marker', () => {
        expect(parseFunctionReference('#minecraft:tick')).toEqual({ kind: 'tag', id: 'minecraft:tick' });
    });

    it('rejects a reference with a space in it', () => {
        expect(parseFunctionReference('pack:gre et')).toBeUndefined();
    });
});

describe('functionIdForPath', () => {
    it('derives the id from the 26.3 singular function directory', () => {
        expect(functionIdForPath('data/pack/function/setup/stage.mcfunction')).toBe('pack:setup/stage');
    });

    it('ignores a file that is not under a function directory', () => {
        expect(functionIdForPath('data/pack/functions/stage.mcfunction')).toBeUndefined();
        expect(functionIdForPath('data/pack/function/stage.json')).toBeUndefined();
        expect(functionIdForPath('functions/stage.mcfunction')).toBeUndefined();
    });
});

describe('functionTagIdForPath', () => {
    it('derives the tag id from tags/function', () => {
        expect(functionTagIdForPath('data/minecraft/tags/function/tick.json')).toBe('minecraft:tick');
    });

    it('ignores a tag file for another registry', () => {
        expect(functionTagIdForPath('data/minecraft/tags/block/mineable/axe.json')).toBeUndefined();
    });
});
