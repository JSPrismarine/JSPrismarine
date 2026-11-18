/**
 * The `@minecraft/server` members of `world.structureManager` and `Structure`.
 *
 * A structure is a box of blocks the world keeps by id ({@link ScriptStructureStore}), so every
 * pack and every reload sees the same ones. A `Structure` object carries only its id, and the
 * manager returns the same object for an id each time, as BDS does. Copying reads the world's
 * blocks and placing writes them through the world's setter, one block at a time. The values and
 * errors follow the `structures` scenario recorded on the pinned Bedrock Dedicated Server.
 */
import { ScriptApiError } from '../errors';
import type { ScriptApiImplementations, ScriptCall } from '../shape/implementations';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import type { PackHost } from './minecraftServer';
import { blockPosition, COMMON, permutationOf, SERVER, TAG, unloadedChunk, vectorArgument } from './serverObjects';
import type {
    ScriptBlockPermutation,
    ScriptStructure,
    ScriptStructureSaveMode,
    ScriptStructureStore,
    ScriptVector3
} from './world';

/** How a placement turns a structure about the vertical axis, as `StructureRotation` names it. */
type Rotation = 'None' | 'Rotate90' | 'Rotate180' | 'Rotate270';

/** How a placement flips a structure, as `StructureMirrorAxis` names it. */
type Mirror = 'None' | 'X' | 'Z' | 'XZ';

/** The quarter turns clockwise, seen from above, of each rotation. */
const TURNS: Readonly<Record<Rotation, number>> = { None: 0, Rotate90: 1, Rotate180: 2, Rotate270: 3 };

const isRotation = (value: ScriptValue | undefined): value is Rotation =>
    typeof value === 'string' && Object.hasOwn(TURNS, value);

/** The horizontal directions clockwise from north, as the states that hold one write them. */
const CLOCKWISE: readonly string[] = ['north', 'east', 'south', 'west'];

/** The block states a turn or a flip changes, with the way each changes. */
const turnState = (name: string, value: string | number | boolean, turns: number, mirror: Mirror) => {
    if (typeof value !== 'string') return value;
    if (name === 'pillar_axis') return turns % 2 === 1 && value !== 'y' ? (value === 'x' ? 'z' : 'x') : value;
    if (name !== 'minecraft:cardinal_direction' && name !== 'minecraft:facing_direction') return value;
    let at = CLOCKWISE.indexOf(value);
    if (at < 0) return value;
    // A flip across X swaps east and west; one across Z swaps north and south.
    if ((mirror === 'X' || mirror === 'XZ') && at % 2 === 1) at = (at + 2) % 4;
    if ((mirror === 'Z' || mirror === 'XZ') && at % 2 === 0) at = (at + 2) % 4;
    return CLOCKWISE[(at + turns) % 4] ?? value;
};

/** The index of a block in a structure's list: x outermost, then y, then z. */
const indexOf = ({ y: sizeY, z: sizeZ }: ScriptVector3, { x, y, z }: ScriptVector3): number =>
    (x * sizeY + y) * sizeZ + z;

/** Whether a whole-block location is inside a structure of a size. */
const inside = (size: ScriptVector3, { x, y, z }: ScriptVector3): boolean =>
    x >= 0 && y >= 0 && z >= 0 && x < size.x && y < size.y && z < size.z;

/** A structure with each block replaced, its palette kept to the blocks it holds. */
const withBlocks = (
    structure: ScriptStructure,
    blocks: readonly (ScriptBlockPermutation | null)[]
): ScriptStructure => {
    const palette: ScriptBlockPermutation[] = [];
    const keys = new Map<string, number>();
    const indices = blocks.map((block) => {
        if (block === null) return -1;
        const key = JSON.stringify(block);
        let index = keys.get(key);
        if (index === undefined) {
            index = palette.push(block) - 1;
            keys.set(key, index);
        }
        return index;
    });
    return { ...structure, palette, blocks: indices };
};

/** BDS's error for a member of a structure that was deleted, or a placement of an id it does not have. */
const missingStructure = (): ScriptApiError =>
    new ScriptApiError(SERVER, 'InvalidStructureError', 'Structure does not exist.');

/** BDS's error for an argument it refuses, at an index. */
const invalidArgument = (index: number, message: string): ScriptApiError =>
    new ScriptApiError(COMMON, 'InvalidArgumentError', `Invalid value passed to argument [${index}]. ${message}`, {
        index
    });

