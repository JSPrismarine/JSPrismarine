# @jsprismarine/kernel

The module kernel from the [server re-architecture plan](../../docs/plans/server-rearchitecture.md).
It owns three things: module lifecycle, a token-keyed service registry, and the event bus. Worlds,
sessions, commands, networking, and the tick loop are modules; first-party and third-party modules
use the same API.

A module declares the service tokens it depends on, provides its own services during `register()`,
and does its I/O in `start()`. The kernel validates the dependency graph, starts modules in
dependency order, and stops them in reverse. A module can only `use()` tokens it declared, so the
declared list is the real dependency graph, not documentation.

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
when that module stops. The bus is a minimal typed async emitter; prismarine's `EventEmitter` is
adapted to it in a later phase.

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
