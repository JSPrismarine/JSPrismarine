import { afterAll, describe, expect, it } from 'vitest';

import { reportProgress } from '../../../../.test/reportProgress';
import { SCRIPT_MODULE_HISTORIES } from '../generated/scriptModules';
import { ScriptApiError } from '../errors';
import type { ScriptEngine } from '../ScriptEngine';
import { loadLibrary, scriptHostAvailable } from '../testing/library.test.helper';
import type { ScriptApiLogger } from './binding';
import { ScriptApiContext } from './binding';
import { exportNames } from './history';
import { ScriptApiImplementations, implementationCoverage } from './implementations';
import { resolveDependency } from './resolve';

const ALLOWED = ['@minecraft/server', '@minecraft/server-ui', '@minecraft/common'];

/** A logger that keeps what it was told. */
class RecordingLogger implements ScriptApiLogger {
    public readonly lines: string[] = [];

    public warn(message: string): void {
        this.lines.push(message);
    }
}

const serve = (version: string) => {
    const resolution = resolveDependency(
        { module_name: '@minecraft/server', version },
        { pack: 'probe - 1.0.0', allowedModules: ALLOWED, histories: SCRIPT_MODULE_HISTORIES }
    );
    if (!resolution.ok) throw new Error(resolution.message);
    return resolution.shape;
};

/** Binds `@minecraft/server` for one pack and exposes it to scripts as the global `mc`. */
const bindServer = (
    engine: ScriptEngine,
    version: string,
    implementations = new ScriptApiImplementations(),
    logger = new RecordingLogger()
) => {
    const context = new ScriptApiContext(engine, { pack: `pack ${version} - 1.0.0`, implementations, logger });
    const namespace = context.bind(serve(version));
    const global = engine.global();
    engine.set(global, 'mc', namespace);
    engine.free(global);
    return { context, logger };
};

/** Runs a script and returns what it threw, as `name: message`, or `returned` when it did not throw. */
const thrown = (engine: ScriptEngine, source: string): string =>
    String(
        engine.evaluate(
            `(() => { try { ${source}; return 'returned'; } catch (e) { return e.name + ': ' + e.message; } })()`
        )
    );