/**
 * Registers the structure manager and structure members.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementStructures = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const { world } = host;
    /** A world without structures keeps them for as long as the pack runs. */
    const fallback = new Map<string, ScriptStructure>();
    const store: ScriptStructureStore = world.structures ?? {
        get: (id) => fallback.get(id),
        set: (id, structure) => void fallback.set(id, structure),
        delete: (id) => fallback.delete(id),
        ids: () => [...fallback.keys()]
    };
    const structureObject = (id: string): ScriptHandle => host.instance('Structure', TAG.structure, id);
    /** The id a structure argument names: a structure object's, or a string. */
    const idArgument = (call: ScriptCall, value: ScriptValue | undefined): string =>
        value instanceof ScriptHandle ? call.stateOf(value) : String(value);
    /** A new id, or BDS's error for one without a namespace or one already in use. */
    const newId = (call: ScriptCall, index: number): string => {
        const id = String(call.args[index]);
        if (!id.includes(':')) throw invalidArgument(index, 'Invalid or missing namespace.');
        if (store.get(id) !== undefined)
            throw invalidArgument(index, `Structure with identifier '${id}' already exists.`);
        return id;
    };
    /** The structure an object names, or BDS's error once it is deleted. */
    const structureOf = (call: ScriptCall): ScriptStructure => {
        const found = store.get(call.state);
        if (found === undefined) throw missingStructure();
        return found;
    };
    /** A location inside a structure, or BDS's error for one outside it. */
    const locationIn = (call: ScriptCall, structure: ScriptStructure): ScriptVector3 => {
        const location = blockPosition(vectorArgument(call, 0));
        if (!inside(structure.size, location)) {
            const { x, y, z } = location;
            const size = structure.size;
            throw invalidArgument(
                0,
                `The provided location (${x}, ${y}, ${z}) is outside the structure bounds (${size.x}, ${size.y}, ${size.z}).`
            );
        }
        return location;
    };
    /** Reads one option of an options argument the binding checked is an object. */
    const option = (call: ScriptCall, index: number, key: string): ScriptValue | undefined => {
        const options = call.args[index];
        if (!(options instanceof ScriptHandle)) return undefined;
        const value = call.engine.get(options, key);
        if (value instanceof ScriptHandle) {
            // Only plain options are read here; a dimension or a structure is read by its state.
            const state = call.stateOf(value);
            call.engine.free(value);
            return state;
        }
        return value;
    };
    const saveModeOf = (value: ScriptValue | undefined): ScriptStructureSaveMode =>
        value === 'Memory' ? 'Memory' : 'World';

    implementations
        .implement(SERVER, 'World', 'structureManager', {
            get: () => host.instance('StructureManager', TAG.structureManager)
        })
        .implement(SERVER, 'StructureManager', 'createFromWorld', (call) => {
            const id = newId(call, 0);
            const dimension = call.stateOf(call.args[1] ?? null);
            const from = blockPosition(vectorArgument(call, 2));
            const to = blockPosition(vectorArgument(call, 3));
            const low = { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), z: Math.min(from.z, to.z) };
            const size = {
                x: Math.abs(to.x - from.x) + 1,
                y: Math.abs(to.y - from.y) + 1,
                z: Math.abs(to.z - from.z) + 1
            };
            const includeBlocks = option(call, 4, 'includeBlocks') !== false;
            const blocks: (ScriptBlockPermutation | null)[] = [];
            for (let x = 0; x < size.x; x++) {
                for (let y = 0; y < size.y; y++) {
                    for (let z = 0; z < size.z; z++) {
                        if (!includeBlocks) {
                            blocks.push(null);
                            continue;
                        }
                        const at = { x: low.x + x, y: low.y + y, z: low.z + z };
                        const block = world.block(dimension, at);
                        if (block === undefined) throw unloadedChunk(at);
                        blocks.push(block);
                    }
                }
            }
            const empty: ScriptStructure = {
                size,
                palette: [],
                blocks: [],
                saveMode: saveModeOf(option(call, 4, 'saveMode'))
            };
            store.set(id, withBlocks(empty, blocks));
            return structureObject(id);
        })
        .implement(SERVER, 'StructureManager', 'createEmpty', (call) => {
            const id = newId(call, 0);
            const size = blockPosition(vectorArgument(call, 1));
            const saveMode = saveModeOf(call.args[2]);
            store.set(id, {
                size,
                palette: [],
                blocks: Array.from({ length: size.x * size.y * size.z }, () => -1),
                saveMode
            });
            return structureObject(id);
        })
        .implement(SERVER, 'StructureManager', 'get', (call) => {
            const id = String(call.args[0]);
            return store.get(id) === undefined ? undefined : structureObject(id);
        })
        .implement(SERVER, 'StructureManager', 'delete', (call) => store.delete(idArgument(call, call.args[0])))
        .implement(SERVER, 'StructureManager', 'getWorldStructureIds', () => JSON.stringify(store.ids()))
        .implement(SERVER, 'StructureManager', 'place', (call) => {
            const structure = store.get(idArgument(call, call.args[0]));
            if (structure === undefined) throw missingStructure();
            const dimension = call.stateOf(call.args[1] ?? null);
            const origin = blockPosition(vectorArgument(call, 2));
            if (option(call, 3, 'includeBlocks') === false) return undefined;
            const rotation = option(call, 3, 'rotation');
            const turns = isRotation(rotation) ? TURNS[rotation] : 0;
            const mirrorOption = option(call, 3, 'mirror');
            const mirror: Mirror =
                mirrorOption === 'X' || mirrorOption === 'Z' || mirrorOption === 'XZ' ? mirrorOption : 'None';
            const { size } = structure;
            for (let x = 0; x < size.x; x++) {
                for (let y = 0; y < size.y; y++) {
                    for (let z = 0; z < size.z; z++) {
                        const block = structure.palette[structure.blocks[indexOf(size, { x, y, z })] ?? -1];
                        if (block === undefined) continue;
                        // Flip first, then turn clockwise a quarter at a time, as the `structures` scenario recorded.
                        let px = mirror === 'X' || mirror === 'XZ' ? size.x - 1 - x : x;
                        let pz = mirror === 'Z' || mirror === 'XZ' ? size.z - 1 - z : z;
                        let spanX = size.x;
                        let spanZ = size.z;
                        for (let turn = 0; turn < turns; turn++) {
                            [px, pz] = [spanZ - 1 - pz, px];
                            [spanX, spanZ] = [spanZ, spanX];
                        }
                        const states: Record<string, string | number | boolean> = {};
                        for (const [name, value] of Object.entries(block.states)) {
                            states[name] = turnState(name, value, turns, mirror);
                        }
                        world.setBlock(
                            dimension,
                            { x: origin.x + px, y: origin.y + y, z: origin.z + pz },
                            { typeId: block.typeId, states }
                        );
                    }
                }
            }
            return undefined;
        })
        .implement(SERVER, 'Structure', 'id', { get: (call) => call.state })
        .implement(SERVER, 'Structure', 'isValid', { get: (call) => store.get(call.state) !== undefined })
        .implement(SERVER, 'Structure', 'size', { get: (call) => JSON.stringify(structureOf(call).size) })
        .implement(SERVER, 'Structure', 'getBlockPermutation', (call) => {
            const structure = structureOf(call);
            const block =
                structure.palette[structure.blocks[indexOf(structure.size, locationIn(call, structure))] ?? -1];
            return block === undefined
                ? undefined
                : host.engine.release(host.create('BlockPermutation', TAG.permutation, JSON.stringify(block)));
        })
        .implement(SERVER, 'Structure', 'setBlockPermutation', (call) => {
            const structure = structureOf(call);
            const at = indexOf(structure.size, locationIn(call, structure));
            const [, value] = call.args;
            const blocks = structure.blocks.map((index) => structure.palette[index] ?? null);
            blocks[at] = value instanceof ScriptHandle ? permutationOf(call.stateOf(value)) : null;
            store.set(call.state, withBlocks(structure, blocks));
            return undefined;
        })
        // No structure holds water yet: a waterlogged block is not copied as one.
        .implement(SERVER, 'Structure', 'getIsWaterlogged', (call) => {
            locationIn(call, structureOf(call));
            return false;
        })
        .implement(SERVER, 'Structure', 'saveAs', (call) => {
            const structure = structureOf(call);
            const id = newId(call, 0);
            store.set(id, { ...structure, saveMode: saveModeOf(call.args[1]) });
            return structureObject(id);
        })
        .implement(SERVER, 'Structure', 'saveToWorld', (call) => {
            store.set(call.state, { ...structureOf(call), saveMode: 'World' });
            return undefined;
        });
};
