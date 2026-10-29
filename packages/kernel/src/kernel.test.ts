import { describe, expect, it } from 'vitest';

import { Kernel, KernelError } from './kernel';
import type { KernelLogger } from './logger';
import type { Module } from './module';
import { createToken } from './token';

interface Named {
    name(): string;
}

const aToken = createToken<Named>('test:a');
const bToken = createToken<Named>('test:b');
const cToken = createToken<Named>('test:c');

const named = (name: string): Named => ({ name: () => name });

const recordingLogger = (lines: string[]): KernelLogger => ({
    debug: (message) => lines.push(message),
    info: (message) => lines.push(message),
    warn: (message) => lines.push(message),
    error: (message) => lines.push(message)
});

/** Builds a provider module that logs its lifecycle phases into `calls`. */
const provider = (id: string, token: typeof aToken, calls: string[], dependencies: Module['dependencies'] = []) =>
    ({
        id,
        dependencies,
        register(ctx) {
            calls.push(`${id}:register`);
            ctx.provide(token, named(id));
        },
        start() {
            calls.push(`${id}:start`);
        },
        stop() {
            calls.push(`${id}:stop`);
        }
    }) satisfies Module;

describe('Kernel lifecycle', () => {
    it('runs all register phases, then start phases in dependency order', async () => {
        const calls: string[] = [];
        const kernel = new Kernel();
        // Register the dependent first: topological ordering, not registration
        // order, must drive the start phases.
        kernel.register({
            id: 'consumer',
            dependencies: [aToken, bToken],
            register() {
                calls.push('consumer:register');
            },
            start(ctx) {
                calls.push(`consumer:start(${ctx.use(aToken).name()},${ctx.use(bToken).name()})`);
            }
        });
        kernel.register(provider('a', aToken, calls));
        kernel.register(provider('b', bToken, calls));
        await kernel.start();

        expect(calls).toStrictEqual([
            'consumer:register',
            'a:register',
            'b:register',
            'a:start',
            'b:start',
            'consumer:start(a,b)'
        ]);
    });

    it('stops modules in reverse start order', async () => {
        const calls: string[] = [];
        const kernel = new Kernel();
        kernel.register(provider('a', aToken, calls));
        kernel.register(provider('b', bToken, calls, [aToken]));
        kernel.register(provider('c', cToken, calls, [bToken]));
        await kernel.start();
        calls.length = 0;
        await kernel.stop();

        expect(calls).toStrictEqual(['c:stop', 'b:stop', 'a:stop']);
    });

    it('logs a failing stop and keeps stopping the remaining modules', async () => {
        const calls: string[] = [];
        const lines: string[] = [];
        const kernel = new Kernel({ logger: recordingLogger(lines) });
        kernel.register(provider('a', aToken, calls));
        kernel.register({
            id: 'broken',
            dependencies: [aToken],
            register() {},
            stop() {
                throw new Error('teardown exploded');
            }
        });
        await kernel.start();
        await expect(kernel.stop()).resolves.toBeUndefined();

        expect(lines.join('\n')).toContain('teardown exploded');
        expect(calls).toContain('a:stop');
    });

    it('rejects a second start and registration after start', async () => {
        const kernel = new Kernel();
        await kernel.start();

        await expect(kernel.start()).rejects.toThrow(KernelError);
        expect(() => kernel.register({ id: 'late', register() {} })).toThrow(/after the kernel has run registerAll/);
    });

    it('resolves provided services after registerAll() without starting', async () => {
        const calls: string[] = [];
        const kernel = new Kernel();
        kernel.register(provider('a', aToken, calls));
        await kernel.registerAll();

        expect(kernel.get(aToken).name()).toBe('a');
        expect(calls).toStrictEqual(['a:register']);
        expect(() => kernel.register({ id: 'late', register() {} })).toThrow(/after the kernel has run registerAll/);
    });

    it('registerAll() is a no-op after the first run', async () => {
        const calls: string[] = [];
        const kernel = new Kernel();
        kernel.register(provider('a', aToken, calls));
        await kernel.registerAll();
        await kernel.registerAll();
        await kernel.start();

        expect(calls).toStrictEqual(['a:register', 'a:start']);
    });

    it('restarts after stop without rerunning register phases', async () => {
        const calls: string[] = [];
        const kernel = new Kernel();
        kernel.register(provider('a', aToken, calls));
        kernel.register(provider('b', bToken, calls, [aToken]));
        await kernel.start();
        await kernel.stop();
        await kernel.start();
        await kernel.stop();

        expect(calls).toStrictEqual([
            'a:register',
            'b:register',
            'a:start',
            'b:start',
            'b:stop',
            'a:stop',
            'a:start',
            'b:start',
            'b:stop',
            'a:stop'
        ]);
        expect(kernel.get(aToken).name()).toBe('a');
    });

    it('treats stop() before start as a no-op', async () => {
        const calls: string[] = [];
        const kernel = new Kernel();
        kernel.register(provider('a', aToken, calls));
        await kernel.stop();
        await kernel.registerAll();
        await kernel.stop();

        expect(calls).toStrictEqual(['a:register']);
    });

    it('rejects duplicate module ids', () => {
        const kernel = new Kernel();
        kernel.register({ id: 'twice', register() {} });

        expect(() => kernel.register({ id: 'twice', register() {} })).toThrow(/already registered/);
    });
});

