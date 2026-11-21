import { describe, expect, it } from 'vitest';

import { NbtErrors } from '@jsprismarine/errors/nbt';

import { insertAtPath, mergeAtPath, parseNbtPath, pathMatches, removeAtPath, setAtPath, singleMatch } from './path';
import { formatSnbt, parseSnbt, parseSnbtCompound } from './snbt';

const ROOT = parseSnbtCompound(
    '{Items: [{id: "minecraft:stone", Count: 3b}, {id: "minecraft:dirt", Count: 1b}], Pos: [I; 1, 2, 3], name: "x", "odd key": {v: 1}}'
);

const read = (path: string) => pathMatches(ROOT, parseNbtPath(path)).map(formatSnbt);

describe('parseNbtPath', () => {
    it('reads each node kind', () => {
        expect(parseNbtPath('{a: 1}.b{c: 2}[0][][{d: 3}]."e f"').nodes.map((node) => node.kind)).toEqual([
            'root',
            'matchChild',
            'index',
            'all',
            'matchElement',
            'child'
        ]);
    });

    it.each(['a.', 'a[', 'a[x]', '.a', 'a b', '', '"open', 'a{b:', 'a[{x: "y}]'])('refuses %s', (text) => {
        expect(() => parseNbtPath(text)).toThrow(NbtErrors.NbtPathSyntax);
    });
});

describe('pathMatches', () => {
    it('follows keys, indices from either end, every element and patterns', () => {
        expect(read('name')).toEqual(['"x"']);
        expect(read('Items[0].id')).toEqual(['"minecraft:stone"']);
        expect(read('Items[-1].Count')).toEqual(['1b']);
        expect(read('Items[].Count')).toEqual(['3b', '1b']);
        expect(read('Items[{id: "minecraft:dirt"}].Count')).toEqual(['1b']);
        expect(read('Pos[1]')).toEqual(['2']);
        expect(read('"odd key".v')).toEqual(['1']);
        expect(read('{name: "x"}.name')).toEqual(['"x"']);
        expect(read('{name: "y"}.name')).toEqual([]);
        expect(read('missing')).toEqual([]);
    });

    it('needs exactly one match for a single read', () => {
        expect(() => singleMatch(ROOT, parseNbtPath('missing'))).toThrow(NbtErrors.NbtPathNothingFound);
        expect(() => singleMatch(ROOT, parseNbtPath('Items[]'))).toThrow(NbtErrors.NbtPathMultiple);
    });
});

describe('setAtPath', () => {
    it('creates the compounds on the way and counts a change once', () => {
        const path = parseNbtPath('a.b.c');
        const first = setAtPath(ROOT, path, parseSnbt('5'));
        expect(first.changed).toBe(1);
        expect(pathMatches(first.root, path).map(formatSnbt)).toEqual(['5']);

        const again = setAtPath(first.root, path, parseSnbt('5'));
        expect(again.changed).toBe(0);
        expect(again.root).toBe(first.root);
    });

    it('sets every element a path names and leaves the input alone', () => {
        const edit = setAtPath(ROOT, parseNbtPath('Items[].Count'), parseSnbt('64b'));
        expect(edit.changed).toBe(2);
        expect(pathMatches(edit.root, parseNbtPath('Items[].Count')).map(formatSnbt)).toEqual(['64b', '64b']);
        expect(read('Items[].Count')).toEqual(['3b', '1b']);
    });

    it('refuses an edit that nests deeper than SNBT reads, and leaves the input alone', () => {
        const path = parseNbtPath(Array.from({ length: 512 }, () => 'a').join('.'));
        expect(() => setAtPath(ROOT, path, parseSnbt('{b: 1}'))).toThrow(NbtErrors.NbtPathTooDeep);
        expect(() => mergeAtPath(ROOT, path, parseSnbtCompound('{b: 1}'))).toThrow(NbtErrors.NbtPathTooDeep);
        expect(() => insertAtPath(ROOT, path, -1, [parseSnbt('{}')])).toThrow(NbtErrors.NbtPathTooDeep);
        expect(read('a')).toEqual([]);

        const deepest = setAtPath(ROOT, path, parseSnbt('1'));
        expect(parseSnbt(formatSnbt(deepest.root))).toEqual(deepest.root);
    });

    it('narrows a number written into a typed array', () => {
        const edit = setAtPath(ROOT, parseNbtPath('Pos[0]'), parseSnbt('7.9d'));
        expect(formatSnbt(singleMatch(edit.root, parseNbtPath('Pos')))).toBe('[I; 7, 2, 3]');
    });

    it('converts as Java does, and counts no change when the converted value is already there', () => {
        const root = parseSnbtCompound('{a: [I; 7], l: [L; 1L]}');
        expect(setAtPath(root, parseNbtPath('a[0]'), parseSnbt('7.9d')).changed).toBe(0);
        expect(setAtPath(root, parseNbtPath('a[]'), parseSnbt('7.9d')).changed).toBe(0);
        expect(setAtPath(root, parseNbtPath('a[0]'), parseSnbt('8')).changed).toBe(1);
        // Rounded down, as `Mth.floor` and `Math.floor` do, not toward zero.
        const negative = setAtPath(root, parseNbtPath('a[0]'), parseSnbt('-1.5d')).root;
        expect(formatSnbt(singleMatch(negative, parseNbtPath('a')))).toBe('[I; -2]');

        // An infinite double saturates a long array, in a set and an insert alike.
        const set = setAtPath(root, parseNbtPath('l[0]'), parseSnbt('1e999'));
        expect(formatSnbt(singleMatch(set.root, parseNbtPath('l')))).toBe('[L; 9223372036854775807L]');
        const inserted = insertAtPath(root, parseNbtPath('l'), 0, [parseSnbt('-1e999')]);
        expect(formatSnbt(singleMatch(inserted.root, parseNbtPath('l')))).toBe('[L; -9223372036854775808L, 1L]');
    });
});

