/**
 * `world.tickingAreaManager`: the scripts' ticking areas, which keep chunks loaded and ticking
 * with no player near. The `ticking-areas` scenario recorded what BDS does: an area covers whole
 * chunks over the dimension's full height, the scripts' areas share 300 chunks and are kept
 * apart from the `/tickingarea` command's, an id in use or an area past the limit throws at once,
 * and `createTickingArea`'s promise resolves on a later tick, once every chunk has loaded.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { ScriptApiError } from '../../errors';
import type { ScriptApiImplementations, ScriptCall } from '../../shape/implementations';
import { ScriptHandle } from '../../values';
import type { PackHost } from '../minecraftServer';
import { SERVER, TAG } from '../serverObjects';
import type { ScriptVector3 } from '../world';
import type { ScriptChunkArea, ScriptTickingArea } from './seam';
import { worldSystemOf } from './serverWorld';
import { WORLD_TAG } from './tags';

/** The most chunks the scripts' ticking areas may cover between them, as BDS's `maxChunkCount` reads. */
export const MAX_TICKING_CHUNKS = 300;

/** How many chunks an area covers. */
const chunkCountOf = ({ minX, maxX, minZ, maxZ }: ScriptChunkArea): number => (maxX - minX + 1) * (maxZ - minZ + 1);

/** The chunks a block box covers, by its corners in any order. */
const chunksOf = (from: ScriptVector3, to: ScriptVector3): ScriptChunkArea => ({
    minX: Math.min(Math.floor(from.x), Math.floor(to.x)) >> 4,
    maxX: Math.max(Math.floor(from.x), Math.floor(to.x)) >> 4,
    minZ: Math.min(Math.floor(from.z), Math.floor(to.z)) >> 4,
    maxZ: Math.max(Math.floor(from.z), Math.floor(to.z)) >> 4
});

const tickingAreaError = (message: string): ScriptApiError => new ScriptApiError(SERVER, 'TickingAreaError', message);

/**
 * Makes a pending promise, and the check a task runs every tick until the area has loaded. The
 * check reads the area through the manager, so a script sees the same answer it would, and once
 * it resolves the promise it clears its own task through `system`.
 */
const WATCH_SOURCE = `(manager, identifier, system) => {
    let resolve;
    let task;
    const promise = new Promise((done) => { resolve = () => done(); });
    const check = () => {
        const area = manager.getTickingArea(identifier);
        if (area !== undefined && !area.isFullyLoaded) return;
        system.clearRun(task);
        resolve();
    };
    return [promise, check, (id) => { task = id; }];
}`;

