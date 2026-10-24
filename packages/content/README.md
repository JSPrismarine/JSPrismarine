# @jsprismarine/content

The runtime every content domain is built on. Blocks, items and entities each get their own package;
this one holds the parts they all need and knows nothing about any of them.

That split is the whole point. Nothing here names a block, an item or a hook. A domain supplies its
own hook map, its own component factories and its own reader for the shape of its JSON, and gets
registries, tags, component resolution, hook dispatch and load-time flattening back.

## The three layers

Content moves through three layers, in this order, and the code uses these names.

A **definition** is parsed, validated, immutable JSON for one identifier. `@jsprismarine/packs`
produces them from a pack stack and its `Definition` is assignable to the one declared here. The
shape is accepted structurally rather than imported, because a domain can also build types from
data that never passed through a pack, such as the Java Edition jar dump behind the block property
table.

A **type** is a definition resolved once at load. `resolveTypes` parses each component's value
through its factory's schema, binds the handlers, attaches the behaviors registered for that
identifier, builds the dispatch table and computes the flags the domain asked for. After that a
type answers questions without parsing anything.

An **instance** is one live thing of a type: an item stack or an entity, holding a reference to its
type plus whatever state the domain keeps per instance. A block in chunk storage is deliberately not
an instance. It is a runtime id, and the hot path reads a flattened array instead.

## Registries and holders

A `Registry<T>` is a named table keyed by namespaced identifier, with a dense numeric id per entry.
Ids run from 0 in insertion order. They are positional, not persistent: rebuilding with the same
keys in the same order reproduces every id, and rebuilding with a different order renumbers from 0.
So persist keys rather than ids.

To keep a reference across a content reload, take a `Holder<T>` instead. A holder resolves by key
every time, so after a reload it reads the new value and the new id, and a holder whose key the
reload dropped reports that rather than going stale. `registry.holder(key)` returns the same object
for the same key, including for a key no build has introduced yet.

```typescript
import { Registry } from '@jsprismarine/content';

const blocks = new Registry<BlockType>('blocks');
blocks.rebuild(types); // a ReadonlyMap, an array of pairs, anything iterable

const stone = blocks.holder('minecraft:stone');
stone.id; // 0
stone.value(); // throws while unbound
```

## Tags

`Tags<T>` holds the tag files of a whole pack stack for one registry. Merging follows Java Edition's
rule: a later file appends to the tag unless it sets `replace`, which drops everything earlier packs
contributed. A `#namespace:tag` member expands to that tag's own members, transitively.

A reference that closes a cycle is dropped and reported as a `tag.cycle` diagnostic rather than
thrown, so one bad pack cannot stop a load. Build the registry before the tags, because resolution
reports a required member the registry does not have. Members are holders, so the resolved sets
follow a later registry rebuild on their own.

## Components and behaviors

A component is one documented component name bound to a parameter schema and a set of hooks. The
schema is a plain function, so a domain can inject whatever checking it already has. It runs once
per type at load, and the factory turns the parsed parameters into handlers.

```typescript
import { accepted, type ComponentFactory, ComponentRegistry, rejected } from '@jsprismarine/content';

interface BlockHooks {
    onPlace: (position: Vector3) => void;
    onInteract: (player: Player) => boolean | undefined;
}

const friction: ComponentFactory<BlockHooks, number> = {
    name: 'minecraft:friction',
    hooks: [],
    schema: (value) => (typeof value === 'number' ? accepted(value) : rejected('expected a number')),
    create: () => ({})
};

const components = new ComponentRegistry<BlockHooks>();
components.register(friction);
```

A factory's `hooks` list is an upper bound. The parsed parameters may leave a hook out, which is how
a non-looping tick component implements nothing, but returning a hook the factory never declared is
a registration error. Domains read the list to decide which types can ever reach a hook.

A behavior is the same idea attached from the other side. Instead of appearing in a definition, it
is registered by name and attached to identifiers, which is how one door behavior covers every door.
The selector is an identifier, a list of them, or a predicate, and a predicate is how you attach by
tag.

Mojang's `minecraft:custom_components` is read as one more way to name a behavior rather than the
binding mechanism, because that hook is marked deprecated in Mojang's own documentation while its
version 2 still needs two experimental toggles.

## Hook dispatch

A domain declares its own hook map, so this package never knows a hook name:

```typescript
interface BlockHooks {
    onPlace: (position: Vector3) => void;
}
```

Declare it as an `interface` or a `type`, whichever you prefer. The generic parameter is written
`H extends HookSignatures<H>` for that reason: a plain index-signature constraint would reject an
interface, because TypeScript gives an implicit index signature to a type alias and not to one.

Each type gets a `HookTable` built once at load, which turns every hook into a frozen array of
handlers. Dispatch is an array lookup and a loop, with no map lookup and no allocation per call.
Order is the definition's component order first, then behaviors in attachment order, so the server's
own code has the last word over what a pack declared.

Either side can set `override`, which replaces every handler collected so far for the hooks that
contribution implements and leaves the others alone. That is Bedrock's permutation rule, and a
domain's `ComponentReader` sets it per entry when it emits a permutation's component list.

## Flattening

`flatten` is the Dragonfly `Finalize` idea: precompute the hot properties at load so the tick loop
reads an array slot instead of calling through a type.

```typescript
import { flatten } from '@jsprismarine/content';

const table = flatten(types.values(), {
    id: (type) => runtimeIdOf(type.identifier),
    length: paletteSize,
    columns: {
        friction: { kind: 'f32', read: (type) => type.params(friction) },
        lightEmission: { kind: 'u8', read: (type) => type.params(light), default: 0 }
    },
    exceptions: [{ id: 0, column: 'friction', value: 0.6, reason: 'minecraft:unknown has no Java row' }]
});

table.friction[runtimeId]; // a Float32Array read
```

The column's `kind` picks the typed array, and the return type carries it, so `table.friction` is a
`Float32Array` and `table.lightEmission` is a `Uint8Array`.

An id with no source value falls back to the column's `default` and then to a reviewed exception. An
id with neither fails the build, and so does an exception that matched nothing. That second rule is
what keeps the list honest: every gap is a row with a reason, and a row outlives the gap it covers
for exactly one build.

Values are range checked against the column kind, so 300 in a `u8` column and 0.5 in any integer
column fail the build instead of being silently truncated.

## Plugging in a domain

A domain package does five things, in this order.

1. Declare its hook map and register a `ComponentFactory` for every component name it implements.
2. Register its behaviors and attach them to identifiers or tags.
3. Write a `ComponentReader` that pulls the component list out of its own JSON shape, including
   `component_groups` and permutations if it has them.
4. Call `resolveTypes` on the definitions `@jsprismarine/packs` loaded, then
   `registry.rebuild(result.types)`.
5. Call `flatten` for the properties its tick loop reads, and hand out `Instance` handles or dense
   ids, whichever fits.

Diagnostics come back as a list rather than through a logger, with the same `Diagnostic` shape
`@jsprismarine/packs` uses, so you can concatenate a load report and a resolve report. An unknown
component name resolves the type anyway and is reported once per pack, which turns "component not
implemented" into a log line instead of a missing class. Pass `strict: true` to turn any diagnostic
into a `ContentLoadError`, which is what the test suites do.
