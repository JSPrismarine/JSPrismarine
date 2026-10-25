# @jsprismarine/trading

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/trading)](https://www.npmjs.com/package/@jsprismarine/trading)

Bedrock trade tables: the economy and legacy grammars, offer generation, and the villager economy of
uses, demand, experience, levels, restock and discounts. It builds on `@jsprismarine/packs` for the
filter grammar, on `@jsprismarine/entities` for the filter evaluator that spawn rules, entity
definitions and trade tables all share, and on `@jsprismarine/predicates` for the injected random
source.

```typescript
import { Merchant, parseEconomyTradeTable, parseTradeTable } from '@jsprismarine/trading';
import { seededRandom } from '@jsprismarine/predicates';

const table = parseTradeTable(file.data, { pack: file.pack, path: file.path })!;
const settings = parseEconomyTradeTable(villager.componentParams('minecraft:economy_trade_table'));
const merchant = new Merchant({ table, settings, random: seededRandom(villagerSeed), enchanting });

merchant.offers({ heroOfTheVillage: 2 }); // what this player pays today
merchant.trade(0, { heroOfTheVillage: 2 });
merchant.resupply(); // what `minecraft:trade_resupply` asks for
```

## The two grammars

A file is `{"tiers": [...]}`, optionally with a `format_version`; 17 of the 27 vanilla files write
no version. `Trade Table.json` requires `groups` under a tier, and the documentation shows `trades`
directly under one, which is what 7 of the 13 legacy `trading/*.json` tables write. Both forms
parse, and a bare `trades` list becomes one group that selects all of its trades, so everything
downstream sees one shape.

```
tiers[] { total_exp_required, groups[] { num_to_select, trades[] {
    wants[], gives[], trader_exp, max_uses, reward_exp, weight } } }
```

A member of `wants` or `gives` is a `TradeItem` or `{choice: [TradeItem]}`, and a `TradeItem` is
`{item, quantity, price_multiplier, functions[], filters}`. Both forms become a `TradeItemSlot`
holding a list of choices, so a plain item is a choice of one. A `quantity` reads as a number, as
`{min, max}` or as `{max}` alone, which is the third shape vanilla writes.

`minecraft:economy_trade_table` and the legacy `minecraft:trade_table` parse here too, because the
discount fields the economy needs live on the component rather than in the table. Every vanilla
villager writes the ranges as two-member arrays rather than as `{min, max}`, and both read.

### Where the schema and the documentation disagree

The schema gives `max_uses` 7, `price_multiplier` 0 and `num_to_select` 0; the documentation pages
give 12, 0.05 and 1. This package takes the documentation's, because the documentation describes
the running engine and the schema describes an editor. Vanilla sets `max_uses` and
`price_multiplier` explicitly on almost every economy trade, so the choice only reaches custom packs
and the legacy tables.

## Offer generation

`generateOffers` follows the three rules the documentation states: "Tiers are unlocked by the
trading experience of the villager, not the player. The first tier in a list of trade tiers is
always available"; "once the trading system hits a tier that requires more experience points than
the trader has, subsequent tiers won't be checked"; and `num_to_select` is "the number of trades
from the `trades` array to make available".

1. Count the unlocked tiers. The first always counts, and the scan stops at the first requirement
   the trader has not met.
2. For each group of each unlocked tier, draw `num_to_select` trades without replacement, in
   proportion to their `weight`. A negative count offers the whole group, which is how 24 of the 130
   vanilla groups and every normalized legacy tier are written.
3. For each slot, keep the choices whose `filters` pass, draw one uniformly, and draw its quantity.
4. Run the item's functions.

Every draw goes through the injected `RandomSource`, so one seed gives one trader the same offers
every time.

## The trade item functions

| Function | What it does here |
| --- | --- |
| `exploration_map` | Writes `minecraft:exploration_map` with the destination. Locating the structure belongs to worldgen. |
| `set_potion` | Writes `minecraft:potion`. |
| `random_dye` | Writes `minecraft:dye_color`, drawn from the 16 vanilla dyes. |
| `random_aux_value` | Writes `minecraft:aux_value`, drawn inside `values`. |
| `random_block_state` | Writes one entry of `minecraft:block_states`. 1.26.51.1 moved the coral trades onto it. |
| `enchant_with_levels` | Draws the level inside `levels`, then asks the `TradeEnchanting` seam to enchant. |
| `enchant_book_for_trading` | Asks the seam for the enchantment and its level, then prices the trade. |

`enchant_book_for_trading` is the one vanilla function that sets a price. The librarian's book trade
writes an emerald want with no quantity, so the cost has to come from the function's four
parameters: `base_cost + random(0, base_random_cost + level * per_level_random_cost) + level *
per_level_cost`. That arithmetic lives here and the enchantment choice goes to the seam, so the
price is testable without the enchantment tables. The cost lands on the trade's first want, which is
the emerald side of every vanilla trade.

A function with no seam reports `trading.noEnchanter` and the trade still appears, so one missing
dependency does not empty a villager.

## The economy

Mojang names the fields and publishes none of the formulas. The documentation says
`price_multiplier` "sets how much the item's price can increase due to supply and demand changes",
`max_uses` is "how many times the trade can be made before the trader needs to restock",
`minecraft:trade_resupply` "Resupplies an entity's trade", and that `cured_discount`,
`nearby_cured_discount` and `hero_demand_discount` exist. The formulas, the restock schedule, the
gossip system and the mapping from `trader_exp` to a villager level are written down nowhere.

So `Merchant` uses Java Edition's model, which is the only published one, and names the three places
where it had to choose.

- **Levels come from the table.** A trader's level is how many tiers its experience has unlocked, so
  no separate experience-to-level mapping is needed. A level up appends the new tier's offers and
  leaves the earlier ones, with their uses, alone.
- **Demand moves at restock, not inside a stock cycle.** `resupply` runs Java's
  `demand = demand + uses - (maxUses - uses)`, clamped at zero, and then clears the uses. A trade
  sold out twelve times comes back at demand 12; a trade nobody touched falls back toward zero. The
  price is `base + floor(base * demand * price_multiplier)`.
- **The discount fields are flat deltas, not percentages.** `cured_discount` of -25 to -20 off an
  emerald price is what a cured villager actually charges, and `max_nearby_cured_discount` of -200
  only reads as a cap on a running total. Each `nearby_cured` villager adds `nearby_cured_discount`,
  Hero of the Village adds `hero_demand_discount` per level, the cured discount is drawn once so the
  price does not flicker, the discounts land on the first want alone, and no price falls below one
  item.
- **The player's reward is Java's 3 to 6.** Bedrock publishes no number. `playerRewardExp` replaces
  it.

## The injected seams

- `TradeContext` is the player and trader state. `filters` is the filter context a `TradeItem`'s
  `filters` reads, which vanilla uses for `in_overworld` and `is_mark_variant` on the cartographer's
  maps and the fisherman's fish. `heroOfTheVillage`, `curedByPlayer` and `nearbyCured` are the whole
  of what the discounts need.
- `TradeEnchanting` answers the two enchanting functions. Everything else a function needs is in its
  own body.
- `RandomSource` from `@jsprismarine/predicates` is the only source of randomness.
- `OfferGenerationOptions.functions` replaces the seven built-in functions outright.
- `report` receives every unknown function, missing seam, unanswered filter test and dropped trade.

## Measured coverage

Against bedrock-samples v1.26.50.4, which ships all 27 trade tables as text, through the corpus test
in `src/vanillaTradeTables.test.ts`:

| Measure | Result |
| --- | --- |
| Trade tables | 27: 14 economy and 13 legacy |
| Files that parse with no diagnostic | 27 |
| Tiers | 110 |
| Groups | 155, which is the 130 the files write plus one per legacy tier that holds its trades directly |
| Trades | 384 |
| Trade item functions used | 6, all implemented |
| Offers generated for a fully experienced trader across all 27 tables | 225 |

The test also runs the composed Bedrock Dedicated Server 1.26.51.1 tables when they are cached. BDS
ships 11 of the 27 as the undocumented `\x7fMCB` binary, which the test resolves through the
bedrock-samples copy of the same name, and its tables differ from 1.26.50.4 in content: the
wandering trader drops from 100 trades to 25, and the coral trades move from `random_aux_value` to
`random_block_state`. That pass checks that every file parses and every function is implemented
rather than pinning numbers that move with a patch release.

Both passes need the sources that `pnpm --filter @jsprismarine/bedrock-data run fetch:sources`
caches and run only with `JSP_VANILLA_TRADE_TABLES` set:

```sh
JSP_VANILLA_TRADE_TABLES=1 pnpm --filter @jsprismarine/trading exec vitest run src/vanillaTradeTables.test.ts
```

## What a later agent adds

- **The enchanting seam.** `TradeEnchanting` has no implementation here. `@jsprismarine/enchantments`
  owns the tables that answer it.
- **`convert_trades_economy`.** The legacy component asks the engine to regenerate a trader's offers
  against an economy table while keeping the same trades where it can. The field parses; the
  conversion does not run.
- **The restock schedule.** `resupply` is a method, and deciding when the villager's
  `minecraft:scheduler` fires `minecraft:resupply_trades` belongs to the entity runtime.
- **The gossip system.** `nearbyCured` is a number the host supplies. Nothing here tracks which
  villagers gossip about which player.
