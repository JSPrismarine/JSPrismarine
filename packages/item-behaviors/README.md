# @jsprismarine/item-behaviors

The vanilla item behavior families. `@jsprismarine/items` turns Java 26.3's 122 data component types
into parsed data and declares seven hooks; none of its components implements one. This package is
what fills them.

Two things are in here. The behavior families, which are `Behavior<ItemHooks>` objects the server
registers in one call. And the formulas Java computes in code rather than publishing as data: mining
speed, break progress, attack damage and Unbreaking, each transcribed from the unobfuscated 26.3
server jar and pinned to golden vectors the jar itself produced.

```typescript
import { BehaviorRegistry } from '@jsprismarine/content';
import { loadItemTypes } from '@jsprismarine/items';
import { deferredItemFactory, registerVanillaItemBehaviors } from '@jsprismarine/item-behaviors';

const behaviors = new BehaviorRegistry();
const items = deferredItemFactory();
registerVanillaItemBehaviors(behaviors, { world, items });

const { registry } = loadItemTypes({ behaviors });
items.bind(registry);
```

`world` is the server's `WorldActions`. `items` makes the stacks a behavior hands back, and it is
deferred because the registry does not exist until after the behaviors are registered.

## The families

The classifier in `families.ts` assigns every one of the 1658 Java items of the pinned registry to
exactly one family, or to `data only`. The counts below are measured, `families.test.ts` asserts each
one, and they sum to 1658. Run the classifier yourself with `classifyVanillaItems()`.

A family is recognized one of two ways. Where Java's data already says what the item is, the rule
names a component, and the behavior then attaches to every item and binds nothing where the component
is absent, so a pack's own food eats with no registration. Where neither edition publishes anything
to recognize the item by, the rule names identifiers, which is the list
[the behavior inventory](../../docs/research/engine-behavior-inventory.md) section 2 measured.

| Family                  | Items | Recognized by                        | Behaviors                                                                  |
| ----------------------- | ----: | ------------------------------------ | -------------------------------------------------------------------------- |
| bow                     |     1 | name                                 | `vanilla:bow`                                                              |
| crossbow                |     1 | name                                 | `vanilla:crossbow`                                                         |
| ammunition              |     3 | name                                 | none; a projectile's own behavior is the entity's                          |
| trident                 |     1 | name                                 | `vanilla:trident`, `vanilla:melee_weapon`                                  |
| mace                    |     1 | name                                 | `vanilla:mace`, `vanilla:melee_weapon`                                     |
| fishing rod             |     1 | name                                 | `vanilla:fishing_rod`                                                      |
| mob steering rod        |     2 | name                                 | `vanilla:steering_rod`                                                     |
| shears                  |     1 | name                                 | `vanilla:shears`, `vanilla:mining_tool`                                    |
| fire starter            |     2 | name                                 | `vanilla:fire_starter`                                                     |
| bone meal               |     1 | name                                 | `vanilla:bone_meal`                                                        |
| spyglass                |     1 | name                                 | `vanilla:spyglass`                                                         |
| compass                 |     2 | name                                 | `vanilla:compass`                                                          |
| clock                   |     1 | name                                 | none; `clockReading` is an entry point                                     |
| map                     |    18 | name                                 | `vanilla:map`                                                              |
| lead                    |     1 | name                                 | `vanilla:lead`                                                             |
| name tag                |     1 | name                                 | `vanilla:name_tag`                                                         |
| brush                   |     1 | name                                 | `vanilla:brush`                                                            |
| eye of ender            |     1 | name                                 | `vanilla:eye_of_ender`                                                     |
| bucket                  |     4 | name                                 | `vanilla:bucket`                                                           |
| throwable               |     9 | name                                 | `vanilla:throwable`                                                        |
| bottle and bowl         |     2 | name                                 | `vanilla:fillable`                                                         |
| waxing                  |     1 | name                                 | `vanilla:waxing`                                                           |
| sign ink                |     2 | name                                 | `vanilla:sign_ink`                                                         |
| written book            |     2 | name                                 | `vanilla:written_book`                                                     |
| entity placement        |    47 | name                                 | `vanilla:entity_placement`                                                 |
| mob bucket              |     7 | `minecraft:bucket_entity_data`       | `vanilla:mob_bucket`                                                       |
| shield                  |     1 | `minecraft:blocks_attacks`           | `vanilla:shield`                                                           |
| elytra                  |     1 | `minecraft:glider`                   | `vanilla:equippable`                                                       |
| totem                   |     1 | `minecraft:death_protection`         | none; `applyDeathProtection` is an entry point                             |
| spear                   |     7 | `minecraft:kinetic_weapon`           | `vanilla:spear`, `vanilla:melee_weapon`                                    |
| firework rocket         |     1 | `minecraft:fireworks`                | `vanilla:firework_rocket`                                                  |
| goat horn               |     1 | `minecraft:instrument`               | `vanilla:goat_horn`                                                        |
| writable book           |     1 | `minecraft:writable_book_content`    | `vanilla:writable_book`                                                    |
| enchanted book          |     1 | `minecraft:stored_enchantments`      | none; the anvil reads it                                                   |
| banner                  |    16 | `minecraft:banner_patterns` or name  | `vanilla:banner`                                                           |
| dye                     |    16 | `minecraft:dye`                      | `vanilla:dye`                                                              |
| bundle                  |    17 | `minecraft:bundle_contents`          | `vanilla:bundle`                                                           |
| spawn egg               |    88 | `minecraft:entity_data`              | `vanilla:spawn_egg`                                                        |
| potion                  |     1 | `minecraft:potion_contents`          | `vanilla:potion`, `vanilla:consumable`                                     |
| suspicious stew         |     1 | `minecraft:suspicious_stew_effects`  | `vanilla:suspicious_stew`, `vanilla:consumable`                            |
| ominous bottle          |     1 | `minecraft:ominous_bottle_amplifier` | `vanilla:ominous_bottle`, `vanilla:consumable`                             |
| block transforming tool |    21 | `minecraft:block_transformer`        | `vanilla:block_transformer`, `vanilla:mining_tool`, `vanilla:melee_weapon` |
| mining tool             |     7 | a `#minecraft:mineable/*` tool rule  | `vanilla:mining_tool`, `vanilla:melee_weapon`                              |
| melee weapon            |     7 | `minecraft:weapon`                   | `vanilla:melee_weapon`, `vanilla:mining_tool`                              |
| equippable              |    82 | `minecraft:equippable`               | `vanilla:equippable`                                                       |
| food                    |    39 | `minecraft:food`                     | `vanilla:consumable`                                                       |
| consumable              |     1 | `minecraft:consumable`               | `vanilla:consumable`                                                       |
| data only               |  1233 | nothing claimed it                   | none                                                                       |