describe('Kernel dependency graph', () => {
    it('reports a declared dependency nothing provides', async () => {
        const kernel = new Kernel();
        kernel.register({ id: 'consumer', dependencies: [aToken], register() {} });

        await expect(kernel.start()).rejects.toThrow(
            'Module "consumer" depends on service "test:a" but no registered module provides it'
        );
    });

    it('reports a dependency cycle with its path', async () => {
        const calls: string[] = [];
        const kernel = new Kernel();
        kernel.register(provider('a', aToken, calls, [bToken]));
        kernel.register(provider('b', bToken, calls, [aToken]));

        await expect(kernel.start()).rejects.toThrow(/Dependency cycle between modules: a -> b -> a/);
    });
});

describe('Kernel service registry', () => {
    it('rejects a duplicate provider without override', async () => {
        const kernel = new Kernel();
        kernel.register({
            id: 'first',
            register(ctx) {
                ctx.provide(aToken, named('first'));
            }
        });
        kernel.register({
            id: 'second',
            register(ctx) {
                ctx.provide(aToken, named('second'));
            }
        });

        await expect(kernel.start()).rejects.toThrow(
            'Service "test:a" is already provided by module "first"; pass override: true to replace it'
        );
    });

    it('lets a later module replace a provider with override: true', async () => {
        const kernel = new Kernel();
        kernel.register({
            id: 'first',
            register(ctx) {
                ctx.provide(aToken, named('first'));
            }
        });
        kernel.register({
            id: 'plugin',
            register(ctx) {
                ctx.provide(aToken, named('plugin'), { override: true });
            }
        });
        await kernel.start();

        expect(kernel.get(aToken).name()).toBe('plugin');
    });

    it('rejects provide() outside the register phase', async () => {
        const kernel = new Kernel();
        kernel.register({
            id: 'late-provider',
            register() {},
            start(ctx) {
                ctx.provide(aToken, named('late'));
            }
        });

        await expect(kernel.start()).rejects.toThrow(/may only provide "test:a" during its register\(\) phase/);
    });

    it('rejects use() of an undeclared token', async () => {
        const kernel = new Kernel();
        kernel.register(provider('a', aToken, []));
        kernel.register({
            id: 'sneaky',
            register() {},
            start(ctx) {
                ctx.use(aToken);
            }
        });

        await expect(kernel.start()).rejects.toThrow(
            'Module "sneaky" used service "test:a" without declaring it as a dependency'
        );
    });

    it('tells a module using a not-yet-registered provider to resolve in start()', async () => {
        const kernel = new Kernel();
        kernel.register({
            id: 'eager',
            dependencies: [aToken],
            register(ctx) {
                ctx.use(aToken);
            }
        });
        kernel.register(provider('a', aToken, []));

        await expect(kernel.start()).rejects.toThrow(/resolve dependencies in start\(\), not register\(\)/);
    });

    it('get() resolves provided services and rejects unknown tokens', async () => {
        const kernel = new Kernel();
        kernel.register(provider('a', aToken, []));
        await kernel.start();

        expect(kernel.get(aToken).name()).toBe('a');
        expect(() => kernel.get(bToken)).toThrow('No provider for service "test:b"');
    });
});

describe('Kernel module context', () => {
    it('hands each module its config slice', async () => {
        const seen: unknown[] = [];
        const kernel = new Kernel({ config: { alpha: { port: 19132 } } });
        kernel.register<{ port: number }>({
            id: 'alpha',
            register(ctx) {
                seen.push(ctx.config.port);
            }
        });
        kernel.register({
            id: 'beta',
            register(ctx) {
                seen.push(ctx.config);
            }
        });
        await kernel.start();

        expect(seen).toStrictEqual([19132, undefined]);
    });

    it('scopes the logger with the module id', async () => {
        const lines: string[] = [];
        const kernel = new Kernel({ logger: recordingLogger(lines) });
        kernel.register({
            id: 'noisy',
            register(ctx) {
                ctx.logger.info('hello');
            }
        });
        await kernel.start();

        expect(lines).toStrictEqual(['[noisy] hello']);
    });

    it("detaches a module's event listeners when it stops", async () => {
        const received: string[] = [];
        const kernel = new Kernel<{ chat: [message: string] }>();
        kernel.register({
            id: 'listener',
            register(ctx) {
                ctx.events.on('chat', (message) => {
                    received.push(message);
                });
            }
        });
        await kernel.start();
        await kernel.events.emit('chat', 'before stop');
        await kernel.stop();
        await kernel.events.emit('chat', 'after stop');

        expect(received).toStrictEqual(['before stop']);
    });
});
