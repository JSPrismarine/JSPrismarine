/**
 * `@minecraft/server`'s own debug text: `world.primitiveShapesManager`, `PrimitiveShape` and
 * `TextPrimitive`. A `TextPrimitive` keeps the state a `@minecraft/debug-utilities` `DebugText`
 * keeps and draws through the pack's same drawer ({@link PackDebugDrawer}), so the two modules
 * share their members. The `primitive-shapes` scenario recorded BDS's defaults, which are
 * `DebugText`'s, with every player able to see a text until `visibleTo` or `hiddenFrom` says
 * otherwise.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import type { ScriptApiImplementations, ScriptCall } from '../../shape/implementations';
import type { ScriptValue } from '../../values';
import { ScriptHandle } from '../../values';
import type { DebugPackHost } from '../debugUtilities';
import { shapeHelpers, sharedShapeMembers } from '../debugUtilities';
import type { PackHost } from '../minecraftServer';
import { entityKeyOf, PLAYER, SERVER } from '../serverObjects';
import { WORLD_TAG } from './tags';

/** The most shapes a pack's manager draws, as BDS's `maxShapes` reads. */
const MAX_SHAPES = 1000;

/**
 * Registers the primitive shape members.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementPrimitiveShapes = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const debugHost = (): DebugPackHost => {
        const found = host.debugShapes?.();
        if (found === undefined) throw new ScriptHostErrors.ObjectCarriesNoState({ what: 'debug shape drawer' });
        return found;
    };
    const shared = () => sharedShapeMembers(debugHost());
    const helpers = () => shapeHelpers(debugHost());
    /** The players a list argument holds, by id. */
    const playersOf = (call: ScriptCall): string[] => {
        const [list] = call.args;
        if (!(list instanceof ScriptHandle)) return [];
        const length = call.engine.get(list, 'length');
        const ids: string[] = [];
        for (let index = 0; typeof length === 'number' && index < length; index++) {
            const player = call.engine.get(list, String(index));
            const state = call.stateOf(player ?? null);
            if (player instanceof ScriptHandle) call.engine.free(player);
            if (state !== '') ids.push(entityKeyOf(state).id);
        }
        return ids;
    };
    /** A list of the pack's player objects for ids. */
    const playerArray = (ids: readonly string[] | undefined): ScriptHandle => {
        const array = host.engine.evaluate('[]');
        if (!(array instanceof ScriptHandle)) throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'array' });
        (ids ?? []).forEach((id, index) => host.engine.set(array, String(index), host.entity({ id, typeId: PLAYER })));
        return host.engine.release(array);
    };
    /** Reads a property of a shape object through its own getter, as plain data. */
    const readOf = (call: ScriptCall, shape: ScriptHandle, key: string): unknown => {
        const value = call.engine.get(shape, key);
        if (value instanceof ScriptHandle) {
            const json = call.stringify(value);
            const state = call.stateOf(value);
            call.engine.free(value);
            if (state !== '') return state;
            // The engine wrote the string with JSON.stringify.
            return json === undefined ? undefined : JSON.parse(json);
        }
        return value;
    };
    const numberOf = (value: unknown, key: string): number =>
        typeof value === 'object' && value !== null ? Number(Reflect.get(value, key)) : Number.NaN;

    implementations
        .implement(SERVER, 'World', 'primitiveShapesManager', {
            get: () => host.instance('PrimitiveShapesManager', WORLD_TAG.primitiveShapesManager)
        })
        .implement(SERVER, 'PrimitiveShapesManager', 'maxShapes', { get: () => MAX_SHAPES })
        .implement(SERVER, 'PrimitiveShapesManager', 'addText', (call) => {
            const [text, dimension] = call.args;
            const drawer = debugHost();
            drawer.drawer.add(text ?? null, dimension === undefined ? undefined : drawer.dimensionOf(dimension));
            return undefined;
        })
        .implement(SERVER, 'PrimitiveShapesManager', 'removeText', (call) => {
            debugHost().drawer.remove(call.args[0] ?? null);
            return undefined;
        })
        .implement(SERVER, 'PrimitiveShapesManager', 'removeAll', () => {
            debugHost().drawer.removeAll();
            return undefined;
        })
        .implement(SERVER, 'PrimitiveShapesManager', 'getShapes', (call) => {
            const options = call.args[0];
            const option = (key: string): unknown =>
                options instanceof ScriptHandle ? readOf(call, options, key) : undefined;
            const center = option('location');
            const most = option('maxDistance');
            const least = option('minDistance');
            const attached = option('attachedTo');
            const attachedId = typeof attached === 'string' && attached !== '' ? entityKeyOf(attached).id : undefined;
            const array = host.engine.evaluate('[]');
            if (!(array instanceof ScriptHandle))
                throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'array' });
            let index = 0;
            for (const shape of debugHost().drawer.shapes()) {
                if (attachedId !== undefined) {
                    const on = readOf(call, shape, 'attachedTo');
                    if (typeof on !== 'string' || on === '' || entityKeyOf(on).id !== attachedId) continue;
                }
                if (center !== undefined) {
                    const at = readOf(call, shape, 'location');
                    const distance = Math.hypot(
                        numberOf(at, 'x') - numberOf(center, 'x'),
                        numberOf(at, 'y') - numberOf(center, 'y'),
                        numberOf(at, 'z') - numberOf(center, 'z')
                    );
                    if (typeof most === 'number' && distance > most) continue;
                    if (typeof least === 'number' && distance < least) continue;
                }
                host.engine.set(array, String(index++), shape);
            }
            return host.engine.release(array);
        })
        .implement(SERVER, 'TextPrimitive', 'constructor', (call) => helpers().textMade(call))
        .implement(SERVER, 'TextPrimitive', 'text', { get: (call) => shared().text.get(call) })
        .implement(SERVER, 'TextPrimitive', 'setText', (call) => shared().setText(call))
        .implement(SERVER, 'TextPrimitive', 'backfaceVisible', {
            get: (call) => shared().backfaceVisible.get(call),
            set: (call) => shared().backfaceVisible.set(call)
        })
        .implement(SERVER, 'TextPrimitive', 'depthTest', {
            get: (call) => shared().depthTest.get(call),
            set: (call) => shared().depthTest.set(call)
        })
        .implement(SERVER, 'TextPrimitive', 'textBackfaceVisible', {
            get: (call) => shared().textBackfaceVisible.get(call),
            set: (call) => shared().textBackfaceVisible.set(call)
        })
        .implement(SERVER, 'TextPrimitive', 'useRotation', {
            get: (call) => shared().useRotation.get(call),
            set: (call) => shared().useRotation.set(call)
        })
        .implement(SERVER, 'TextPrimitive', 'lineGapHeight', {
            get: (call) => shared().lineGapHeight.get(call),
            set: (call) => shared().lineGapHeight.set(call)
        })
        .implement(SERVER, 'TextPrimitive', 'backgroundColorOverride', {
            get: (call) => shared().backgroundColorOverride.get(call),
            set: (call) => shared().backgroundColorOverride.set(call)
        })
        .implement(SERVER, 'PrimitiveShape', 'location', { get: (call) => shared().location.get(call) })
        .implement(SERVER, 'PrimitiveShape', 'setLocation', (call) => shared().setLocation(call))
        .implement(SERVER, 'PrimitiveShape', 'dimension', { get: (call) => shared().dimension.get(call) })
        .implement(SERVER, 'PrimitiveShape', 'color', {
            get: (call) => shared().color.get(call),
            set: (call) => shared().color.set(call)
        })
        .implement(SERVER, 'PrimitiveShape', 'scale', {
            get: (call) => shared().scale.get(call),
            set: (call) => shared().scale.set(call)
        })
        .implement(SERVER, 'PrimitiveShape', 'rotation', {
            get: (call) => shared().rotation.get(call),
            set: (call) => shared().rotation.set(call)
        })
        .implement(SERVER, 'PrimitiveShape', 'maximumRenderDistance', {
            get: (call) => shared().maximumRenderDistance.get(call),
            set: (call) => shared().maximumRenderDistance.set(call)
        })
        .implement(SERVER, 'PrimitiveShape', 'timeLeft', {
            get: (call) => shared().timeLeft.get(call),
            set: (call) => shared().timeLeft.set(call)
        })
        .implement(SERVER, 'PrimitiveShape', 'totalTimeLeft', { get: (call) => shared().totalTimeLeft.get(call) })
        .implement(SERVER, 'PrimitiveShape', 'hasDuration', { get: (call) => shared().hasDuration.get(call) })
        .implement(SERVER, 'PrimitiveShape', 'attachedTo', {
            get: (call) => shared().attachedTo.get(call),
            set: (call) => shared().attachedTo.set(call)
        })
        .implement(SERVER, 'PrimitiveShape', 'remove', (call) => shared().remove(call))
        .implement(SERVER, 'PrimitiveShape', 'visibleTo', {
            get: (call) => playerArray(helpers().read(call).visibleTo),
            set: (call) => helpers().write(call, { visibleTo: playersOf(call) })
        })
        .implement(SERVER, 'PrimitiveShape', 'hiddenFrom', {
            get: (call) => playerArray(helpers().read(call).hiddenFrom),
            set: (call) => helpers().write(call, { hiddenFrom: playersOf(call) })
        })
        .implement(SERVER, 'PrimitiveShape', 'defaultVisibleToAll', {
            get: (call): ScriptValue => helpers().read(call).defaultVisibleToAll !== false,
            set: (call) => helpers().write(call, { defaultVisibleToAll: call.args[0] === true })
        });
};