Forty-seven families and one terminal bucket. Three things about the numbers are worth stating.

**`data only` is an answer, not a gap.** Most of its 1233 items are block items, and placing a block
is the block family's rule rather than the item's, so the item side is one shared behavior the blocks
package owns. The rest are plain materials with no use behavior in either edition: ingots, gems,
sherds, smithing templates, music discs, brewing ingredients.

**Classification and attachment are different questions.** A family says which behavior owns an item.
Attachment says what code runs for it, and more than one behavior runs for many items. A diamond axe
is classified `block transforming tool`, and three behaviors bind to it: the stripping transform, the
mining tool's durability and the melee weapon's.

**The 53 merged and excepted items carry no components.** The item table keeps one Java item's
properties per Bedrock identifier, so the fifteen other banner colors, the sixteen structure maps, the
tipped arrow and the knowledge book arrive with an empty component map. Those are classified by
identifier, which is why the banner and map rules name a pattern as well as a component.

## The world seam

Nothing here imports a server class. Every behavior reaches the world through `WorldActions`, which has
nine required queries and one `perform`. Two optional capability queries let a host decline an
entity action before the item is consumed:

```typescript
interface WorldActions {
    blockAt(position: BlockPosition): BlockReference | undefined;
    hardnessOf(block: BlockReference): number;
    stateOf(source: ItemSource): SourceState;
    environment(): EnvironmentState;
    targetOf(source: ItemSource): ItemSource | undefined;
    includes(set: HolderSet, member: string): boolean;
    transform(transformer: string, block: BlockReference): BlockPlacement | undefined;
    effectsOf(potion: string): readonly EffectApplication[];
    random(): number;
    canNameEntity?(target: ItemSource): boolean;
    canDyeEntity?(target: ItemSource, color: string): boolean;
    perform(action: ItemWorldAction): void;
}
```

Effects go through one tagged union of 28 variants rather than 28 methods, so adding an effect is a
new variant and not a change every adapter has to grow. The variants cover placing and breaking a
block, spawning an entity, launching a projectile, sounds, effects, damage, teleports, experience,
cooldowns, durability, giving and equipping items, naming, leashing, dyeing, shearing, fertilizing,
igniting, brushing, blocking, maps, locating and opening a screen.

`createTestWorld` is the typed double, exported rather than kept in the test folder because this is
the only interface a behavior has to the world. Every query is a value a test sets, every action lands
in an ordered log, and `random` is a fixed sequence so an Unbreaking roll is reproducible.

```typescript
const world = createTestWorld({ state: { foodLevel: 10 } });
consume(appleStack);
world.performed('feed'); // [{ kind: 'feed', target, nutrition: 4, saturation: 2.4 }]
```

Three decisions about the seam are worth knowing.

