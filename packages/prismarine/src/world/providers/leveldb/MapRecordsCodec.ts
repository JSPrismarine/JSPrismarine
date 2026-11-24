/**
 * The LevelDB records `jsprismarine:maps` and `jsprismarine:structure_references`: the maps a
 * level made and the structure starts explorer maps point at, which grow for the life of the
 * level.
 *
 * Each is a list of compounds rather than JSON in the world record, because the world record is
 * one `TAG_String`, which holds at most 65,535 bytes: a few hundred maps would have made every
 * later metadata save throw.
 */
import { NBTTagCompound, Types } from '@jsprismarine/nbt';

import type { SavedMap, SavedMapDecoration } from '../../savedMap';
import type { StructureReference } from '../../WorldPersistence';

const MAPS_TAG = 'maps';
const REFERENCES_TAG = 'references';

/** The compounds a list holds, skipping anything else in it. */
const compoundsIn = (root: NBTTagCompound, name: string): NBTTagCompound[] =>
    [...(root.getList(name, false) ?? [])].filter((entry) => entry instanceof NBTTagCompound);

/** Whether a compound holds every key, so a missing field is not read as its default. */
const holds = (compound: NBTTagCompound, keys: readonly string[]): boolean => keys.every((key) => compound.has(key));

const decorationToNbt = (decoration: SavedMapDecoration): NBTTagCompound => {
    const entry = new NBTTagCompound('');
    entry.addValue('type', new Types.StringVal(decoration.type));
    entry.addValue('x', new Types.NumberVal(decoration.x));
    entry.addValue('y', new Types.NumberVal(decoration.y));
    entry.addValue('rotation', new Types.NumberVal(decoration.rotation));
    return entry;
};

/** Writes every map under its id. */
export const mapsToNbt = (maps: ReadonlyMap<number, SavedMap>): NBTTagCompound => {
    const root = new NBTTagCompound('');
    const entries = new Set<NBTTagCompound>();
    for (const [id, map] of maps) {
        const entry = new NBTTagCompound('');
        entry.addValue('id', new Types.NumberVal(id));
        entry.addValue('dimension', new Types.StringVal(map.dimension));
        entry.addValue('centerX', new Types.NumberVal(map.centerX));
        entry.addValue('centerZ', new Types.NumberVal(map.centerZ));
        entry.addValue('scale', new Types.NumberVal(map.scale));
        entry.addValue('decorations', new Set(map.decorations.map(decorationToNbt)));
        entries.add(entry);
    }
    root.addValue(MAPS_TAG, entries);
    return root;
};

/** Reads the maps back, skipping an entry that is missing a field. */
export const mapsFromNbt = (root: NBTTagCompound): Map<number, SavedMap> => {
    const maps = new Map<number, SavedMap>();
    for (const entry of compoundsIn(root, MAPS_TAG)) {
        if (!holds(entry, ['id', 'dimension', 'centerX', 'centerZ', 'scale'])) continue;
        const decorations = compoundsIn(entry, 'decorations')
            .filter((decoration) => holds(decoration, ['type', 'x', 'y', 'rotation']))
            .map((decoration) => ({
                type: decoration.getString('type', ''),
                x: decoration.getNumber('x', 0),
                y: decoration.getNumber('y', 0),
                rotation: decoration.getNumber('rotation', 0)
            }));
        maps.set(entry.getNumber('id', 0), {
            dimension: entry.getString('dimension', ''),
            centerX: entry.getNumber('centerX', 0),
            centerZ: entry.getNumber('centerZ', 0),
            scale: entry.getNumber('scale', 0),
            decorations
        });
    }
    return maps;
};

/** Writes the referenced structure starts. */
export const structureReferencesToNbt = (references: readonly StructureReference[]): NBTTagCompound => {
    const root = new NBTTagCompound('');
    const entries = new Set<NBTTagCompound>();
    for (const reference of references) {
        const entry = new NBTTagCompound('');
        entry.addValue('dimension', new Types.StringVal(reference.dimension));
        entry.addValue('structure', new Types.StringVal(reference.structure));
        entry.addValue('chunkX', new Types.NumberVal(reference.chunkX));
        entry.addValue('chunkZ', new Types.NumberVal(reference.chunkZ));
        entries.add(entry);
    }
    root.addValue(REFERENCES_TAG, entries);
    return root;
};

/** Reads the referenced structure starts back, skipping an entry that is missing a field. */
export const structureReferencesFromNbt = (root: NBTTagCompound): StructureReference[] =>
    compoundsIn(root, REFERENCES_TAG)
        .filter((entry) => holds(entry, ['dimension', 'structure', 'chunkX', 'chunkZ']))
        .map((entry) => ({
            dimension: entry.getString('dimension', ''),
            structure: entry.getString('structure', ''),
            chunkX: entry.getNumber('chunkX', 0),
            chunkZ: entry.getNumber('chunkZ', 0)
        }));
