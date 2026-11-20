# Permissions

Started 2026-11-21. This plan is a working document: tick slices off, and add or reshape them as
the work teaches us things. [Placeholders and the tab list](placeholders-and-tab-list.md) builds
on it.

## Goal

The server gets a permission system of the kind Spigot owners know from LuckPerms: groups with
weights and inheritance, per-user nodes, prefix and suffix meta, expiring ranks, and a `/perms`
command to manage all of it. Scripts read and write the same data through `@jsprismarine/server`,
and other addons read a player's group and meta through placeholders.

Player identity changes with it. Today every file keys a player by the UUID the login chain
carries. A save that comes from Bedrock Dedicated Server keys players by XUID, a Java save by the
Mojang profile UUID, and the two will share a server one day. So a subject is the platform's own
durable id, typed so that no code path can forget which platform it has.

What done looks like:

- A player's identity in code is a discriminated union: `xbox` by XUID, `java` by UUID, `offline`
  by name. Every branch on it switches over `kind` with a `never` check, so adding a platform makes
  the compiler list each site to update.
- `permissions.json` holds `groups` and `users`, with users filed under one section per kind, so
  a BDS save's XUIDs match without translation. The old shape migrates in place at startup, and
  `ops.json` and `banned-players.json` move to the same keys.
- A group has a weight, parent groups, nodes, meta and optional expiry on each node and
  membership. Every subject holds the `default` group. Nodes take `scope.*` wildcards and a
  leading `-` negates. A user's own nodes beat group nodes, a heavier group beats a lighter one, a
  specific node beats a wildcard, and negation wins a tie.
- `/op` and `ops.json` stay. A `level` meta from 0 to 4 sets a subject's command level, and an
  operator runs at 4 whatever their groups say.
- `/perms` manages users and groups, each subcommand behind its own node, and names a target by
  an online selector or an offline name.
- `@jsprismarine/server` exports `permissions`, with reads, writes and a change event, and
  registers a `perms` placeholder namespace once [placeholders](placeholders-and-tab-list.md)
  exist.

Out of scope for now:

- Linking a Java and an Xbox account into one person. The design leaves room for a `links`
  section that points one subject at another, so the keys never change.
- Contexts, such as a node that applies in one world only. A node is an object on disk so a
  `contexts` field can be added without a schema break.
- Moving player data folders, inventories and advancements to the new keys. They keep their
  current keys and get a follow-up issue.

## What we know

- `PermissionManager` in `packages/prismarine/src/permission/` files permissions and operators by
  the login UUID. `PermissionHolder` is `Pick<PlayerIdentity, 'uuid'>`, and `can()` builds the
  check commands use, where the console and holders of `*` always pass and a node matches itself
  or a parent `scope.*`.
- `permissions.json` today has `defaultPermissions`, `defaultOperatorPermissions` and `players`.
  `ops.json` is an array of `{ name, uuid, level }`. `banned-players.json` is an array keyed by
  name. All three are commented JSON that the server rewrites entry by entry.
- The login verifier gives `xuid`, `displayName` and the chain's `identity` UUID. The offline
  provider makes a stand-in UUID from the name, since an offline player has no XUID.
- BDS's own `permissions.json` keys players by XUID, as do its player storage keys.
- The host has a file `Watcher`, which the config reload uses.
- The command level a client receives decides which commands it offers, so the level a group grants
  has to reach the client the way operator status does today.

## Shape

### Identity

`packages/prismarine/src/identity/` holds the subject type and nothing else:

```ts
type Subject =
    | { kind: 'xbox'; xuid: string }
    | { kind: 'java'; uuid: string }
    | { kind: 'offline'; name: string };
```

`PlayerIdentity` gains a `subject`. A login with a verified chain gives `xbox`; one without gives
`offline`. The `java` kind has no producer until a Java transport exists, and is in the union now
so every switch already handles it. `subjectKey(subject)` gives the string a file section uses,
and `parseSubject(kind, key)` the reverse, so no other module spells the layout.

Nothing from an `offline` entry applies to an `xbox` or `java` subject of the same name.

### The model

```ts
interface Node {
    node: string; // `scope.name`, `scope.*`, or `-scope.name`
    expires?: string; // ISO 8601, absent for never
}

interface Group {
    weight: number;
    parents: string[];
    nodes: Node[];
    meta: Record<string, string>; // `prefix`, `suffix`, `level`, anything else
}

interface User {
    name: string; // last seen, display only
    groups: Array<{ group: string; expires?: string }>;
    nodes: Node[];
    meta: Record<string, string>;
    legacyUuid?: string; // from the migration, dropped at the next login
}
```

Resolution walks the user's nodes, then each group the user holds directly ordered by weight, and
each group's parents depth first. The first node that decides the query wins, where a specific
node decides before a wildcard at the same tier, and a negation decides before a grant at the same
specificity. Expired nodes and memberships are skipped and pruned on the next write. The primary
group is the heaviest group the user holds directly.

Meta resolves the same way: the user's own meta, then the groups in weight order, then parents.
`level` is read as a number from 0 to 4, and the subject's command level is the larger of it and 4
when the subject is an operator.

### The file

```json
{
    "schemaVersion": 2,
    "groups": {
        "default": { "weight": 0, "parents": [], "nodes": [{ "node": "minecraft.command.help" }], "meta": {} },
        "operator": { "weight": 100, "parents": [], "nodes": [{ "node": "*" }], "meta": {} }
    },
    "users": {
        "xbox": { "2535428842768200": { "name": "Steve", "groups": [{ "group": "vip" }], "nodes": [], "meta": {} } },
        "java": {},
        "offline": {}
    }
}
```