**There is no entity-interaction hook.** `ItemHooks` has `onUse` and `onUseOn`, and Mojang's
`ItemCustomComponent` has no entity hook either. A behavior that acts on an entity, which is the name
tag, the lead, the dye, the saddle and the shears, calls `targetOf(source)` and declines when there is
nothing there.

**A release is reported as `onCompleteUse`.** The bow, the crossbow and the trident fire on release
and the hook table has no release hook. The engine calls `onCompleteUse` when a held use ends for any
reason, and `useDuration` carries how long it was held, which is the bow's whole power curve.

**Four behaviors are server entry points rather than hooks.** A mining speed is a number the engine
asks for while a block breaks, a totem fires on the damage path, a gliding elytra wears out on a tick,
and a shield's durability cost happens while damage resolves. None of the seven hooks covers those, so
they are exported functions, each listed in the family catalog's `entryPoints` and checked by
`registry.test.ts`.

## The formulas

Every formula here is transcribed from the pinned, unobfuscated 26.3 server jar, and the JSDoc on each
one quotes the Java it came from. `utils/oracle/DumpItemFormulas.java` compiles against that jar and
writes `vectors/formulas.json`, which is 1665 cases the test suite checks exactly. All the arithmetic
runs through `Math.fround`, because Java computes these in `float` and the difference shows: `0.2F` is
not `0.2`, and a speed rounded twice in `float` is not a speed rounded once in `double`.

### Mining speed

`Player.getDestroySpeed(BlockState)`, line for line:

```java
float speed = this.inventory.getSelectedItem().getDestroySpeed(state);
if (speed > 1.0F) speed += (float)this.getAttributeValue(Attributes.MINING_EFFICIENCY);
if (MobEffectUtil.hasDigSpeed(this)) speed *= 1.0F + (MobEffectUtil.getDigSpeedAmplification(this) + 1) * 0.2F;
if (this.hasEffect(MobEffects.MINING_FATIGUE)) speed *= (float)Math.pow(0.3, amplifier + 1);
speed *= (float)this.getAttributeValue(Attributes.BLOCK_BREAK_SPEED);
if (this.isEyeInFluid(FluidTags.WATER)) speed *= (float)...SUBMERGED_MINING_SPEED...;
if (!this.onGround()) speed /= 5.0F;
```

The tool's own speed is `Tool.getMiningSpeed`: the first rule whose block set matches and that carries
a speed wins, and the default applies when none does. Tool tier is not a constant anywhere in this
package, because 26.3 expresses it entirely in that rule list. A diamond pickaxe carries
`#minecraft:incorrect_for_diamond_tool` with `correct_for_drops: false` and
`#minecraft:mineable/pickaxe` at speed 8, and that is the whole tier.

The attribute defaults come from `Attributes`: `mining_efficiency` 0, `block_break_speed` 1,
`submerged_mining_speed` 0.2. Efficiency raises the first by `level * level + 1`, from
`efficiency.json`'s `levels_squared` with `added: 1.0`. Aqua Affinity multiplies the third by five,
from `aqua_affinity.json`'s `add_multiplied_total` with `base: 4.0`, which takes 0.2 to 1 and removes
the underwater penalty outright.

`destroyProgress` is `BlockBehaviour.getDestroyProgress`: the speed over the block's hardness over 30
when the tool is correct for drops and 100 when it is not. `breakTicks` turns that into the whole
break, which is 150 ticks for stone with a bare hand and 23 with a wooden pickaxe.

### The Bedrock client computes a different number, and the server cannot fix it