/**
 * Registers the ticking area manager's members.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementTickingAreas = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const system = () => worldSystemOf(host);
    /** The interval task watching each area until its chunks load, by the area's id. */
    const watching = new Map<string, number>();
    const stopWatching = (identifier: string): void => {
        const task = watching.get(identifier);
        if (task === undefined) return;
        watching.delete(identifier);
        host.clearRun(task);
    };
    const find = (identifier: string): ScriptTickingArea | undefined =>
        system()
            .tickingAreas()
            .find((area) => area.identifier === identifier);
    /** How many distinct chunks the areas cover, with one more area when given: overlapping areas share them. */
    const used = (extra?: { readonly dimension: string; readonly chunks: ScriptChunkArea }): number => {
        const covered = new Set<string>();
        for (const { dimension, chunks } of [...system().tickingAreas(), ...(extra === undefined ? [] : [extra])]) {
            for (let x = chunks.minX; x <= chunks.maxX; x++)
                for (let z = chunks.minZ; z <= chunks.maxZ; z++) covered.add(`${dimension} ${x} ${z}`);
        }
        return covered.size;
    };
    /** The id a `string | TickingArea` argument names. */
    const identifierOf = (call: ScriptCall): string => {
        const [given] = call.args;
        if (!(given instanceof ScriptHandle)) return String(given);
        const identifier = call.engine.get(given, 'identifier');
        if (identifier instanceof ScriptHandle) call.engine.free(identifier);
        return String(identifier);
    };
    /** A `TickingAreaOptions` argument as its dimension and the chunks it covers. */
    const optionsOf = (call: ScriptCall, index: number): { dimension: string; chunks: ScriptChunkArea } => {
        const options = call.args[index];
        if (!(options instanceof ScriptHandle)) {
            throw new ScriptHostErrors.ArgumentNotOfType({ argument: 'options', type: 'TickingAreaOptions' });
        }
        const part = (key: string): ScriptVector3 => {
            const value = call.engine.get(options, key);
            const json = call.stringify(value ?? null);
            if (value instanceof ScriptHandle) call.engine.free(value);
            // The engine wrote the string with JSON.stringify; the binding checked it is a Vector3.
            const parsed: unknown = json === undefined ? undefined : JSON.parse(json);
            const read = (axis: string) =>
                typeof parsed === 'object' && parsed !== null ? Number(Reflect.get(parsed, axis)) : 0;
            return { x: read('x'), y: read('y'), z: read('z') };
        };
        const dimensionHandle = call.engine.get(options, 'dimension');
        const dimension = call.stateOf(dimensionHandle ?? null);
        if (dimensionHandle instanceof ScriptHandle) call.engine.free(dimensionHandle);
        return { dimension, chunks: chunksOf(part('from'), part('to')) };
    };
    /** A `TickingArea`, a plain object whose dimension is the pack's dimension object. */
    const areaObject = ({ identifier, dimension, chunks, loaded }: ScriptTickingArea): ScriptHandle => {
        const { min, max } = host.world.heightRange(dimension);
        const made = host.engine.evaluate(
            `(${JSON.stringify({
                identifier,
                boundingBox: {
                    min: { x: chunks.minX * 16, y: min, z: chunks.minZ * 16 },
                    max: { x: chunks.maxX * 16 + 15, y: max, z: chunks.maxZ * 16 + 15 }
                },
                chunkCount: chunkCountOf(chunks),
                isFullyLoaded: loaded
            })})`
        );
        if (!(made instanceof ScriptHandle)) throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'object' });
        host.engine.set(made, 'dimension', host.instance('Dimension', TAG.dimension, dimension));
        return host.engine.release(made);
    };

    implementations
        .implement(SERVER, 'World', 'tickingAreaManager', {
            get: () => host.instance('TickingAreaManager', WORLD_TAG.tickingAreaManager)
        })
        .implement(SERVER, 'TickingAreaManager', 'maxChunkCount', { get: () => MAX_TICKING_CHUNKS })
        .implement(SERVER, 'TickingAreaManager', 'chunkCount', { get: () => used() })
        .implement(
            SERVER,
            'TickingAreaManager',
            'hasCapacity',
            (call) => used(optionsOf(call, 0)) <= MAX_TICKING_CHUNKS
        )
        .implement(SERVER, 'TickingAreaManager', 'hasTickingArea', (call) => find(String(call.args[0])) !== undefined)
        .implement(SERVER, 'TickingAreaManager', 'getTickingArea', (call) => {
            const found = find(identifierOf(call));
            return found === undefined ? undefined : areaObject(found);
        })
        .implement(SERVER, 'TickingAreaManager', 'getAllTickingAreas', () => {
            const array = host.engine.evaluate('[]');
            if (!(array instanceof ScriptHandle))
                throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'array' });
            system()
                .tickingAreas()
                .forEach((area, index) => {
                    const made = areaObject(area);
                    host.engine.set(array, String(index), made);
                });
            return host.engine.release(array);
        })
        .implement(SERVER, 'TickingAreaManager', 'createTickingArea', (call) => {
            const identifier = String(call.args[0]);
            const { dimension, chunks } = optionsOf(call, 1);
            if (find(identifier) !== undefined) throw tickingAreaError(`Identifier '${identifier}' already exists.`);
            if (used({ dimension, chunks }) > MAX_TICKING_CHUNKS) {
                throw tickingAreaError(
                    `Adding '${identifier}' pushes the ticking chunks over the limit of '${MAX_TICKING_CHUNKS}'.`
                );
            }
            system().addTickingArea(identifier, dimension, chunks);
            const watch = call.engine.evaluate(WATCH_SOURCE, '<jsp createTickingArea>');
            if (!(watch instanceof ScriptHandle)) throw new ScriptHostErrors.NotAFunction({ what: 'The area watch' });
            // Any System object clears any of the pack's tasks, as they all reach the same queue.
            const tasks = host.instance('System', WORLD_TAG.watchSystem);
            const made = call.engine.call(watch, undefined, call.self, identifier, tasks);
            call.engine.free(watch);
            if (!(made instanceof ScriptHandle))
                throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'array' });
            const promise = call.engine.get(made, '0');
            const check = call.engine.get(made, '1');
            const setTask = call.engine.get(made, '2');
            call.engine.free(made);
            if (
                !(promise instanceof ScriptHandle) ||
                !(check instanceof ScriptHandle) ||
                !(setTask instanceof ScriptHandle)
            ) {
                throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'array' });
            }
            stopWatching(identifier);
            const task = host.schedule('interval', check, 1);
            watching.set(identifier, task);
            call.engine.call(setTask, undefined, task);
            call.engine.free(setTask);
            call.engine.free(check);
            return call.engine.release(promise);
        })
        .implement(SERVER, 'TickingAreaManager', 'removeTickingArea', (call) => {
            const identifier = identifierOf(call);
            if (!system().removeTickingArea(identifier)) throw tickingAreaError(`Unknown identifier '${identifier}'.`);
            stopWatching(identifier);
            return undefined;
        })
        .implement(SERVER, 'TickingAreaManager', 'removeAllTickingAreas', () => {
            for (const { identifier } of system().tickingAreas()) {
                system().removeTickingArea(identifier);
                stopWatching(identifier);
            }
            return undefined;
        });
};