Operators hold `operator` implicitly, so `defaultOperatorPermissions` has a home without a second
mechanism. At startup, a file without `schemaVersion` migrates: `defaultPermissions` becomes the
`default` group's nodes, `defaultOperatorPermissions` becomes `operator`'s, and each `players`
entry becomes a user under `xbox` with its UUID kept as `legacyUuid` and no key yet. A user with
only a `legacyUuid` is filed under a `pending` list until a login with that UUID claims it, which
writes it under its real kind and drops the UUID. The old file stays beside the new one as
`permissions.json.bak`. `ops.json` and `banned-players.json` migrate the same way.

The server reloads the file on `/reload` and when the watcher sees it change. A write from a
command or a script goes through the same code path the config files use, so comments survive.

### Commands

`/perms` is a server command. Each subcommand has a node `jsprismarine.command.perms.<sub>`:

```text
/perms user <target> info
/perms user <target> permission set <node> [expires]
/perms user <target> permission unset <node>
/perms user <target> group add <group> [expires]
/perms user <target> group remove <group>
/perms user <target> meta set <key> <value>
/perms user <target> meta unset <key>
/perms group list
/perms group create <group>
/perms group delete <group>
/perms group <group> info
/perms group <group> permission set <node> [expires]
/perms group <group> permission unset <node>
/perms group <group> parent add <group>
/perms group <group> parent remove <group>
/perms group <group> weight <n>
/perms group <group> meta set <key> <value>
/perms group <group> meta unset <key>
/perms reload
```

`<target>` is an entity selector for online players or a name. A name resolves against the `name`
stored on each user. When it matches more than one kind, the command refuses and shows the
qualified forms it accepts, `xbox:Steve`, `java:Steve` or `offline:Steve`. The qualified form is
command syntax only and never appears in a file or an API.

### The script module

`permissions` in `@jsprismarine/server`:

| Member                              | What it is                                            |
| ----------------------------------- | ----------------------------------------------------- |
| `has(player, node)`                 | Whether the player holds the node after resolution.   |
| `groupsOf(player)`                  | The groups the player holds directly, heaviest first. |
| `primaryGroupOf(player)`            | The heaviest group, or `default`.                     |
| `metaOf(player, key)`               | The resolved meta value, or `undefined`.              |
| `grant(subject, node, expires?)`    | Adds a node to a player or a group named by string.   |
| `revoke(subject, node)`             | Removes it.                                           |
| `addToGroup(player, group, expires?)` | Adds a membership.                                  |
| `removeFromGroup(player, group)`    | Removes it.                                           |
| `afterEvents.permissionsChange`     | Fires after any write, with the subject it touched.   |

Writes persist like a command's do. The members take a `Player` and never expose a subject key;
a pack that needs one has no case yet.

The server registers a `perms` placeholder namespace with `primary_group`, `groups`, `prefix`,
`suffix` and `weight`, so the tab list and chat addons read a rank without an API call.

## Verification

- Unit tests for resolution: user over group, weight order, parent depth, wildcard against
  specific, negation ties, expiry, and `level` against operator status.
- Unit tests for the migration of each of the three files, including a `players` entry claimed at
  login and one never claimed.
- Command tests for every `/perms` subcommand, the ambiguous name refusal and the qualified form.
- The parity suite's `scripting.lifecycle` scenario records the new module members as
  `intentional`, like `performance` and `bossBars`.
- A test that switches over `Subject.kind` fails to compile when a kind is added without a case,
  which is the `never` check doing its job.

## Slices

1. [x] **The plan.** This document and its issues.
2. [ ] [#3367](https://github.com/JSPrismarine/JSPrismarine/issues/3367) **Subject identity.** The identity module and `Subject`, `PlayerIdentity.subject`, and
       `ops.json` and `banned-players.json` keyed by it with the legacy UUID claimed at login.
3. [ ] [#3368](https://github.com/JSPrismarine/JSPrismarine/issues/3368) **The model and the file.** Groups, users, nodes, meta and expiry; resolution; the new
       `permissions.json` with its migration; reload on `/reload` and on change; `can()` and the
       command level reading the new data.
4. [ ] [#3369](https://github.com/JSPrismarine/JSPrismarine/issues/3369) **The `/perms` command.** Every subcommand with its node, target resolution and the
       qualified form.
5. [ ] [#3370](https://github.com/JSPrismarine/JSPrismarine/issues/3370) **The script module.** `permissions` in `@jsprismarine/server` and `script-types`, the
       change event, and the `perms` placeholder namespace once slice 2 of the placeholders plan
       has landed.
6. [ ] [#3371](https://github.com/JSPrismarine/JSPrismarine/issues/3371) **Docs.** The permissions section of [Running](../guide/running.md), the
       [command reference](../guide/commands.md) and
       [the module page](../guide/jsprismarine-module.md), with their facts regenerated.

Slice 3 needs 2. Slice 4 needs 3. Slice 5 needs 3 and the placeholders registry. Slice 6 follows
each of them.

## Risks

- **Operators who never return.** A migrated entry waits under `pending` for a login that may
  never come. The file keeps it, and `/perms user` can neither read nor write it until then. The
  migration logs each pending entry once so an owner sees who is waiting.
- **Two files that agree on identity.** `ops.json` and `permissions.json` key the same players.
  A player who is in one and not the other is a normal state, since operator status and groups are
  separate, so nothing cross-checks them.

## Open questions

- Whether `/perms` should accept a bare XUID as a target for a player who has never joined, the
  way a BDS owner might add one from a gamertag lookup.
