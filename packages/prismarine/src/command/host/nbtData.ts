/**
 * The NBT-by-path verbs of the command host: `/data`, `execute if data`, `execute store` and
 * `/function … with` against a level's command storage.
 *
 * The verbs read and edit `@jsprismarine/nbt` tags and follow Java Edition's `DataCommands`.
 * Blocks and entities have no NBT form here yet
 * ([#3575](https://github.com/JSPrismarine/JSPrismarine/issues/3575)), so a block or an entity
 * target is refused.
 */
import type { DataCommandHost, DataModifySource, DataTarget } from '@jsprismarine/commands';
import { NbtErrors } from '@jsprismarine/errors/nbt';
import { PrismarineWorldErrors } from '@jsprismarine/errors/prismarine/world';
import type { NbtEdit } from '@jsprismarine/nbt/path';
import {
    insertAtPath,
    mergeAtPath,
    parseNbtPath,
    pathMatches,
    removeAtPath,
    setAtPath,
    singleMatch
} from '@jsprismarine/nbt/path';
import { formatSnbt, parseSnbt, parseSnbtCompound } from '@jsprismarine/nbt/snbt';
import type { NbtCompoundTag, NbtTag } from '@jsprismarine/nbt/tag';
import { compoundTag, isNumericTag, mergeCompounds, numericValueOf, sizeOf, tagsEqual } from '@jsprismarine/nbt/tag';

import type { CommandStorage } from '../../world/CommandStorage';
import { refuse, unsupported } from './support';

/** The verbs this module implements. */
export type NbtDataVerbs = Pick<DataCommandHost, 'countData' | 'getData' | 'mergeData' | 'modifyData' | 'removeData'>;

/** The errors a player's input causes, which reach them as a refusal with the error's message. */
const INPUT_ERRORS = [
    NbtErrors.SnbtSyntax,
    NbtErrors.NbtPathSyntax,
    NbtErrors.NbtPathNothingFound,
    NbtErrors.NbtPathMultiple,
    NbtErrors.NbtPathExpectedList,
    NbtErrors.NbtPathExpectedObject,
    NbtErrors.NbtPathInvalidIndex,
    NbtErrors.NbtPathNotNumeric,
    NbtErrors.NbtPathTooDeep,
    PrismarineWorldErrors.InvalidStorageId
];

/** Runs a verb, turning an error the input caused into a refusal. */
const refusingInputErrors = <T>(run: () => T): T => {
    try {
        return run();
    } catch (error) {
        if (INPUT_ERRORS.some((type) => error instanceof type) && error instanceof Error) refuse(error.message);
        throw error;
    }
};

/** Java's `Mth.floor` into an `int`: down, saturated, and NaN to 0. */
const javaFloor = (value: number): number =>
    Number.isNaN(value) ? 0 : Math.min(Math.max(Math.floor(value), -(2 ** 31)), 2 ** 31 - 1);

/**
 * The number `/data get <path>` returns for a tag, which is Java's: a number rounded down, the size
 * of a list, an array or a compound, or a string's length.
 */
const resultOf = (tag: NbtTag): number => (isNumericTag(tag) ? javaFloor(numericValueOf(tag)) : sizeOf(tag));

/**
 * Builds the NBT verbs over a command storage.
 *
 * @param storage - The storage, read per call, since the host is built before the worlds load.
 */
export const nbtDataVerbs = (storage: () => CommandStorage): NbtDataVerbs => {
    const read = (target: DataTarget): NbtCompoundTag => {
        if (target.kind !== 'storage') return unsupported('NBT paths for blocks and entities');
        return storage().get(target.id);
    };
    const write = (target: DataTarget, compound: NbtCompoundTag): void => {
        if (target.kind !== 'storage') return unsupported('NBT paths for blocks and entities');
        storage().set(target.id, compound);
    };

    /** The tags `/data modify` writes: the one typed, or every one the source path names. */
    const tagsOf = (source: DataModifySource): readonly NbtTag[] => {
        if (source.kind === 'value') return [parseSnbt(source.snbt)];
        const root = read(source.target);
        if (source.path === undefined) return [root];
        const found = pathMatches(root, parseNbtPath(source.path));
        if (found.length === 0) throw new NbtErrors.NbtPathNothingFound({ path: source.path });
        return found;
    };

    /** Java's `merge` operation: every source must be a compound, and they merge into one first. */
    const combined = (tags: readonly NbtTag[]): NbtCompoundTag =>
        tags.reduce<NbtCompoundTag>((merged, tag) => {
            if (tag.type !== 'compound') throw new NbtErrors.NbtPathExpectedObject({ got: formatSnbt(tag) });
            return mergeCompounds(merged, tag);
        }, compoundTag());

    return {
        getData: (target, path, scale) =>
            refusingInputErrors(() => {
                const root = read(target);
                if (path === undefined) return { snbt: formatSnbt(root), result: 1 };
                const parsed = parseNbtPath(path);
                if (pathMatches(root, parsed).length === 0) return undefined;
                const tag = singleMatch(root, parsed);
                if (scale === undefined) return { snbt: formatSnbt(tag), result: resultOf(tag) };
                if (!isNumericTag(tag)) throw new NbtErrors.NbtPathNotNumeric({ path });
                return { snbt: formatSnbt(tag), result: javaFloor(numericValueOf(tag) * scale) };
            }),
        countData: (target, path) => refusingInputErrors(() => pathMatches(read(target), parseNbtPath(path)).length),
        mergeData: (target, nbt) =>
            refusingInputErrors(() => {
                const root = read(target);
                const merged = mergeCompounds(root, parseSnbtCompound(nbt));
                if (tagsEqual(root, merged)) return false;
                write(target, merged);
                return true;
            }),
        modifyData: (target, path, operation, source, index) =>
            refusingInputErrors(() => {
                const root = read(target);
                const parsed = parseNbtPath(path);
                const tags = tagsOf(source);
                let edit: NbtEdit;
                switch (operation) {
                    case 'set': {
                        const last = tags.at(-1);
                        if (last === undefined) return 0;
                        edit = setAtPath(root, parsed, last);
                        break;
                    }
                    case 'merge':
                        edit = mergeAtPath(root, parsed, combined(tags));
                        break;
                    case 'append':
                        edit = insertAtPath(root, parsed, -1, tags);
                        break;
                    case 'prepend':
                        edit = insertAtPath(root, parsed, 0, tags);
                        break;
                    case 'insert':
                        edit = insertAtPath(root, parsed, index ?? 0, tags);
                        break;
                }
                if (edit.changed > 0) write(target, edit.root);
                return edit.changed;
            }),
        removeData: (target, path) =>
            refusingInputErrors(() => {
                const edit = removeAtPath(read(target), parseNbtPath(path));
                if (edit.changed > 0) write(target, edit.root);
                return edit.changed;
            })
    };
};