This matters enough to state plainly. The Bedrock client decides how long a block takes to break, and
`server-authoritative-block-breaking` does not change that. Mojang's own guide says the toggle makes
the client report its prediction and the server agree or correct, not accept a timing from the server
("When the client predicts a block is broken, it notifies the server of this prediction with a
PlayerBlockAction [...] the server validates that it agrees with the client's prediction").

The two formulas disagree in at least four places, measured in
[the edition differences note](../../docs/research/edition-behavior-differences.md) section 2:

- Haste adds 20% per level in Java. Bedrock multiplies by `(0.2 × level + 1) × 1.2^level`.
- Mining Fatigue is `0.3^(amplifier + 1)` in 26.3's code. Bedrock uses `0.3^level × 0.7^level`.
- Java's `mining_efficiency`, `block_break_speed` and `submerged_mining_speed` have no Bedrock
  attribute to send them in, which is Geyser issue
  [#3987](https://github.com/GeyserMC/Geyser/issues/3987), closed as `Can't Fix`.
- Reach differs: 4.5 blocks in Java and 5 on Bedrock with a keyboard, 12 on touch in creative.

A server that uses Java's number disagrees with the client on every enchanted or hasted break, and the
player sees blocks pop back. So `miningSpeed` is the server's figure, for drops, progress validation
and anything else the server decides, and the client's own timing is left alone. That is the plan's
rule for a client-decided behavior: do not send a correction for something the client owns.

### Attack damage

The damage half of `Player.attack`:

```java
float magicBoost = attackStrengthScale * (this.getEnchantedDamage(...) - baseDamage);
baseDamage *= 0.2F + attackStrengthScale * attackStrengthScale * 0.8F;
baseDamage += attackingItemStack.getItem().getAttackDamageBonus(...);
if (criticalAttack) baseDamage *= 1.5F;
float totalDamage = baseDamage + magicBoost;
```

`baseAttackDamage` is the player's own 1 plus the item's `minecraft:base_attack_damage` modifier, so a
diamond sword is 7 and a diamond axe is 9. The enchantment bonus scales linearly with the charge while
the base scales quadratically, which is why a half-charged sharpened sword keeps most of its
enchantment damage and almost none of its own.

`attackStrengthScale` defaults to 1, a fully charged swing. That is this project's choice for the
attack cooldown, and it follows
[the plan](../../docs/plans/data-driven-vanilla.md) section 12 decision 2: the Bedrock client draws no
cooldown meter and plays the strong-attack sound for every connecting hit, so scaling damage by time
since the last swing produces hits that deal 20% for no reason the player can see. The parameter is
there, and `attackStrengthScale(ticks, attackSpeed)` computes it from
`Player.getCurrentItemAttackStrengthDelay`, so a server that wants Java's rule passes it.

The mace's bonus arrives through `itemBonus` and is `MaceItem.getAttackDamageBonus`: `4 × fall` up to
3 blocks, `12 + 2 × (fall - 3)` up to 8, and `22 + fall - 8` above that, with no smash at all below
1.5 blocks.

### Durability and Unbreaking

`spendDurability` is `ItemStack.hurtAndBreak` through `processDurabilityChange` and `applyDamage`. A
stack takes damage only when it has `minecraft:max_damage` and `minecraft:damage` and no
`minecraft:unbreakable`, and a holder with infinite materials spends nothing.

Unbreaking is `RemoveBinomial.process`: one roll per point of damage against a chance of
`level / (level + 1)` for anything that is not armor and `2 × level / (5 × level + 5)` for armor, both
read off `unbreaking.json`. Java truncates the result to an `int` and skips the whole path when it
lands on zero, so an Unbreaking III pickaxe spends nothing three times out of four. Java switches to a
normal approximation above 128 points in one hit, which no item use produces, so only the exact branch
is implemented.

## Consumables

One behavior covers the 47 items carrying `minecraft:food` or `minecraft:consumable`, because Java
26.3 already says what each one does.
`minecraft:food` gives nutrition and saturation, `minecraft:use_remainder` gives the bowl or bottle
left behind, `minecraft:use_cooldown` gives the chorus fruit's second, and
`minecraft:consumable.on_consume_effects` gives the rest. The golden apple, the pufferfish, milk and
the honey bottle need no code of their own.

That list is the one place the item package deliberately stops parsing. Its schema keeps the
discriminator of each consume effect and drops the payload, because the five effect types belong to
whoever runs them. `consumeEffects.ts` parses the payload once per item type from the definition's own
JSON, which `BindContext` hands a behavior at load, and implements the five: `apply_effects`,
`remove_effects`, `clear_all_effects`, `teleport_randomly` and `play_sound`.

Three consumables need code because their effects are not in the component that names them. A potion's
are in a registry Java keeps in code, in `Potions`, so `WorldActions.effectsOf` answers for them. A
suspicious stew's were decided by the flower it was crafted with and live on the stack. An ominous
bottle's amplifier is a number that has to become 100 minutes of Bad Omen. All three run before the
general behavior and return undefined, so the dispatch reaches the one that produces the result.
`HookTable.dispatchFirst` stops at the first handler that returns a value, which is why
`VANILLA_ITEM_BEHAVIORS` is an ordered list and `registry.test.ts` holds the order.

## Tests

`vitest run` covers 129 cases over four files. `behaviors.test.ts` builds the real vanilla registry
with every behavior attached and dispatches through each item type's own `HookTable`, so the
attachment rules and the dispatch order are under test and not only the handlers.
`families.test.ts` asserts the partition is total and that every family holds the count above.
`formulas.test.ts` checks all 1665 oracle vectors.

## Regenerating the oracle vectors

`vectors/formulas.json` is generated and committed. After a Java version bump:

```sh
pnpm --filter @jsprismarine/bedrock-data run dump:java
node packages/item-behaviors/utils/oracle/run.mjs
```

The dumper compiles against the pinned server jar and needs a JDK of at least version 25 (`JAVA_HOME`
or `JSP_JAVA_HOME`). It runs with its working directory inside the cache, because Mojang's logger
writes a `logs/` directory wherever it starts.
