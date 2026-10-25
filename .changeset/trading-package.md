---
'@jsprismarine/trading': patch
---

Add `@jsprismarine/trading`, the Bedrock trade table runtime. It parses both grammars, the economy
form the schema requires and the legacy form the documentation shows, by normalizing a tier's bare
`trades` list into one group that selects all of them. The item grammar reads a plain `TradeItem`
and a `{choice: [TradeItem]}` into one slot type, a `quantity` as a number, a `{min, max}` or a bare
`{max}`, and an item `filters` through the shared filter grammar of `@jsprismarine/packs`. Where the
schema and the documentation give different defaults for `max_uses`, `price_multiplier` and
`num_to_select`, the documentation's win, because it describes the running engine.
`minecraft:economy_trade_table` and `minecraft:trade_table` parse here too, including the
two-member arrays every vanilla villager writes where the documentation shows `{min, max}`.

`generateOffers` implements the three documented rules: the first tier is always available, the
scan stops at the first requirement the trader has not met, and each group draws `num_to_select`
trades without replacement in proportion to their weights. Seven trade item functions run, the six
bedrock-samples 1.26.50.4 uses plus the `random_block_state` BDS 1.26.51.1 moved the coral trades
onto; the two enchanting ones reach a `TradeEnchanting` seam and keep only their arithmetic here,
which is the `enchant_book_for_trading` cost formula that prices the librarian's book trade.

`Merchant` runs the economy: uses against `max_uses`, `resupply` for `minecraft:trade_resupply`,
`trader_exp` against each tier's `total_exp_required` so the level is simply the unlocked tier count,
`reward_exp` for the player, and the demand and discount prices. Mojang publishes no formula for
any of it, so the model is Java's and the README names the three readings this project chose:
demand moves at restock rather than inside a stock cycle, the discount fields are flat deltas on the
first want rather than percentages, and the player's reward is Java's 3 to 6 because Bedrock states
none. A `TradeContext` carries the player state the discounts need, and every draw goes through an
injected `RandomSource`, so one seed gives one trader the same offers every time.

A gated corpus test parses all 27 vanilla trade tables with zero diagnostics and pins the
measurements against bedrock-samples: 14 economy and 13 legacy tables, 110 tiers, 155 groups, 384
trades, 6 functions, and 225 offers generated across every table for a fully experienced trader. It
also runs the BDS 1.26.51.1 tables when cached, resolving the 11 `\x7fMCB` binary files through the
samples copy of the same name.
