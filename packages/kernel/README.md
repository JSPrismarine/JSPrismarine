# @jsprismarine/kernel

The module kernel from the [server re-architecture plan](https://github.com/JSPrismarine/JSPrismarine/blob/master/docs/plans/server-rearchitecture.md).
It owns three things: module lifecycle, a token-keyed service registry, and the event bus. Worlds,
sessions, commands, networking, and the tick loop are modules; first-party and third-party modules
use the same API.

A module declares the service tokens it depends on, provides its own services during `register()`,
and does its I/O in `start()`. The kernel validates the dependency graph, starts modules in
dependency order, and stops them in reverse. A module whose start throws rolls back the ones already
started, and a `stop()` during a start cancels it. A module can only `use()` tokens it declared, so the
declared list is the real dependency graph, not documentation.

A kernel is built once and restarted freely: `registerAll()` runs every `register()` phase exactly
once (and `get()` resolves provided services from then on), `start()` runs it first when needed and
then runs the start phases, and `stop()` returns the kernel to the registered state so `start()`
may run again. Module services carry over across restarts; listeners a module needs after a
restart belong in `start()`, since the bus detaches a module's listeners when it stops.

```typescript
import { createToken, Kernel } from '@jsprismarine/kernel';

const bans = createToken<BanService>('prismarine:bans');

const banModule = {
    id: 'prismarine:ban-module',
    register(ctx) {
        ctx.provide(bans, createBanService(ctx.config));
    }
} satisfies Module<BanConfig>;

const kernel = new Kernel({ config: { 'prismarine:ban-module': banConfig } });
kernel.register(banModule);
await kernel.start();
kernel.get(bans);
await kernel.stop();
```

Event listeners registered through a module's context are tagged with the module id and detached
when that module stops. Listeners run in subscription order. `post` calls each one and returns
without waiting, and `emit` waits for each listener before it calls the next. A listener that
throws or rejects is logged through the kernel's logger, and the listeners after it still run.

## Testing a module

`@jsprismarine/kernel/testing` starts one module against a kernel containing only its declared
dependencies, each backed by a stub the test supplies:

```typescript
import { startTestModule, stubService } from '@jsprismarine/kernel/testing';

const handle = await startTestModule(banModule, {
    stubs: [stubService(storage, inMemoryStorage())],
    config: banConfig
});
```

A stub for a token the module no longer declares fails, as does a declared dependency without a
stub and any `use()` of an undeclared token, so the dependency list cannot drift from what the
module actually uses.