describe('removeAtPath', () => {
    it('removes what the path names and counts it', () => {
        const edit = removeAtPath(ROOT, parseNbtPath('Items[{Count: 1b}]'));
        expect(edit.changed).toBe(1);
        expect(pathMatches(edit.root, parseNbtPath('Items[].id')).map(formatSnbt)).toEqual(['"minecraft:stone"']);
        expect(removeAtPath(ROOT, parseNbtPath('missing.key')).changed).toBe(0);
    });
});

describe('insertAtPath', () => {
    it('appends, prepends and inserts, creating a missing list', () => {
        const appended = insertAtPath(ROOT, parseNbtPath('list'), -1, [parseSnbt('1'), parseSnbt('2')]);
        const prepended = insertAtPath(appended.root, parseNbtPath('list'), 0, [parseSnbt('0')]);
        const inserted = insertAtPath(prepended.root, parseNbtPath('list'), 2, [parseSnbt('"mid"')]);
        expect(formatSnbt(singleMatch(inserted.root, parseNbtPath('list')))).toBe('[0, 1, "mid", 2]');
    });

    it('refuses a target that is not a list and an index outside one', () => {
        expect(() => insertAtPath(ROOT, parseNbtPath('name'), 0, [parseSnbt('1')])).toThrow(
            NbtErrors.NbtPathExpectedList
        );
        expect(() => insertAtPath(ROOT, parseNbtPath('Items'), 5, [parseSnbt('1')])).toThrow(
            NbtErrors.NbtPathInvalidIndex
        );
        expect(() => insertAtPath(ROOT, parseNbtPath('Pos'), 0, [parseSnbt('"s"')])).toThrow(
            NbtErrors.NbtPathInvalidIndex
        );
    });
});

describe('mergeAtPath', () => {
    it('merges nested compounds and reports no change for a merge that adds nothing', () => {
        const edit = mergeAtPath(ROOT, parseNbtPath('"odd key"'), parseSnbtCompound('{w: 2, v: 1}'));
        expect(edit.changed).toBe(1);
        expect(formatSnbt(singleMatch(edit.root, parseNbtPath('"odd key"')))).toBe('{v: 1, w: 2}');
        expect(mergeAtPath(edit.root, parseNbtPath('"odd key"'), parseSnbtCompound('{w: 2}')).changed).toBe(0);
    });

    it('refuses a target that is not a compound', () => {
        expect(() => mergeAtPath(ROOT, parseNbtPath('name'), parseSnbtCompound('{}'))).toThrow(
            NbtErrors.NbtPathExpectedObject
        );
    });
});
