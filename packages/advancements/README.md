# @jsprismarine/advancements

The Java Edition advancement engine. It parses advancement files once, links them into the parent
tree, routes game events to the criteria listening for them, keeps per-player progress, and fires
rewards through hooks a host supplies.

Conditions are not reimplemented here. Every entity, item, block, location, damage and fluid check
inside a criterion is a loot condition compiled by [`@jsprismarine/predicates`](../predicates),
which also owns 26.3's inline-or-id-or-list-or-tag composition rule. This package adds the 58
trigger types that the predicate package explicitly leaves out.

The grammar was read out of the Java 26.3 server jar: `minecraft:trigger_type` in
`reports/registries.json` for the 58 ids, and the `TriggerInstance` records under
`net/minecraft/advancements/triggers/` for each one's fields. Parsing never throws; faults land in a
`DiagnosticCollector` from the predicate package.

## Install

```bash
pnpm add @jsprismarine/advancements
```

## Using it

```typescript
import { AdvancementEngine, PlayerAdvancements, parseAdvancement } from '@jsprismarine/advancements';

const engine = new AdvancementEngine({
    rewards: {
        grantExperience: (player, amount) => player.addExperience(amount),
        unlockRecipe: (player, recipe) => player.recipeBook.unlock(recipe)
    }
});

engine.load(
    [...definitions.advancements].flatMap(([id, json]) => {
        const { value } = parseAdvancement(id, json, { resolver });
        return value ? [value] : [];
    })
);

const progress = new PlayerAdvancements();
const completed = engine.raise('placed_block', { player, origin, blockState, tool }, progress);
```

`definitions.advancements` is what [`@jsprismarine/packs`](../packs) produces for a pack stack: the
1866 vanilla advancement files plus whatever the loaded datapacks add. `resolver` is the same
`ReferenceResolver` the predicate package takes, and it is what lets a `#tag` inside a criterion or
in `rewards.loot` expand.

## The model

`parseAdvancement(id, json, options)` returns `{ value, diagnostics }`, with `value` undefined only
when the file has no usable criterion. The parsed shape follows the 26.3 file:

| Field | Shape | Default |
| --- | --- | --- |
| `parent` | namespaced id | absent, which makes the advancement a root |
| `display` | `icon`, `title`, `description`, `background`, `frame`, `showToast`, `announceToChat`, `hidden` | absent; `frame` is `task`, the two announcement flags are true, `hidden` is false |
| `criteria` | map from name to a trigger id and its compiled conditions | required and non-empty |
| `requirements` | array of arrays of criterion names | one single-name group per criterion |
| `rewards` | `experience`, `lootTables`, `recipes`, `function` | all empty |
| `sendsTelemetryEvent` | boolean | false |

`requirements` is conjunctive normal form: every group must hold at least one completed criterion.
The default that Java's `AdvancementRequirements.allOf` produces is therefore an `and` over all
criteria, and a single-criterion file completes on that one criterion. Parsing reports a group that
names no criterion of the file, a criterion that appears in no group, and an empty group.

`buildAdvancementTree(advancements)` resolves each `parent` into an `AdvancementNode` with its
children. A parent that was not loaded reports and leaves the node a root. A parent chain that
closes on itself reports at the first node whose walk revisits an id and detaches that node, which
breaks the cycle and keeps the rest of the chain linked.

Titles and descriptions stay as parsed JSON. Turning a chat component into text belongs to the text
layer, and the engine never reads them.

## Triggers and coverage

All 58 registered types are implemented. Java spreads them over 29 `TriggerInstance` shapes, so the
ids that read the same JSON share one parser here as well. Counts below are criteria across the
1866 vanilla files, measured by `corpus.test.ts`.

| Trigger | Vanilla criteria | Event |
| --- | --- | --- |
| `inventory_changed` | 1914 | `InventoryEvent` |
| `recipe_unlocked` | 1739 | `RecipeEvent` |
| `player_killed_entity` | 89 | `KillEvent` |
| `location` | 67 | `PlayerEvent` |
| `consume_item` | 41 | `ItemEvent` |
| `recipe_crafted` | 27 | `RecipeCraftedEvent` |
| `bred_animals` | 27 | `BredAnimalsEvent` |
| `tame_animal` | 21 | `EntityEvent` |
| `placed_block` | 15 | `ItemUsedOnBlockEvent` |
| `enter_block` | 12 | `BlockEvent` |
| `item_used_on_block` | 10 | `ItemUsedOnBlockEvent` |
| `player_generates_container_loot` | 10 | `ContainerLootEvent` |
| `player_interacted_with_entity` | 8 | `PlayerInteractEvent` |
| `filled_bucket` | 6 | `ItemEvent` |
| `changed_dimension` | 4 | `ChangedDimensionEvent` |
| `fishing_rod_hooked` | 4 | `FishingRodHookedEvent` |
| `using_item`, `summoned_entity`, `player_hurt_entity`, `killed_by_arrow`, `effects_changed` | 3 each | see `events.ts` |
| `villager_trade`, `thrown_item_picked_up_by_entity`, `construct_beacon` | 2 each | |
| 30 further triggers | 1 each | |
| `used_ender_eye`, `voluntary_exile`, `default_block_use`, `any_block_use` | 0 | implemented, unused by vanilla |