describe.skipIf(!scriptHostAvailable())('binding the Script API into an engine', () => {
    const library = loadLibrary();
    const engines: ScriptEngine[] = [];
    const engine = (): ScriptEngine => {
        const created = library.createEngine();
        engines.push(created);
        return created;
    };
    afterAll(() => {
        for (const created of engines) created.destroy();
    });

    it.each([
        ['1.3.0', 354],
        ['2.0.0', 536]
    ])('gives a pack declaring %s a namespace with the %i exports of the version it is served', (version, count) => {
        const scripts = engine();
        bindServer(scripts, version);

        expect(scripts.evaluate('Object.keys(mc).length')).toBe(count);
        expect(exportNames(serve(version))).toHaveLength(count);
    });

    it('keeps every member present, so typeof and feature tests see what BDS has', () => {
        const scripts = engine();
        bindServer(scripts, '2.0.0');

        expect(scripts.evaluate('typeof mc.World')).toBe('function');
        expect(scripts.evaluate('typeof mc.world.getDimension')).toBe('function');
        expect(scripts.evaluate('typeof mc.World.prototype.sendMessage')).toBe('function');
        expect(scripts.evaluate("'seed' in mc.world")).toBe(true);
        expect(scripts.evaluate("typeof Object.getOwnPropertyDescriptor(mc.World.prototype, 'seed').get")).toBe(
            'function'
        );
        expect(scripts.evaluate('mc.world instanceof mc.World')).toBe(true);
        expect(scripts.evaluate('mc.world.getDimension.name')).toBe('getDimension');
        expect(scripts.evaluate('typeof mc.Dimension.prototype.runCommandAsync')).toBe('undefined');
        expect(scripts.evaluate('mc.TicksPerSecond')).toBe(20);
        expect(scripts.evaluate('mc.GameMode.Survival')).toBe('Survival');
        expect(
            scripts.evaluate('Object.getPrototypeOf(mc.PlayerJoinAfterEventSignal.prototype) === Object.prototype')
        ).toBe(true);
    });

    it('serves a 1.x pack the members 2.0.0 removed', () => {
        const scripts = engine();
        bindServer(scripts, '1.0.0');

        expect(scripts.evaluate('typeof mc.Dimension.prototype.runCommandAsync')).toBe('function');
        expect(scripts.evaluate('typeof mc.WorldInitializeAfterEvent')).toBe('function');
    });

    it('throws NotImplementedError naming the module, class and member, and logs it once per pack', () => {
        const scripts = engine();
        const { logger } = bindServer(scripts, '2.0.0');

        const message = 'NotImplementedError: World.getDimension from @minecraft/server is not implemented';
        expect(thrown(scripts, "mc.world.getDimension('overworld')")).toBe(message);
        expect(thrown(scripts, "mc.world.getDimension('nether')")).toBe(message);
        expect(thrown(scripts, 'mc.world.seed')).toBe(
            'NotImplementedError: World.seed from @minecraft/server is not implemented'
        );
        expect(thrown(scripts, 'mc.world.getDimension("x") instanceof Error')).toContain('NotImplementedError');
        expect(logger.lines).toEqual([
            `[pack 2.0.0 - 1.0.0] ${message.slice('NotImplementedError: '.length)}`,
            '[pack 2.0.0 - 1.0.0] World.seed from @minecraft/server is not implemented'
        ]);
    });

    it('checks arguments against the metadata before the implementation runs', () => {
        const scripts = engine();
        let calls = 0;
        const implementations = new ScriptApiImplementations()
            .implement('@minecraft/server', 'World', 'getDimension', () => {
                calls++;
                return 'a dimension';
            })
            .implement('@minecraft/server', 'Container', 'getItem', () => {
                calls++;
                return undefined;
            });
        bindServer(scripts, '2.0.0', implementations);

        expect(thrown(scripts, 'mc.world.getDimension()')).toBe(
            'TypeError: Incorrect number of arguments to function. Expected 1, received 0'
        );
        expect(thrown(scripts, 'mc.world.getDimension(5)')).toBe(
            'TypeError: Native type conversion failed. Function argument [0] expected type: string'
        );
        expect(thrown(scripts, 'new mc.ItemStack(5)')).toBe('TypeError: Native variant type conversion failed.');
        expect(thrown(scripts, "new mc.ItemStack('minecraft:apple', 300)")).toBe(
            'ArgumentOutOfBoundsError: Unsupported or out of bounds value passed to function argument [1]. Value: 300, Argument bounds: [1, 255]'
        );
        expect(thrown(scripts, 'Object.create(mc.Container.prototype).getItem(-1)')).toBe(
            'ArgumentOutOfBoundsError: Unsupported or out of bounds value passed to function argument [0]. Value: -1, Argument min: 0'
        );
        expect(calls).toBe(0);
        expect(scripts.evaluate("mc.world.getDimension('overworld')")).toBe('a dimension');
        expect(calls).toBe(1);
    });

    it('throws ArgumentOutOfBoundsError as an instance of the class from @minecraft/common, with its fields', () => {
        const scripts = engine();
        const { context } = bindServer(scripts, '2.0.0');
        const common = context.namespace('@minecraft/common');
        if (common === undefined) throw new Error('@minecraft/common is bound with @minecraft/server');
        const global = scripts.global();
        scripts.set(global, 'common', common);
        scripts.free(global);

        const error = `(() => { try { Object.create(mc.Container.prototype).getItem(-1); } catch (e) { return e; } })()`;
        expect(scripts.evaluate(`${error} instanceof common.ArgumentOutOfBoundsError`)).toBe(true);
        expect(scripts.evaluate(`${error} instanceof Error`)).toBe(true);
        expect(scripts.evaluate(`[${error}].map((e) => [e.index, e.value, e.minValue].join())[0]`)).toBe('0,-1,0');
    });

    it('fills in the default of an omitted argument before the implementation sees it', () => {
        const scripts = engine();
        const seen: unknown[][] = [];
        const implementations = new ScriptApiImplementations().implement(
            '@minecraft/server',
            'ItemStack',
            'constructor',
            (call) => {
                seen.push([...call.args]);
                return undefined;
            }
        );
        bindServer(scripts, '2.0.0', implementations);

        expect(scripts.evaluate("new mc.ItemStack('minecraft:apple') instanceof mc.ItemStack")).toBe(true);
        expect(seen).toEqual([['minecraft:apple', 1]]);
    });

    it('refuses to construct a class without a constructor', () => {
        const scripts = engine();
        bindServer(scripts, '2.0.0');

        expect(thrown(scripts, 'new mc.World()')).toBe("ReferenceError: No constructor for native class 'World'.");
        expect(thrown(scripts, 'new mc.LocationInUnloadedChunkError()')).toBe(
            "ReferenceError: No constructor for native class 'LocationInUnloadedChunkError'."
        );
    });

    it('lets an implementation throw one of the error classes of the API', () => {
        const scripts = engine();
        const implementations = new ScriptApiImplementations().implement(
            '@minecraft/server',
            'World',
            'getDimension',
            () => {
                throw new ScriptApiError(
                    '@minecraft/server',
                    'LocationInUnloadedChunkError',
                    'The chunk is not loaded'
                );
            }
        );
        bindServer(scripts, '2.0.0', implementations);

        expect(thrown(scripts, "mc.world.getDimension('overworld')")).toBe(
            'LocationInUnloadedChunkError: The chunk is not loaded'
        );
        expect(
            scripts.evaluate(
                "(() => { try { mc.world.getDimension('overworld'); } catch (e) { return e instanceof mc.LocationInUnloadedChunkError; } })()"
            )
        ).toBe(true);
    });

    it('reports how much of each served version is implemented', () => {
        const implementations = new ScriptApiImplementations();
        for (const version of ['1.19.0', '2.10.0']) {
            const { implemented, total } = implementationCoverage(serve(version), implementations);
            expect(total).toBeGreaterThan(0);
            reportProgress(
                `@minecraft/server ${version}: ${implemented} of ${total} members implemented`,
                'Script API coverage'
            );
        }
    });
});