54 of the 58 appear in vanilla and 30 of those appear exactly once. The four with no vanilla
criterion are implemented anyway, because a datapack can use them.

Three triggers need a note.

**`inventory_changed` splits on how many item predicates it holds.** Java tests a single predicate
against the stack that changed and a list of several against the whole inventory, removing each
predicate as a stack satisfies it. 1913 of the 1914 vanilla criteria take the single-predicate path,
so `InventoryEvent` carries both `inventory` and `changed`. The `slots` counts are computed only
when a criterion declares the field, which one vanilla criterion does.

**`killed_by_arrow` needs a distinct victim per condition, `channeled_lightning` does not.** Java
removes a matched victim from the list in the first and not in the second, and the two behave
differently when two conditions could match the same entity.

**`brewed_potion`'s `potion` field is a `PotionsPredicate`**, which is 26.3's
`minecraft:potion_contents` data component predicate. Rather than fork the component grammar, this
package wraps the field into an item predicate and evaluates it against the brewed stack. The
predicate package does not implement `potion_contents` yet, so such a field warns and evaluates
false. No vanilla advancement writes it.

## The event bus seam

`engine.raise(trigger, event, progress)` is the whole seam. `TriggerEvents` maps each trigger id to
the event shape it listens for, so passing a `BlockEvent` to `placed_block` is a compile error. The
engine builds the loot context each condition needs: `advancement_entity` for the `player` field and
every other entity field, `advancement_location` for the `location` field of the `placed_block`
family, and `block_use` for `default_block_use` and `any_block_use`.

Criteria are indexed by trigger, so an event touches only the criteria registered under it. The four
triggers whose event names one registry element are indexed by that element as well:

| Trigger | Indexed by |
| --- | --- |
| `recipe_unlocked` | each id in `recipes` |
| `recipe_crafted` | each id in `recipes` |
| `crafter_recipe_crafted` | each id in `recipes` |
| `player_generates_container_loot` | each id in `loot_tables` |

The number that decides the cost is how many criteria one event evaluates, and `engine.test.ts`
asserts it by counting draws from an injected random source. Against the whole vanilla corpus of
1866 advancements and 4045 criteria:

- `recipe_unlocked` evaluates 1 criterion, not the 1739 that use the trigger. Raising all 1739
  unlocks takes 8 to 30 ms on an Apple silicon laptop under Node 24, so 5 to 17 us per event.
- `inventory_changed` evaluates all 1914 criteria in its bucket, because no field of that trigger
  names a registry element to key on. One event takes 280 to 1140 us on the same machine, so
  roughly 0.15 to 0.6 us per criterion. This is the engine's worst dispatch.

Both wall-clock ranges come from repeated runs on a machine that was also building other packages,
which is where the spread comes from; the criterion counts are exact.

Within one `raise` the engine builds each entity's predicate context once and reuses it, which is
what keeps the per-criterion cost of the big bucket under a microsecond.

## Progress

`PlayerAdvancements` is the per-player store. The engine takes one as an argument rather than owning
it, so a server keeps progress wherever it keeps the rest of a player's data.

```typescript
progress.grant('minecraft:story/mine_stone', 'get_stone');
progress.hasCriterion('minecraft:story/mine_stone', 'get_stone'); // true
progress.isDone(engine.get('minecraft:story/mine_stone')!); // true
progress.revokeCriterion('minecraft:story/mine_stone', 'get_stone');
progress.revoke('minecraft:story/mine_stone');
```

`toJSON` produces a plain object a server can persist as is, and `fromJSON` reads it back:

```json
{
    "minecraft:story/mine_stone": {
        "criteria": { "get_stone": "2026-10-25T09:14:02.511Z" },
        "done": true
    }
}
```

Instants are ISO-8601 rather than Java's `yyyy-MM-dd HH:mm:ss Z`, because nothing here reads a Java
player data file and `Date.parse` round-trips ISO-8601 without a format string. `grant` takes an
explicit instant, so a test or a migration decides its own clock.

`fromJSON` ignores the stored `done` flag and recomputes completion from the advancement's current
`requirements`. A datapack reload that changes `requirements` therefore re-derives whether a player
has finished, instead of trusting a flag written against the old matrix.

## Reward hooks

Every hook is optional, and a reward with no hook reports a warning instead of failing the
completion, so a server can ship advancements before it has every subsystem.

```typescript
new AdvancementEngine({
    rewards: {
        grantExperience: (player, amount) => {},
        runLootTable: (player, lootTable) => {},
        unlockRecipe: (player, recipe) => {},
        runFunction: (player, id) => {}
    }
});
```

`runFunction` is the seam [`@jsprismarine/mcfunction`](../mcfunction) fills; nothing in this package
depends on it. Rewards fire once, when the advancement completes, from either `raise` or `award`.
Vanilla uses `recipes` on 1739 files and `experience` on 23, and uses neither `loot` nor `function`.

## Corpus test

`corpus.test.ts` parses the real Java 26.3 vanilla advancements out of the cached server jar and
asserts the grammar reports nothing, neither errors nor warnings. It measures 1866 files, 4045
criteria, 54 used triggers, 6 roots and no parent cycle, and it pins the per-trigger counts in the
table above. It needs the cache that
`pnpm --filter @jsprismarine/bedrock-data run fetch:sources` populates, so it only runs with
`JSP_VANILLA_DATAPACK` set and CI without the cache skips it.

## License

MIT
