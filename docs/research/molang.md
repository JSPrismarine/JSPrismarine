# Molang: the language, what vanilla uses server-side, and how to implement it in TypeScript

Scope: Mojang's Molang specification, the subset the vanilla Bedrock behavior pack uses on the server, the semantics an evaluator must match, how entity filters differ, a review of existing implementations, and design input for a TypeScript evaluator. Researched 2026-10-24 against MicrosoftDocs/minecraft-creator at `4432fb62a8e0ce5c785bd2bf02a6f981dcffbbe8` (synced 2026-10-20), Mojang's engine-generated `documentation/Molang.html` in Mojang/bedrock-samples tag `v1.26.50.4` (`46ba6ea985fb5a92d79a9419198f10dda14c199d`), the BDS 1.26.51.1 behavior packs and `definitions/` described in [bedrock-data-extraction.md](bedrock-data-extraction.md), and the source of the implementations in section 5 at pinned commits. Every claim names the source that owns it. Nothing in this note was executed from the third-party libraries; their behavior is read from source.

## Summary

- Two Mojang texts describe the language. The Learn pages (`creator/Documents/molang/syntax-guide.md`, `MolangReference/.../QueryFunctions.md`, `MathFunctions.md`) are the maintained reference; the engine-generated `documentation/Molang.html` in bedrock-samples is the only one with the operator precedence table and lists 13 more queries (deprecated or internal ones the Learn pages dropped).
- Molang is case-insensitive except inside strings. Every value is a float; booleans are 0.0 and 1.0; errors (division by zero, missing variables, null references) evaluate to 0.0 and raise a content error in development builds. Strings support only `==` and `!=`.
- The vanilla behavior pack composed from the 56 BDS layers plus the server-root `definitions/` contains 537 Molang strings (82 distinct expressions) in 331 files. They use 35 distinct identifiers: 21 `query.*`, 7 `math.*`, 6 `variable.*`, 1 `context.*`. Loot tables, trade tables, spawn rules and recipes contain none.
- Every server-side vanilla expression is a single statement. None uses `;`, `return`, `loop`, `for_each`, `??`, `temp.`, arrays or structs. One pattern uses `->` (`context.other->query.remaining_durability` in the seven spear items) and one uses `this` (`query.anger_level(this)` in the warden).
- Feature rules and features hold 342 of the 537 strings: `query.heightmap`, `query.above_top_solid`, `query.noise`, `query.has_biome_tag`, `query.any_tag`, `math.random`, and the engine-supplied `variable.worldx`, `worldz`, `originx`, `originz`, `is_legacy`. The docs say `x`, `y` and `z` are "evaluated each iteration" and `scatter_chance` once.
- Of the 306 queries on the Learn index, vanilla parity needs 21 server-side today. 66 are render or client-session queries. Mojang labels four as server side only (`anger_level`, `scoreboard`, `server_memory_tier`, `had_component_group`) and 13 as client only.
- Precedence rules are versioned by the containing pack's `min_engine_version`: ternary associativity changed at 1.18.10, `&&` over `||` and comparison over equality at 1.18.20. 39 vanilla expressions live in layers older than 1.18.20, all of them single-operator; the five expressions that mix `&&`, `||` or nest `?:` are fully parenthesized, so both rule sets agree on vanilla.
- Filters (`test`, `subject`, `operator`, `value`, `all_of`, `any_of`, `none_of`) are a separate JSON predicate system with 108 documented tests. Filters never contain Molang and Molang never contains filters. Entity properties are where they meet: Molang writes them through `set_property`, and both systems read them.
- Neither JavaScript library should be a dependency. Both bridge-core/molang (TypeScript, MIT) and JannisX11/molangjs (JavaScript, MIT) bind `||` tighter than `&&`, which is the pre-1.18.20 rule; bridge-core also misnames `math.lerprotate`, lacks `math.sign`, `copy_sign`, `inverse_lerp` and the 30 easing functions, and loops forever in `math.die_roll`; molangjs lowercases string contents, strips whitespace inside strings, and has no `->`, `for_each`, arrays or structs. Neither has a version switch.
- Write a small package: Pratt parser, AST compiled once at pack load into closures over a typed scope, a query registry with declared contexts (entity, block, item, placement, world), unknown identifiers reported at load and evaluated as 0.0 at run time as vanilla does, and a version selected from the pack manifest.

## 1. The Molang specification

### Sources

| Source | Pin | What it contributes |
|---|---|---|
| `creator/Documents/molang/syntax-guide.md` (Learn: molang/syntax-guide) | commit `4432fb62`, `ms.date` 08/13/2025 | Keywords, values, variables, aliases, structs, strings, scopes, conditionals, `loop`, `break`, `continue`, `??`, versioned changes. No precedence table. |
| `creator/Documents/molang/introduction.md`, `practical-molang.md` | same | Tutorials; the only Learn text on render-controller arrays. |
| `creator/Reference/Content/MolangReference/Examples/MolangConcepts/QueryFunctions.md` plus 306 subpages | same, `ms.date` 02/11/2025 | Query index with one-line meanings; subpages add format-version notes. |
| `.../MathFunctions.md` plus 61 subpages | same | Math function index. |
| `documentation/Molang.html` in Mojang/bedrock-samples | `v1.26.50.4` | Engine-generated. Has "Operator Precedence", `->`, `for_each`, render-controller arrays, 319 queries with "Available on the Server only" or "Client (Resource Packs) only" labels, and a versioned-changes row for 1.21.100 the Learn page lacks. |
| `creator/Documents/IntroductionToEntityProperties.md` | same commit | Molang in property defaults and `set_property`, range clamping, deferred application, `query.property` errors. |

bedrock.dev republishes the generated HTML (arexon/nolana's README links `bedrock.dev/docs/stable/Molang`); this note reads the bedrock-samples copy, which Mojang publishes.

### Lexical structure

From `Molang.html` "Lexical Structure" and the syntax guide: C-like syntax; an expression is one value or calculation, or several sub-expressions. A simple expression has no `;` and returns its value. A complex expression terminates every statement with `;`, including the last, and "evaluates to `0.0` unless there is a `return` statement". The syntax guide: "If you leave off the `return` statement, the return value will be `0.0`". bridge-core's test file records the consequence: `return 1` without `;` evaluates to 0 and `return 1;` to 1 ("Your typical Minecraft quirk", `__tests__/tests.ts` line 17).

"All things in Molang are case-insensitive, with the exception of strings, which maintain the case provided." Vanilla relies on this: `Math.Random(1,3)`, `Math.Min(...)` and `Math.die_roll(...)` appear in entity files next to lowercase `math.clamp`. Number literals accept a trailing `f` (`0.5f`), shown in bridge-core's and molangjs's tests and in vanilla's `query.main_hand_item_use_duration > 0.0f` (attachables, client side).

### Keywords

The syntax guide: "All identifiers not in a scope listed below are reserved for future use."

| Keyword | Meaning (Mojang's wording, shortened) |
|---|---|
| `1.23` | Numerical constant |
| `! \|\| && < <= >= > == !=` | Logical operators |
| `* / + -` | Basic math operators |
| `( )` | Evaluation order |
| `{ }` | Execution scope |
| `??` | Null coalescing, "for handling missing variables or stale actor references" |
| `geometry.`, `material.`, `texture.` | References to resources named in the client entity definition |
| `math.` | Math functions |
| `query.` | "Access to an entity's properties" |
| `variable.` | Read/write storage on an actor |
| `temp.` | Read/write temporary storage |
| `context.` | Read-only storage "provided by the game in certain scenarios" |
| `A ? B` | Binary conditional |
| `A ? B : C` | Ternary conditional |
| `this` | "The current value that this expression will ultimately write to (context specific)" |
| `return` | Evaluate the following statement, stop, return it |
| `->` | Arrow operator, "for accessing data from a different entity" |
| `loop`, `for_each`, `break`, `continue` | Loops |
| `[ ]` | Array access |

Aliases: `c.` for `context.`, `q.` for `query.`, `t.` for `temp.`, `v.` for `variable.`; "left and right sides function identically" and may be mixed in one expression.

### Operator precedence

Reproduced from `Molang.html` "Operator Precedence": "Operators that are higher in this table are evaluated first, while operators on the same row are evaluated with the same priority. When operators have the same priority, they are evaluated left-to-right, except for the Ternary conditional operator, which is evaluated right-to-left. ... This should match the behavior of C or C++."

| Rank | Group | Operators | Note |
|---|---|---|---|
| 1 (highest) | Logical not | `!` | |
| 2 | Multiplication and division | `*` `/` | |
| 3 | Addition and subtraction | `+` `-` | |
| 4 | Comparisons | `<` `<=` `>` `>=` | Versioned (1.18.20) |
| 5 | Equality | `==` `!=` | Versioned (1.18.20) |
| 6 | Logical and | `&&` | Versioned (1.18.20) |
| 7 | Logical or | `\|\|` | Versioned (1.18.20) |
| 8 | Ternary conditional | `? :` | Right to left; versioned (1.18.10) |
| 9 (lowest) | Null coalescing | `??` | |

The table omits unary minus, assignment `=`, function call, `->` and `[ ]`. The docs give no rank for them; the only statement is C/C++ likeness. Section 6 proposes the ranks an implementation should use.

### Values

From `Molang.html` "Values" and the syntax guide: "All numerical values are floats." Booleans "are converted and stored as a float value of either 0.0 or 1.0". "For boolean tests, a float value equivalent to 0.0 is false, and anything not equal to 0.0 is true." "For array indices, floats are C-style-cast to ints, and clamped at zero for negative values or wrapped by the array size for large values." "Errors (such as divide by zero, missing variables, null references, etc) generally return a value of 0.0." Other types: Geometry, Texture, Material, Actor Reference, Actor Reference Array, String, Struct.

### Variables

Three lifetimes (syntax guide "Variables"):

- `temp.`: "valid for the scope they are defined in, as per C rules. For performance reasons their lifetime is global to the current expression execution and may return a valid value outside of the outermost scope they are defined in".
- `variable.`: "store their value on the entity for the lifetime of that entity. Note that these are currently not saved, so quitting and reloading the world will re-initialize these."
- `context.`: "read-only, defined by Minecraft itself rather than your code, and valid for the expression they are run on. Details on what variables are in each will be available in the documentation of the area where that Molang expression exists".

Public variables: another entity may read a variable only if the owning client entity definition lists it under `scripts.variables` as `"public"`. This is a resource-pack feature.

### Structs, strings, this

Structs "are implicitly defined by usage" (`v.location.x = 1;`), nest arbitrarily, and can be copied across `->`. Strings use single quotes, cannot contain `'` ("no support for escape characters"), and "String operations only support `==` and `!=` at this time". `this` is the value the expression writes to; vanilla's server-side use is `query.anger_level(this)`, where `this` is the entity.

### Conditionals, scopes and loops

`A ? B` runs B only when A is true; `A ? B : C` returns B or C. `{ }` groups statements. `loop(count, expression)`: "The maximum loop counter is 1024 for safety reasons." `for_each(variable, array, expression)` iterates an actor array such as the result of `query.get_nearby_entities` (the HTML example; that query is not on either index, so it is an undocumented or removed query). `break` "exits the innermost active loop"; `continue` "skips to the next iteration", "currently supported in `loop` and `for_each`".

### Arrow and null coalescing

`->` (HTML "Arrow Operator"): "in the case where the left-hand side of the `->` operator has an error (value is null, the entity was killed previously, or some other issue), the expression will not evaluate the right-hand side and will return 0."

`??` (syntax guide): "Normally, if your Molang expression references a variable that hasn't been defined yet, your code will stop with a content error." `a ?? b` returns `a` if it resolves, else `b`; it works for `variable.`, `temp.` and `context.` holding numbers or entity references "but not resources such as materials, textures, or geometries". "The standing rule of thumb in Molang is that if something would error or be a bad value, it is converted to `0.0`, and generally throws a content error on screen in non-published builds."

### Arrays and resources

Render controllers declare `array.name` lists of textures, materials or geometries and index them with `index = max(0, expression_result) % array_size` (HTML "Array Expressions"). Resource expressions must return one resource of the right type. Animations and animation controllers "have access to everything in the language except material, texture, and geometry types". All of this is client only; the server never sees `geometry.`, `material.`, `texture.` or `array.`.

### Math functions

61 functions, identical lists in `MathFunctions.md` and `Molang.html` (diffed). Descriptions are Mojang's; "Doc gap" marks what neither text specifies.

| Function | Mojang's semantics | Doc gap |
|---|---|---|
| `math.abs(v)` | Absolute value | |
| `math.acos(v)`, `math.asin(v)`, `math.atan(v)` | Inverse trig | Result unit not stated; `sin`/`cos` take degrees, so degrees is the consistent reading. Both JS libraries return degrees. |
| `math.atan2(y, x)` | "arctan of y/x. NOTE: the order of arguments!" | Unit as above |
| `math.ceil(v)`, `math.floor(v)` | Round up / down to nearest integral | |
| `math.clamp(v, min, max)` | Clamp inclusive | Behavior when min > max |
| `math.copy_sign(A, B)` | A with the sign of B | Sign of zero |
| `math.cos(v)`, `math.sin(v)` | "Cosine (in degrees) of value", "Sine (in degrees) of value" | |
| `math.die_roll(num, low, high)` | Sum of `num` random floats in [low, high]; "not integers like normal dice" | Rounding of a fractional `num`; vanilla passes `query.equipment_count`, an integer |
| `math.die_roll_integer(num, low, high)` | Sum of `num` random integers in [low, high] | |
| `math.exp(v)` | e to the power v | |
| `math.hermite_blend(t)` | `3t^2 - 2t^3`; "works best in the range [0, 1]" | |
| `math.inverse_lerp(start, end, v)` | Normalized progress of v between start and end | Format version 1.21.120 or later |
| `math.lerp(a, b, t)` | `a + (b - a) * t` with t "in the range [0, 1]" | Whether t is clamped (bridge-core clamps, molangjs does not) |
| `math.lerprotate(a, b, t)` | Interpolate "around a circle in the shortest direction from a degrees to b degrees" | |
| `math.ln(v)` | Natural logarithm | |
| `math.max(A, B)`, `math.min(A, B)` | Highest / lowest of two | Only two arguments are documented |
| `math.min_angle(v)` | "Minimize angle magnitude (in degrees) into the range [-180, 180)" | |
| `math.mod(v, d)` | "Return the remainder of value / denominator" | Sign of the result for negative operands. C `fmod` keeps the dividend's sign; both JS libraries use `%`, which does the same. |
| `math.pi` | Float pi; takes no parentheses | |
| `math.pow(base, exp)` | base to the exp power | |
| `math.random(low, high)` | "Random value between low and high inclusive" | Seeding; the docs say nothing, so each evaluation draws fresh |
| `math.random_integer(low, high)` | "Random integer value between low and high inclusive" | Distribution of the endpoints (bridge-core rounds a float, which halves the odds of the endpoints; molangjs draws uniformly) |
| `math.round(v)` | Nearest integral | Half-way rounding |
| `math.sign(v)` | "Returns 1 if value is positive, -1 otherwise" | Zero returns -1 by this wording |
| `math.sqrt(v)` | Square root | |
| `math.trunc(v)` | Round toward zero | |
| `math.ease_in_*`, `math.ease_out_*`, `math.ease_in_out_*` for `back`, `bounce`, `circ`, `cubic`, `elastic`, `expo`, `quad`, `quart`, `quint`, `sine` (30 functions, `(start, end, 0_to_1)`) | Output goes from start to end along the named curve | Format version 1.21.120 or later; exact coefficients unstated. molangjs implements them from the common Penner formulas (`src/easing.js`). |

Vanilla server-side files use seven: `math.random` (116, nearly all as `Math.Random`), `math.ceil` (4), `math.clamp` (3), `math.die_roll` (3), `math.trunc` (3), `math.max` (1), `math.min` (1).

### Versioned changes

Syntax guide "Versioned changes": "Molang uses the `min_engine_version` from the manifest.json of the resource or behavior pack that contains each Molang expression to determine which version of the rules to apply. ... Molang change versions apply to each expression separately, so it's possible to have different versions active if multiple packs are loaded." Any change "with a version less than or equal to that version number will be in effect."

| Pack `min_engine_version` | Change (Mojang's wording, shortened) | BDS `MolangVersion` enumerator (EndstoneMC/endstone `src/bedrock/shared_types/molang/molang_version.h` at `bb0475b6`) |
|---|---|---|
| 1.17.0 | Versioning introduced | `Initial = 1` |
| 1.17.30 | `query.item_remaining_use_duration` ticks to seconds fixed; normalization goes 1 to 0 | `FixedItemRemainingUseDurationQuery = 2` |
| 1.17.40 | Content errors for invalid expressions such as `'text' + 1` | `ExpressionErrorMessages = 3` |
| 1.17.40 | Errors for too many operators (`1+(2 3)`) and unknown tokens | `UnexpectedOperatorErrors = 4` |
| 1.18.10 | Ternary associativity: `A ? B : C ? D : E` is `A ? B : (C ? D : E)`, previously `(A ? B : C) ? D : E` | `ConditionalOperatorAssociativity = 5` |
| 1.18.20 | `&&` before `\|\|`; comparison before equality. HTML example: `A && B \|\| C` is `(A && B) \|\| C` "instead of `A && (B \|\| C)`" | `ComparisonAndLogicalOperatorPrecedence = 6` |
| 1.19.60 | Division by a dynamically determined negative variable no longer divides by its absolute value | `DivideByNegativeValue = 7` |
| 1.20.0 | `query.cape_flap_amount` uses body rotation | `FixedCapeFlapAmountQuery = 8` |
| 1.20.10 | `block_property` renamed `block_state`, `has_block_property` renamed `has_block_state` | `QueryBlockPropertyRenamedToState = 9` |
| 1.20.40 | Old names deprecated | `DeprecateOldBlockQueryNames = 10` |
| 1.20.50 | HTML: `dash_cooldown_progress` removed; `is_scenting`, `is_rising`, `is_feelingHappy` removed, use `timer_flag_1..3`. The Learn page says `block_property` is removed here instead; the two texts disagree. | `DeprecatedSnifferAndCamelQueries = 11` |
| 1.20.70 | Surface particle queries treat leaves as supporting blocks | `LeafSupportingInFirstSolidBlockBelow = 12` |
| 1.21.100 (HTML only) | `query.is_carrying_block` works for all entities and returns 1.0 for air | `CarryingBlockQueryAllActors = 13`; `Latest = 13`, `HardcodedMolang = 13` |

The enum also has `BeforeVersioning = 0`, which is what a pack with `min_engine_version` below 1.17.0 gets. The base `vanilla` layer declares `[1, 13, 0]`; `vanilla_1.17.0` and later declare their own version, so a composed vanilla pack carries expressions under 0, 1, 5, 6 and 13 at once. Section 2 shows this does not change any vanilla result.

## 2. Queries

### The documented lists

The Learn index (`QueryFunctions.md`) has 306 distinct `query.*` names. `Molang.html` has 319; the 13 extra are `block_property`, `has_block_property`, `cardinal_block_face_placed_on`, `dash_cooldown_progress`, `debug_output`, `get_equipped_item_name`, `get_name`, `owner_identifier`, `is_feeling_happy`, `lod_index`, `overlay_alpha`, `texture_frame_index`, `unhappy_counter`, all deprecated, removed or internal. Nothing is on the Learn index and missing from the HTML. `query.is_daytime` and `query.get_default_bonemeal_block` appear in neither.

Mojang labels six queries by side in the HTML text: `anger_level` "Available on the Server only"; `scoreboard` "Available only with behavior packs"; `server_memory_tier` "Available on the server side (Behavior Packs) only"; `had_component_group` "Usable only in behavior packs when determining the default value for an entity's Property"; `is_local_player` "Always returns 0.0 if used in a behavior pack"; `last_hit_by_player` "If called by the client always returns 0.0". Thirteen carry "Available on the Client (Resource Packs) only": `client_max_render_distance`, `client_memory_tier`, `get_pack_setting`, `graphics_mode_is_any`, `heartbeat_phase`, `is_pack_setting_enabled`, `is_pack_setting_selected`, `last_input_mode_is_any`, `surface_particle_color`, `surface_particle_texture_coordinate`, `surface_particle_texture_size`, `time_since_last_vibration_detection`, `touch_only_affects_hotbar`. Every other query is documented without a side; the "context" column in the table at the end of this section is this note's classification from each description.

### What vanilla uses server-side

Method: compose the 56 `vanilla*` layers (later layer wins by member name) into `/tmp/bds-research-molang/composed/vanilla_bp`, add the server-root `definitions/features`, `definitions/feature_rules` and `definitions/spawn_groups`, then walk every JSON string value for `query.`, `q.`, `math.`, `variable.`, `v.`, `temp.`, `t.`, `context.`, `c.` identifiers, case-insensitively. 15 of the 3524 files are unreadable because they are `\x7fMCB` binaries (23 items, all trading, shapes, item catalog); the same files from bedrock-samples `v1.26.50.4` were scanned as plain JSON and add nothing new (items: `context.other`, `query.max_durability`, `query.remaining_durability`, `query.all_tags`; trading, loot tables, spawn rules, recipes: zero expressions). Attachables and persona files under `definitions/` are client content and are excluded.

Result: 537 strings, 82 distinct expressions, 331 files, 35 identifiers.

| Count | Identifier | Where, with an example |
|---|---|---|
| 176 | `variable.worldx` | Feature rule `distribution.x/y/z` and `y.extent`: `query.heightmap(variable.worldx, variable.worldz)` |
| 176 | `variable.worldz` | As above |
| 162 | `query.heightmap` | 129 rules set `y` to it, 37 use it inside `y.extent`; `.../mangrove_swamp_mangrove_tree_feature.json`: `math.max(query.above_top_solid(variable.worldx, variable.worldz), query.heightmap(variable.worldx, variable.worldz) - 4)` |
| 116 | `math.random` | 100 in `minecraft:experience_reward` (`on_bred: "Math.Random(1,7)"`, `on_death: "query.last_hit_by_player ? Math.Random(1,3) : 0"`), 13 in feature rule and feature `iterations` (`"Math.Random(48, 96)"` dripstone cluster, `"Math.Random(204, 250)"` sculk vein, `"Math.Random(104, 157)"` glow lichen), 2 in `eyeblossom_feature_rules.json` `x` and `z` (`"math.random(-8, 8)"`), 1 in `breeze.json` `reflect_projectiles.azimuth_angle` (`"180.0 + Math.random(-20.0, 20.0)"`) |
| 113 | `query.any_tag` | Block filters in features: `may_replace`, `may_grow_on`, `may_grow_through`, `block_intersection.block_allowlist` (`"query.any_tag('minecraft:leaves')"`, `"query.any_tag('dirt', 'sand', 'gravel')"`); `navigation.walk.blocks_to_avoid` in `breeze.json` (`"query.any_tag('trapdoors')"`) |
| 89 | `query.last_hit_by_player` | `experience_reward.on_death` in 86 files (the six root-level copies included) |
| 28 | `variable.is_legacy` | Feature rule `scatter_chance` and `iterations`: `"variable.is_legacy ? 0.0 : 100.0"`, `"variable.is_legacy == 0.0 ? 1 : 0"` |
| 24 | `query.equipment_count` | `on_death: "query.last_hit_by_player ? 5 + (query.equipment_count * Math.Random(1,3)) : 0"` (bogged, skeletons, zombies) |
| 16 | `query.block_state` | The 9 `permutations[].condition` strings of `shelf_mushroom_block.json`: `"query.block_state('growth') == 1 && query.block_state('minecraft:cardinal_direction') == 'east'"` |
| 15 | `query.is_baby` | `ambient_sound_interval.event_names[].condition`, `behavior.eat_block.success_chance` (`"query.is_baby ? 0.02 : 0.001"`, sheep), inside `on_death` |
| 15 | `query.noise` | Feature rule `iterations` and `scatter_chance`: `"math.ceil((query.noise(variable.originx / 80.0, variable.originz / 80.0) + 0.3) * 160.0)"` (bamboo), `"(query.noise((variable.originx + 8) / 200.0, (variable.originz + 8) / 200.0) < -0.8) ? 5 : 10"` |
| 15 | `variable.originx`, `variable.originz` (15 each) | Only with `query.noise` |
| 14 | `query.above_top_solid` | Feature rule `y`: `"query.above_top_solid(variable.worldx, variable.worldz)"` (grove pine, mangrove) |
| 9 | `query.has_any_family` | `rideable.seats[].rotate_rider_by` in boat and chest boat: `"query.has_any_family('blaze', 'creeper', ..., 'happy_ghast') ? -90 : 0"` |
| 9 | `query.has_biome_tag` | `definitions/features/optional_beehive_feature.json` `scatter_chance`: a nested ternary over `has_biome_tag('bee_habitat')`, `'plains'`, `'flower_forest'`, `'birch_forest'`... returning 5.0, 3.0 or smaller percentages |
| 7 | `context.other` | Spear items `repairable.repair_items[].repair_amount`: `"context.other->query.remaining_durability"` |
| 7 | `query.all_tags` | `behavior.pickup_items.excluded_items[].tags` (`"q.all_tags('minecraft:is_spear')"`), `behavior.tempt.items[].tags`, `repairable.repair_items[].items[].tags` |
| 7 | `query.head_is_in_water` | `ambient_sound_interval` conditions (axolotl, drowned) |
| 7 | `query.max_durability` | Spear `repair_amount: "query.max_durability * 0.25"` |
| 7 | `query.remaining_durability` | With `context.other` above |
| 5 | `query.anger_level` | `warden.json`: `anger_level.on_increase_sounds[].condition` `"query.anger_level(this) >= 40"`, `ambient_sound_interval` `"query.anger_level(this) >= 80"`, `heartbeat.interval` `"2.0 - math.clamp(query.anger_level / 80 * 1.5, 0, 1.5)"` |
| 4 | `math.ceil` | Bamboo `iterations` |
| 4 | `variable.sea_level` | `hell.biome.json` `surface_material_adjustments.adjustments[].height_range`: `"variable.sea_level - 3"`, `"variable.sea_level + 2"` |
| 3 | `math.clamp` | Warden heartbeat; creaking `set_property`; bamboo |
| 3 | `math.die_roll` | `on_death` of pillager, vindicator, witch: `"query.last_hit_by_player ? (query.is_baby ? 12 : 5) + (Math.die_roll(query.equipment_count,1,3)) : 0"` |
| 3 | `math.trunc` | `definitions/feature_rules/bamboo_jungle_after_surface_bamboo_feature.json`: `"math.clamp(math.trunc(math.ceil((query.noise(math.trunc(variable.originx / 80), math.trunc(variable.originz / 80)) + 0.3) * 160)), 15, 160)"` |
| 2 | `query.is_using_item` | Allay ambient sound conditions |
| 2 | `query.variant` | `on_death: "query.last_hit_by_player ? query.variant : 0"` (magma cube, slime) |
| 1 | `math.max` | Mangrove `y` above |
| 1 | `math.min` | `player.json` `on_death: "Math.Min(query.player_level * 7, 100)"` |
| 1 | `query.had_component_group` | `bee.json` `description.properties.minecraft:has_nectar.default: "query.had_component_group('has_nectar')"` |
| 1 | `query.is_on_ground` | Breeze ambient sound `"!query.is_on_ground"` |
| 1 | `query.player_level` | Player `on_death` above |
| 1 | `query.property` | `creaking.json` event `set_property`: `"math.clamp(query.property('minecraft:creaking_swaying_ticks') + 1, 0, 6)"` |

Occurrences by folder: `feature_rules` 158 in 130 files, `entities` 157 in 82, `features` 121 in 56, `definitions/feature_rules` 62 in 48, `items` 16 in 7, `blocks` 9 in 1, `biomes` 4 in 1, `definitions/features` 1 in 1, plus 9 in six entity files that sit at the root of layers `vanilla_1.20.10` and `vanilla_1.19.60` (donkey, horse, llama, mule, trader_llama, tropicalfish) rather than under `entities/`; whether the engine reads those is not verified.

By pack layer, the Molang-bearing files come from `vanilla_1.26.50` (80), `vanilla_1.21.60` (72), `definitions` (48), `vanilla_1.26.30` (26), `vanilla_1.18.0` (23), and smaller numbers from 17 other layers; the base `vanilla` layer contributes one file (`hell.biome.json`). 39 strings live in layers with `min_engine_version` below 1.18.20 (`vanilla` 4, `vanilla_1.17.0` 1, `vanilla_1.18.0` 25, `vanilla_1.18.10` 9); each is a single operator or a bare query, so the pre-1.18.20 rules cannot change them. The five expressions that mix `&&` with `||`, nest `?:`, or combine `==` with `>=` (bee habitat, three bamboo rules, the pillager family `on_death`) are fully parenthesized. The `definitions/` files have no manifest; which version the engine applies to them is an open question.

Fields that carry Molang, by JSON path (component groups and feature types normalized): feature rule `distribution.y` 129, `distribution.y.extent[]` 37, `distribution.iterations` 28, `distribution.scatter_chance` 24, legacy root-level `y` 9, `scatter_chance` 1 and `iterations` 1 (pre-1.21.20 format), `distribution.x` 1, `distribution.z` 1; feature `may_replace[].tags` 36, `may_grow_on[].tags` 32, `may_grow_through[].tags` 31, `constraints.block_intersection.block_allowlist[].tags` 10, `base_cluster.may_replace[].tags` 2; entity `experience_reward.on_death` 90 and `on_bred` 33, `ambient_sound_interval.event_names[].condition` 20, `rideable.seats[].rotate_rider_by` 9, `behavior.pickup_items.excluded_items[].tags` 5, `anger_level.on_increase_sounds[].condition` 2, `reflect_projectiles.azimuth_angle` 1, `navigation.walk.blocks_to_avoid[].tags` 1, `heartbeat.interval` 1, `behavior.eat_block.success_chance` 1, `behavior.tempt.items[].tags` 1, event `set_property` 1, `description.properties.*.default` 1; item `repairable.repair_items[].repair_amount` 14 and `.items[].tags` 2; block `permutations[].condition` 9; biome `surface_material_adjustments.adjustments[].height_range[]` 4. `iterations` is documented as "Integer number" yet 13 vanilla rules give it `Math.Random(a, b)`, a float; how the engine rounds it is unstated.

The docs confirm these fields are Molang: `minecraft:experience_reward` `on_bred` and `on_death` are typed "Molang" (`EntityComponents/minecraftComponent_experience_reward.md`); `ambient_sound_interval.event_names[].condition` is "The condition that must be satisfied to select the given ambient sound"; `feature_rule_definition.md` says `iterations` "Can be an integer or a Molang expression", `scatter_chance` "(0.0 to 1.0 or Molang expression). If not triggered, no iterations will run", and `x`, `y`, `z` "(evaluated each iteration). Can be an integer, range object, or Molang expression"; `minecraft_scatter_feature.md` says "The scatter_chance check happens once, so either all placements will run or none will"; `BlockStatesAndPermutations.md` says a permutation `condition` is "A Molang expression that evaluates to true or false ... you are limited to using one Molang query: `query.block_state()`"; `minecraft:repairable` `repair_amount` accepts a "Legacy Molang Expression" object with `expression` and `version` (an explicit per-expression version override, also offered for `on_bred` and `on_death`); `minecraft_conditional_list.md` types feature `condition` as "Molang". The tree-feature `may_replace`, `may_grow_on` and `may_grow_through` pages type the fields only as "Array of strings"; the 1.26.50 changelog cited in the extraction note describes the `query.any_tag('minecraft:leaves')` form. `variable.worldx`, `worldz`, `originx`, `originz`, `is_legacy` and `sea_level` are documented nowhere in the reference; `variable.worldx` and `worldz` appear only in the feature tutorials (`Documents/FeaturesTutorial_1.md`, `world-generation.md`).

### What the client uses, for contrast

The same scan over bedrock-samples `v1.26.50.4` `resource_pack/` (animations, animation controllers, render controllers, client entities, attachables, particles; 1014 files) finds 5602 strings and 908 identifiers: 169 `query.*`, 22 `math.*`, 695 `variable.*`, 18 `temp.*`, 4 `context.*`. The most used are `query.life_time` (359), `math.cos` (350), `variable.particle_random_1` (343), `query.is_baby` (294), `math.sin` (289), `query.modified_move_speed` (269). Only six queries are used on both sides: `equipment_count`, `is_baby`, `is_on_ground`, `is_using_item`, `property`, `variant`. The server-side subset is 21 queries; the client subset is 169 and needs `temp.`, `->`, arrays, structs and resources.

### The query list

Context is this note's reading of each description: `entity` (needs an entity; the server has these entities), `entity, server only` and `server only` (Mojang's labels), `item` (needs an item stack), `block` (needs a block and its permutation), `placement` (feature placement position), `world` (level state), `tags` (item or block tag test), `pure` (no game state), `client` (render, camera, animation, particle, input or pack-setting state the server never has). "BP" marks use in the vanilla behavior pack or `definitions/`; "RP" marks use in the vanilla resource pack. Meanings are the first sentence of the Learn description.

| Query | Context | Meaning | Vanilla use |
|---|---|---|---|
| `query.above_top_solid` | placement | Returns the height of the block immediately above the highest solid block at the input (x,z) position. | BP |
| `query.actor_count` | client | Returns the number of entities (actors) rendered in the last frame. |  |
| `query.all` | pure | Evaluates the first argument, then returns 1.0 if all of the following arguments evaluate to the same value as the first. |  |
| `query.all_animations_finished` | client | Returns 1.0 if all animations in the current animation controller state have played through at least once, else it returns 0.0. | RP |
| `query.all_tags` | tags | Returns if the item or block has all of the tags specified. | BP |
| `query.anger_level` | entity, server only | Mojang: server only. Returns the anger level of the entity [0,n). | BP |
| `query.anim_time` | client | Returns the time in seconds since the current animation started, else 0.0 if not called within an animation. | RP |
| `query.any` | pure | Evaluates the first argument, then returns 1.0 if any of the following arguments evaluate to the same value as the first. |  |
| `query.any_animation_finished` | client | Returns 1.0 if any animation in the current animation controller state has played through at least once, else it returns 0.0. | RP |
| `query.any_tag` | tags | Returns if the item or block has any of the tags specified. | BP |
| `query.approx_eq` | pure | Returns 1.0 if all of the arguments are within the smallest unit of measurement possible for the computer running this query of each other, else 0.0. |  |
| `query.armor_color_slot` | entity | Takes the armor slot index as a parameter, and returns the color of the armor in the requested slot. | RP |
| `query.armor_damage_slot` | entity | Takes the armor slot index as a parameter, and returns the damage value of the requested slot. |  |
| `query.armor_material_slot` | entity | Takes the armor slot index as a parameter, and returns the armor material type in the requested armor slot. |  |
| `query.armor_texture_slot` | client | Takes the armor slot index as a parameter, and returns the texture type of the requested slot. | RP |
| `query.average_frame_time` | client | Returns the time in *seconds* of the average frame time over the last 'n' frames. |  |
| `query.base_swing_duration` | client | Returns the duration of the mob's swing/attack animation, determined by the carried item and unmodified by effects applied on the mob. |  |
| `query.blocking` | entity | Returns 1.0 if the entity is blocking, else it returns 0.0. | RP |
| `query.block_face` | block | Returns the block face for this (only valid for certain triggers such as placing blocks, or interacting with block) (Down=0.0, Up=1.0, North=2.0, S... |  |
| `query.block_has_all_tags` | block | Takes a world-origin-relative position and one or more tag names, and returns either 0 or 1 based on if the block at that position has all of the t... |  |
| `query.block_has_any_tag` | block | Takes a world-origin-relative position and one or more tag names, and returns either 0 or 1 based on if the block at that position has any of the t... |  |
| `query.block_neighbor_has_all_tags` | block | Takes a block-relative position and one or more tag names, and returns either 0 or 1 based on if the block at that position has all of the tags pro... |  |
| `query.block_neighbor_has_any_tag` | block | Takes a block-relative position and one or more tag names, and returns either 0 or 1 based on if the block at that position has any of the tags pro... |  |
| `query.block_state` | block | Returns the value of the associated block's block state. | BP |
| `query.body_x_rotation` | entity | Returns the body pitch rotation if called on an entity, else it returns 0.0. | RP |
| `query.body_y_rotation` | entity | Returns the body yaw rotation if called on an entity, else it returns 0.0. | RP |
| `query.bone_aabb` | client | Returns the axis aligned bounding box of a bone as a structure with members '.min', '.max', along with '.x', '.y', and '.z' values for each. | RP |
| `query.bone_orientation_matrix` | client | Returns the bone orientation (as a matrix) of the desired bone provided it exists in the queryable geometry of the mob, else this returns the ident... |  |
| `query.bone_orientation_trs` | client | Returns the bone orientation matrix decomposed into the component translation/rotation/scale (TRS) parts of the desired bone provided it exists in... |  |
| `query.bone_origin` | client | Returns the initial (from the .geo) pivot of a bone as a structure with members '.x', '.y', and '.z'. | RP |
| `query.bone_rotation` | client | Returns the initial (from the .geo) rotation of a bone as a structure with members '.x', '.y', and '.z' in degrees. | RP |
| `query.camera_distance_range_lerp` | client | Takes two distances (any order) and return a number from 0 to 1 based on the camera distance between the two ranges clamped to that range. |  |
| `query.camera_rotation` | client | Returns the rotation of the camera. | RP |
| `query.can_climb` | entity | Returns 1.0 if the entity can climb, else it returns 0.0. |  |
| `query.can_damage_nearby_mobs` | entity | Returns 1.0 if the entity can damage nearby mobs, else it returns 0.0. | RP |
| `query.can_dash` | entity | Returns 1.0 if the entity can dash, else it returns 0.0 |  |
| `query.can_fly` | entity | Returns 1.0 if the entity can fly, else it returns 0.0. |  |
| `query.can_power_jump` | entity | Returns 1.0 if the entity can power jump, else it returns 0.0. |  |
| `query.can_swim` | entity | Returns 1.0 if the entity can swim, else it returns 0.0. |  |
| `query.can_walk` | entity | Returns 1.0 if the entity can walk, else it returns 0.0. |  |
| `query.cape_flap_amount` | client | Returns value between 0.0 and 1.0 with 0.0 meaning cape is fully down and 1.0 is cape is fully up. | RP |
| `query.cardinal_facing` | entity | Returns the current facing of the player (Down=0.0, Up=1.0, North=2.0, South=3.0, West=4.0, East=5.0, Undefined=6.0). |  |
| `query.cardinal_facing_2d` | entity | Returns the current facing of the player ignoring up/down part of the direction (North=2.0, South=3.0, West=4.0, East=5.0, Undefined=6.0). |  |
| `query.cardinal_player_facing` | entity | Returns the current facing of the player (Down=0.0, Up=1.0, North=2.0, South=3.0, West=4.0, East=5.0, Undefined=6.0). |  |
| `query.client_max_render_distance` | client | Mojang: client only. Returns the max render distance in chunks of the current client. |  |
| `query.client_memory_tier` | client | Mojang: client only. Returns a number representing the client RAM memory tier, 0 = 'SuperLow', 1 = 'Low', 2 = 'Mid', 3 = 'High', or 4 = 'SuperHigh'. |  |
| `query.combine_entities` | pure | Combines any valid entity references from all arguments into a single array. |  |
| `query.cooldown_time` | item | Returns the total cooldown time in seconds for the item held or worn by the specified equipment slot name (and if required second numerical slot id... |  |
| `query.cooldown_time_remaining` | item | Returns the cooldown time remaining in seconds for specified cooldown type or the item held or worn by the specified equipment slot name (and if re... |  |
| `query.count` | pure | Counts the number of things passed to it (arrays are counted as the number of elements they contain; non-arrays count as 1). |  |
| `query.current_squish_value` | client | Returns the squish value for the current entity, or 0.0 if this doesn't make sense. | RP |
| `query.day` | world | Returns the day of the current world. |  |
| `query.death_ticks` | entity | Returns the elapsed ticks since the mob started dying. | RP |
| `query.delta_time` | client | Returns the time in seconds since the previous frame. | RP |
| `query.distance_from_camera` | client | Returns the distance of the root of this entity or particle emitter from the camera. |  |
| `query.effect_emitter_count` | client | Returns the total number of active emitters of the callee's particle effect type. |  |
| `query.effect_particle_count` | client | Returns the total number of active particles of the callee's particle effect type. |  |
| `query.entity_biome_has_all_tags` | entity | Compares the biome the entity is standing in with one or more tag names, and returns either 0 or 1 based on if all of the tag names match. |  |
| `query.entity_biome_has_any_identifier` | entity | Compares the biome the entity is standing in with one or more identifier names, and returns either 0 or 1 based on if any of the identifier names m... |  |
| `query.entity_biome_has_any_tags` | entity | Compares the biome the entity is standing in with one or more tag names, and returns either 0 or 1 based on if any of the tag names match. |  |
| `query.equipment_count` | entity | Returns the number of equipped armor pieces for an entity from 0 to 5, not counting items held in hands. | BP, RP |
| `query.equipped_item_all_tags` | entity | Takes a slot name followed by any tag you want to check for in the form of 'tag_name' and returns 1 if all of the tags are on that equipped item, 0... |  |
| `query.equipped_item_any_tag` | entity | Takes a slot name followed by any tag you want to check for in the form of 'tag_name' and returns 0 if none of the tags are on that equipped item o... | RP |
| `query.equipped_item_is_attachable` | client | Takes the desired hand slot as a parameter (0 or 'main_hand' for main hand, 1 or 'off_hand' for off hand), and returns whether the item is an attac... |  |
| `query.eye_target_x_rotation` | entity | Returns the X eye rotation of the entity, else it returns 0.0. | RP |
| `query.eye_target_y_rotation` | entity | Returns the Y eye rotation of the entity, else it returns 0.0. | RP |
| `query.facing_target_to_range_attack` | entity | Returns 1.0 if the entity is attacking from range (i.e. | RP |
| `query.frame_alpha` | client | Returns the ratio (from 0 to 1) of how much between AI ticks this frame is being rendered. | RP |
| `query.fuse_time` | entity | Returns the remaining fuse time of the entity. | RP |
| `query.get_actor_info_id` | item | Returns the integer id of an entity (actor) by its string name. |  |
| `query.get_animation_frame` | client | Returns the current texture of an item whose appearance can change (such as a drawn bow). | RP |
| `query.get_default_bone_pivot` | client | Gets specified axis of the specified bone orientation pivot. | RP |
| `query.get_level_seed_based_fraction` | world | Returns a value in range [0.0, 1.0] based on the level seed. |  |
| `query.get_locator_offset` | client | Gets specified axis of the specified locator offset. |  |
| `query.get_pack_setting` | client | Mojang: client only. Returns value of Pack Setting slider, parameter is name of slider. |  |
| `query.get_root_locator_offset` | client | Gets specified axis of the specified locator offset of the root model. | RP |
| `query.graphics_mode_is_any` | client | Mojang: client only. If the graphics mode of the client matches any of the arguments, return 1.0. |  |
| `query.ground_speed` | entity | Returns the ground speed of the entity in meters/second. | RP |
| `query.had_component_group` | entity, server only | If the entity is being loaded from data that was last saved with a component_group with the specified name, returns 1.0, otherwise returns 0.0. | BP |
| `query.has_all_biome_tags` | placement | Returns 1.0 if the biome at the current placement position has all of the specified tags, else 0.0. |  |
| `query.has_any_biome_tags` | placement | Returns 1.0 if the biome at the current placement position has at least one of the specified tags, else 0.0. |  |
| `query.has_any_family` | entity | Returns 1 if the entity has any of the specified type families, else 0. | BP |
| `query.has_any_leashed_entity_of_type` | entity | Returns whether or not the entity is currently leashing other entities of the designated types. | RP |
| `query.has_armor_slot` | entity | Takes the armor slot index as a parameter, and returns 1.0 if the entity has armor in the requested slot, else it returns 0.0. |  |
| `query.has_biome_tag` | placement | Returns whether or not a block placement target has a specific biome tag. | BP |
| `query.has_block_state` | block | Returns 1.0 if the associated block has the given block state or 0.0 if not. |  |
| `query.has_cape` | entity | Returns 1.0 if the player has a cape, else it returns 0.0. |  |
| `query.has_collision` | entity | Returns 1.0 if the entity has collisions enabled, else it returns 0.0. |  |
| `query.has_dash_cooldown` | entity | Returns 1.0 if the entity has cooldown on its dash, else it returns 0.0 | RP |
| `query.has_gravity` | entity | Returns 1.0 if the entity is affected by gravity, else it returns 0.0. |  |
| `query.has_head_gear` | entity | Returns boolean whether an entity has an item in their head armor slot or not, or false if no entity in current context | RP |
| `query.has_owner` | entity | Returns true if the entity has an owner ID else it returns false. |  |
| `query.has_player_rider` | entity | Returns 1 if the entity has a player riding it in any seat, else it returns 0. | RP |
| `query.has_property` | entity | Returns 1.0 if a property with the given name exists, 0 otherwise. |  |
| `query.has_rider` | entity | Returns 1.0 if the entity has a rider, else it returns 0.0 | RP |
| `query.has_target` | entity | Returns 1.0 if the entity has a target, else it returns 0.0 | RP |
| `query.head_is_in_water` | entity | Returns 1.0 if the entity's head is in water, else it returns 0.0. | BP |
| `query.head_roll_angle` | client | Returns the roll angle of the head of the entity if it makes sense, else it returns 0.0. | RP |
| `query.head_x_rotation` | entity | Returns the nth head x rotation of the entity if it makes sense, else it returns 0.0. | RP |
| `query.head_y_rotation` | entity | Returns the nth head y rotation of the entity if it makes sense, else it returns 0.0. | RP |
| `query.health` | entity | Returns the health of the entity, or 0.0 if it doesn't make sense to call on this entity. | RP |
| `query.heartbeat_interval` | entity | Returns the heartbeat interval of the entity in seconds. |  |
| `query.heartbeat_phase` | client | Mojang: client only. Returns the heartbeat phase of the entity. | RP |
| `query.heightmap` | placement | Returns the world height (Y value) of the terrain at the specified position. | BP |
| `query.hurt_direction` | entity | Returns the hurt direction for the entity, otherwise returns 0. | RP |
| `query.hurt_time` | entity | Returns the hurt time for the entity, otherwise returns 0. | RP |
| `query.invulnerable_ticks` | entity | Returns the number of ticks of invulnerability the entity has left if it makes sense, else it returns 0.0. | RP |
| `query.in_range` | pure | If the first argument is between the minimum and maximum (inclusive), returns 1.0. |  |
| `query.is_admiring` | entity | Returns 1.0 if the entity is admiring, else it returns 0.0. | RP |
| `query.is_alive` | entity | Returns 1.0 if the entity is alive, and 0.0 if it's dead. | RP |
| `query.is_angry` | entity | Returns 1.0 if the entity is angry, else it returns 0.0. | RP |
| `query.is_attached` | entity | Returns 1.0 if the entity is attached to another entity (such as being held or worn), else it will return 0.0. |  |
| `query.is_attached_to_entity` | entity | Returns 1.0 if the entity is attached to another entity, else it will return 0.0. | RP |
| `query.is_avoiding_block` | entity | Returns 1.0 if the entity is fleeing from a block, else it returns 0.0. |  |
| `query.is_avoiding_mobs` | entity | Returns 1.0 if the entity is fleeing from mobs, else it returns 0.0. |  |
| `query.is_baby` | entity | Returns 1.0 if the entity has a `is_baby` component, else it returns 0.0. | BP, RP |
| `query.is_breathing` | entity | Returns 1.0 if the entity is breathing, else it returns 0.0. |  |
| `query.is_bribed` | entity | Returns 1.0 if the entity has been bribed, else it returns 0.0. |  |
| `query.is_carrying_block` | entity | Returns 1.0 if the entity is carrying a block, else it returns 0.0. | RP |
| `query.is_casting` | entity | Returns 1.0 if the entity is casting, else it returns 0.0. | RP |
| `query.is_celebrating` | entity | Returns 1.0 if the entity is celebrating, else it returns 0.0. | RP |
| `query.is_celebrating_special` | entity | Returns 1.0 if the entity is doing a special celebration, else it returns 0.0. | RP |
| `query.is_charged` | entity | Returns 1.0 if the entity has the `is_charged` component, else it returns 0.0. | RP |
| `query.is_charging` | entity | Returns 1.0 if the entity is charging, else it returns 0.0. | RP |
| `query.is_chested` | entity | Returns 1.0 if the entity has chests attached to it (has the `is_chested` component), else it returns 0.0. | RP |
| `query.is_cooldown_category` | item | Returns 1.0 if the specified held or worn item has the specified cooldown category, otherwise returns 0.0. |  |
| `query.is_crawling` | entity | Returns 1.0 if the entity is crawling, else it returns 0.0 | RP |
| `query.is_critical` | entity | Returns 1.0 if the entity is at a critical level of damage, else it returns 0.0. |  |
| `query.is_croaking` | entity | Returns 1.0 if the entity is croaking, else it returns 0.0. | RP |
| `query.is_dancing` | entity | Returns 1.0 if the entity is dancing, else it returns 0.0. | RP |
| `query.is_delayed_attacking` | entity | Returns 1.0 if the entity is attacking using the delayed attack, else it returns 0.0. | RP |
| `query.is_digging` | entity | Returns 1.0 if the entity is digging, else it returns 0.0. | RP |
| `query.is_eating` | entity | Returns 1.0 if the entity is eating, else it returns 0.0. | RP |
| `query.is_eating_mob` | entity | Returns 1.0 if the entity is eating a mob, else it returns 0.0. | RP |
| `query.is_elder` | entity | Returns 1.0 if the entity is an elder version of it, else it returns 0.0. | RP |
| `query.is_emerging` | entity | Returns 1.0 if the entity is emerging, else it returns 0.0. | RP |
| `query.is_emoting` | client | Returns 1.0 if the entity is emoting, else it returns 0.0. | RP |
| `query.is_enchanted` | item | Returns 1.0 if the entity is enchanted, else it returns 0.0. |  |
| `query.is_fire_immune` | entity | Returns 1.0 if the entity is immune to fire (has the `fire_immune` component), else it returns 0.0. |  |
| `query.is_first_person` | client | Returns 1.0 if the entity is being rendered in first person mode, else it returns 0.0. |  |
| `query.is_ghost` | entity | Returns 1.0 if an entity is a ghost, else it returns 0.0. | RP |
| `query.is_gliding` | entity | Returns 1.0 if the entity is gliding, else it returns 0.0. | RP |
| `query.is_grazing` | entity | Returns 1.0 if the entity is grazing, or 0.0 if not. | RP |
| `query.is_idling` | entity | Returns 1.0 if the entity is idling, else it returns 0.0. |  |
| `query.is_ignited` | entity | Returns 1.0 if the entity is ignited (has the `is_ignited` component), else it returns 0.0. |  |
| `query.is_illager_captain` | entity | Returns 1.0 if the entity is an illager captain (has the `is_illager_captain` component), else it returns 0.0. |  |
| `query.is_interested` | entity | Returns 1.0 if the entity is interested, else it returns 0.0. | RP |
| `query.is_invisible` | entity | Returns 1.0 if the entity is invisible (using render controllers), else it returns 0.0. | RP |
| `query.is_in_contact_with_water` | entity | Returns 1.0 if the entity is in contact with any water (water, rain, splash water bottle), else it returns 0.0. |  |
| `query.is_in_lava` | entity | Returns 1.0 if the entity is in lava, else it returns 0.0. | RP |
| `query.is_in_love` | entity | Returns 1.0 if the entity is in love (has a love-hearts animation), else it returns 0.0. |  |
| `query.is_in_ui` | client | Returns 1.0 if the entity is rendered as part of the UI, else it returns 0.0. | RP |
| `query.is_in_water` | entity | Returns 1.0 if the entity is in water, else it returns 0.0. | RP |
| `query.is_in_water_or_rain` | entity | Returns 1.0 if the entity is in water or rain, else it returns 0.0. |  |
| `query.is_item_equipped` | entity | Takes one optional hand slot as a parameter (0 or 'main_hand' for main hand, 1 or 'off_hand' for off hand), and returns 1.0 if there is an item in... | RP |
| `query.is_item_name_any` | entity | Returns 1.0 if an item in the specified slot has any of the specified names, otherwise returns 0.0. | RP |
| `query.is_jumping` | entity | Returns 1.0 if the entity is jumping, else it returns 0.0. | RP |
| `query.is_jump_goal_jumping` | client | Returns 1.0 if the entity is doing a jump goal jump, else it returns 0.0. | RP |
| `query.is_laying_down` | entity | Returns 1.0 if the entity is laying down, else it returns 0.0. |  |
| `query.is_laying_egg` | entity | Returns 1.0 if the entity is laying an egg, else it returns 0.0. | RP |
| `query.is_leashed` | entity | Returns 1.0 if the entity is leashed to something, else it returns 0.0. | RP |
| `query.is_levitating` | entity | Returns 1.0 if the entity is levitating, else it returns 0.0. | RP |
| `query.is_lingering` | entity | Returns 1.0 if the potion type or effect is lingering, else it returns 0.0. |  |
| `query.is_local_player` | client | Returns 1.0 if the entity is the local player for the current game window, else it returns 0.0. |  |
| `query.is_moving` | entity | Returns 1.0 if the entity is moving, else it returns 0.0. | RP |
| `query.is_name_any` | entity | Takes one or more arguments. |  |
| `query.is_onfire` | entity | Returns 1.0 if the entity is on fire, else it returns 0.0. |  |
| `query.is_on_fire` | entity | Returns 1.0 if the entity is on fire, else it returns 0.0. |  |
| `query.is_on_ground` | entity | Returns 1.0 if the entity is on the ground, else it returns 0.0. | BP, RP |
| `query.is_on_screen` | client | Returns 1.0 if this is called on an entity at a time when it is known if it is on screen, else it returns 0.0. |  |
| `query.is_orphaned` | entity | Returns 1.0 if the entity is orphaned, else it returns 0.0. |  |
| `query.is_owner_identifier_any` | entity | Returns whether the root entity identifier is any of the specified strings. |  |
| `query.is_pack_setting_enabled` | client | Mojang: client only. Returns 1.0 if the Pack Setting toggle is enabled, parameter is name of toggle. |  |
| `query.is_pack_setting_selected` | client | Mojang: client only. Returns 1.0 if the Pack Setting dropdown or multiselect (first parameter) matches the string value of the second parameter (selection). |  |
| `query.is_persona_or_premium_skin` | client | Returns 1.0 if the player has a persona or premium skin, else it returns 0.0. | RP |
| `query.is_playing_dead` | entity | Returns 1.0 if the entity is playing dead, else it returns 0.0. | RP |
| `query.is_powered` | entity | Returns 1.0 if the entity is powered, else it returns 0.0. | RP |
| `query.is_pregnant` | entity | Returns 1.0 if the entity is pregnant, else it returns 0.0. | RP |
| `query.is_ram_attacking` | entity | Returns 1.0 if the entity is using a ram attack, else it returns 0.0. |  |
| `query.is_resting` | entity | Returns 1.0 if the entity is resting, else it returns 0.0. | RP |
| `query.is_riding` | entity | Returns 1.0 if the entity is riding, else it returns 0.0. | RP |
| `query.is_riding_any_entity_of_type` | entity | Returns whether or not the entity is currently riding an entity of any of the designated types. | RP |
| `query.is_rising` | entity | Deprecated. Returns 1.0 if behavior.timer_flag_2 is running, else it returns 0.0. |  |
| `query.is_roaring` | entity | Returns 1.0 if the entity is currently roaring, else it returns 0.0. | RP |
| `query.is_rolling` | entity | Returns 1.0 if the entity is rolling, else it returns 0.0. |  |
| `query.is_saddled` | entity | Returns 1.0 if the entity has a saddle (has the `is_saddled` component), else it returns 0.0. | RP |
| `query.is_scared` | entity | Returns 1.0 if the entity is scared, else it returns 0.0. | RP |
| `query.is_scenting` | entity | Deprecated. Returns 1.0 if behavior.timer_flag_1 is running, else it returns 0.0. |  |
| `query.is_searching` | entity | Returns 1.0 if the entity is searching, else it returns 0.0. | RP |
| `query.is_selected_item` | entity | Returns true if the player has selected an item in the inventory, else it returns 0.0. |  |
| `query.is_shaking` | entity | Returns 1.0 if the entity is shaking, else it returns 0.0. | RP |
| `query.is_shaking_wetness` | entity | Returns 1.0 if the entity is shaking water off, else it returns 0.0. | RP |
| `query.is_sheared` | entity | Returns 1.0 if the entity is able to be sheared and is sheared, else it returns 0.0. | RP |
| `query.is_shield_powered` | entity | Returns 1.0 if the entity has an active powered shield if it makes sense, else it returns 0.0. | RP |
| `query.is_silent` | entity | Returns 1.0 if the entity is silent, else it returns 0.0. |  |
| `query.is_sitting` | entity | Returns 1.0 if the entity is sitting, else it returns 0.0. | RP |
| `query.is_sleeping` | entity | Returns 1.0 if the entity is sleeping, else it returns 0.0. | RP |
| `query.is_sneaking` | entity | Returns 1.0 if the entity is sneaking, else it returns 0.0. | RP |
| `query.is_sneezing` | entity | Returns 1.0 if the entity is sneezing, else it returns 0.0. |  |
| `query.is_sniffing` | entity | Returns 1.0 if the entity is sniffing, else it returns 0.0. | RP |
| `query.is_sonic_boom` | entity | Returns 1.0 if the entity is using sonic boom, else it returns 0.0. | RP |
| `query.is_spectator` | entity | Returns 1.0 if the entity (player) is in spectator mode, else it returns 0.0. | RP |
| `query.is_sprinting` | entity | Returns 1.0 if the entity is sprinting, else it returns 0.0. |  |
| `query.is_stackable` | entity | Returns 1.0 if the entity is stackable (has the `is_stackable` component), else it returns 0.0. |  |
| `query.is_stalking` | entity | Returns 1.0 if the entity is stalking, else it returns 0.0. | RP |
| `query.is_standing` | entity | Returns 1.0 if the entity is standing, else it returns 0.0. | RP |
| `query.is_stunned` | entity | Returns 1.0 if the entity is currently stunned, else it returns 0.0. | RP |
| `query.is_swimming` | entity | Returns 1.0 if the entity is swimming, else it returns 0.0. | RP |
| `query.is_tamed` | entity | Returns 1.0 if the entity is tamed, else it returns 0.0. | RP |
| `query.is_transforming` | entity | Returns 1.0 if the entity is transforming, else it returns 0.0. |  |
| `query.is_using_item` | entity | Returns 1.0 if the entity is using an item, else it returns 0.0. | BP, RP |
| `query.is_wall_climbing` | entity | Returns 1.0 if the entity is climbing a wall, else it returns 0.0. |  |
| `query.item_in_use_duration` | item | Returns the amount of time an item has been in use in seconds up to the maximum duration, else 0.0 if it doesn't make sense. |  |
| `query.item_is_charged` | item | Takes one optional hand slot as a parameter (0 or 'main_hand' for main hand, 1 or 'off_hand' for off hand), and returns 1.0 if the item is charged... | RP |
| `query.item_max_use_duration` | item | Returns the maximum amount of time the item can be used, else 0.0 if it doesn't make sense. |  |
| `query.item_remaining_use_duration` | item | Returns the amount of time an item has left to use, else 0.0 if it doesn't make sense. | RP |
| `query.item_slot_to_bone_name` | client | This function returns the name of the bone this entity has mapped to that slot. | RP |
| `query.key_frame_lerp_time` | client | Returns the ratio between the previous and next key frames. | RP |
| `query.kinetic_weapon_damage_duration` | entity | Returns the "max_duration" value of "damage_conditions" from the main-hand item's "minecraft:kinetic_weapon" component, or 0 if the component is no... | RP |
| `query.kinetic_weapon_delay` | entity | Returns the "delay" value from the main-hand item's "minecraft:kinetic_weapon" component, or 0 if the component is not present. | RP |
| `query.kinetic_weapon_dismount_duration` | entity | Returns the "max_duration" value of "dismount_conditions" from the main-hand item's "minecraft:kinetic_weapon" component, or 0 if the component is... | RP |
| `query.kinetic_weapon_knockback_duration` | entity | Returns the "max_duration" value of "knockback_conditions" from the main-hand item's "minecraft:kinetic_weapon" component, or 0 if the component is... | RP |
| `query.last_frame_time` | client | Returns the time in *seconds* of the last frame. |  |
| `query.last_hit_by_player` | entity | Returns 1.0 if the entity was last hit by the player, else it returns 0.0. | BP |
| `query.last_input_mode_is_any` | client | Mojang: client only. Takes one or more arguments ('keyboard_and_mouse', 'touch', or 'gamepad'). |  |
| `query.leashed_entity_count` | entity | Returns the number of entities for which this entity is the leash holder. |  |
| `query.lie_amount` | entity | Returns the lie down amount for the entity. | RP |
| `query.life_span` | entity | Returns the limited life span of an entity, or 0.0 if it lives forever. | RP |
| `query.life_time` | client | Returns the time in seconds since the current animation started, else 0.0 if not called within an animation. | RP |
| `query.log` | pure | Debug log a value to the content file. |  |
| `query.main_hand_item_max_duration` | item | Returns the use time maximum duration for the main hand item if it makes sense, else it returns 0.0. | RP |
| `query.main_hand_item_use_duration` | item | Returns the use time for the main hand item. | RP |
| `query.mark_variant` | entity | Returns the entity's mark variant value, if the entity has the `mark_variant` component. | RP |
| `query.maximum_frame_time` | client | Returns the time in *seconds* of the most expensive frame over the last 'n' frames. |  |
| `query.max_durability` | item | Returns the max durability an item can take. | BP |
| `query.max_health` | entity | Returns the maximum health of the entity, or 0.0 if it doesn't make sense to call on this entity. |  |
| `query.max_trade_tier` | entity | Returns the maximum trade tier of the entity if it can perform trades, else it returns 0.0 |  |
| `query.minimum_frame_time` | client | Returns the time in *seconds* of the least expensive frame over the last 'n' frames. |  |
| `query.model_scale` | entity | Returns the scale of the current entity. | RP |
| `query.modified_distance_moved` | client | Returns the total distance the entity has moved horizontally in meters (since the entity was last loaded, not necessarily since it was originally c... | RP |
| `query.modified_move_speed` | client | Returns the current walk speed of the entity. | RP |
| `query.modified_swing_duration` | client | Returns the duration of the mob's swing/attack animation, determined by the carried item and modified by effects applied on the mob. |  |
| `query.moon_brightness` | world | Returns the brightness of the moon (FULL_MOON=1.0, WANING_GIBBOUS=0.75, FIRST_QUARTER=0.5, WANING_CRESCENT=0.25, NEW_MOON=0.0, WAXING_CRESCENT=0.25... |  |
| `query.moon_phase` | world | Returns the phase of the moon (FULL_MOON=0, WANING_GIBBOUS=1, FIRST_QUARTER=2, WANING_CRESCENT=3, NEW_MOON=4, WAXING_CRESCENT=5, LAST_QUARTER=6, WA... |  |
| `query.movement_direction` | client | Returns the specified axis of the normalized position delta of the entity. | RP |
| `query.noise` | placement | Queries a Perlin Noise Map. | BP |
| `query.on_fire_time` | entity | Returns the time that the entity is on fire, else it returns 0.0. |  |
| `query.out_of_control` | entity | Returns 1.0 if the entity is out of control (has the `out_of_control` component), else it returns 0.0. |  |
| `query.player_level` | entity | Returns the players level if the entity is a player, otherwise returns 0. | BP |
| `query.position` | entity | Returns the absolute position of an entity. |  |
| `query.position_delta` | entity | Returns the position delta for an entity. | RP |
| `query.previous_squish_value` | client | Returns the previous squish value for the current entity, or 0.0 if this doesn't make sense. | RP |
| `query.property` | entity | Returns the value of that property if it exists, else 0.0 if not. | BP, RP |
| `query.relative_block_has_all_tags` | entity | Takes an entity-relative position and one or more tag names, and returns either 0 or 1 based on if the block at that position has all of the tags p... |  |
| `query.relative_block_has_any_tag` | entity | Takes an entity-relative position and one or more tag names, and returns either 0 or 1 based on if the block at that position has any of the tags p... |  |
| `query.remaining_durability` | item | Returns how much durability an item has remaining. | BP |
| `query.rider_body_x_rotation` | entity | Returns the body pitch world-rotation of a valid rider at the provided index if called on an entity, else it returns 0.0. |  |
| `query.rider_body_y_rotation` | entity | Returns the body yaw world-rotation of a valid rider at the provided index if called on an entity, else it returns 0.0. |  |
| `query.rider_head_x_rotation` | entity | Returns the head x world-rotation of the rider entity at the provided index, else it returns 0.0. |  |
| `query.rider_head_y_rotation` | entity | Returns the head y world-rotation of the rider entity at the provided index, else it returns 0.0. |  |
| `query.ride_body_x_rotation` | entity | Returns the body pitch world-rotation of the ride an entity, else it returns 0.0. |  |
| `query.ride_body_y_rotation` | entity | Returns the body yaw world-rotation of the ride of on an entity, else it returns 0.0. |  |
| `query.ride_head_x_rotation` | entity | Returns the head x world-rotation of the ride of an entity, else it returns 0.0. |  |
| `query.ride_head_y_rotation` | entity | Returns the head y world-rotation of the ride of an entity, else it returns 0.0. |  |
| `query.roll_counter` | entity | Returns the roll counter of the entity. | RP |
| `query.rotation_to_camera` | client | Returns the rotation required to aim at the camera. |  |
| `query.scoreboard` | entity, server only | Mojang: server only. Returns the specified scoreboard value for this entity. |  |
| `query.server_memory_tier` | server only | Mojang: server only. Returns a number representing the server RAM memory tier, 0 = 'SuperLow', 1 = 'Low', 2 = 'Mid', 3 = 'High', or 4 = 'SuperHigh'. |  |
| `query.shake_angle` | entity | Returns the shaking angle of the entity if it makes sense, else it returns 0.0. | RP |
| `query.shake_time` | entity | Returns the shake time of the entity. | RP |
| `query.shield_blocking_bob` | client | Returns the how much the offhand shield should translate down when blocking and being hit. |  |
| `query.show_bottom` | entity | Returns 1.0 if we render the entity's bottom, else it returns 0.0. | RP |
| `query.sit_amount` | entity | Returns the current sit amount of the entity. | RP |
| `query.skin_id` | entity | Returns the entity's skin ID (related to the `skin_id` component). | RP |
| `query.sleep_rotation` | entity | Returns the rotation of the bed the player is sleeping on. | RP |
| `query.sneeze_counter` | entity | Returns the sneeze counter of the entity. | RP |
| `query.spellcolor` | client | Returns a struct representing the entity spell color for the specified entity. |  |
| `query.standing_scale` | entity | Returns the scale of how standing up the entity is. | RP |
| `query.state_time` | client | Returns the time in seconds in the current animation controller state. |  |
| `query.structural_integrity` | entity | Returns the structural integrity for the entity, otherwise returns 0. | RP |
| `query.surface_particle_color` | client | Mojang: client only. Returns the particle color for the block located in the surface below the entity (scanned up to 10 blocks down). | RP |
| `query.surface_particle_texture_coordinate` | client | Mojang: client only. Returns the texture coordinate for generating particles for the block located in the surface below the entity (scanned up to 10 blocks down) in a s... | RP |
| `query.surface_particle_texture_size` | client | Mojang: client only. Returns the texture size for generating particles for the block located in the surface below the entity (scanned up to 10 blocks down). | RP |
| `query.swelling_dir` | entity | Returns the swelling direction of the entity if it makes sense, else it returns 0.0. | RP |
| `query.swell_amount` | entity | Returns how swollen an entity is. | RP |
| `query.swim_amount` | entity | Returns the amount the current entity is swimming. | RP |
| `query.tail_angle` | entity | Returns the angle of the tail of the entity if it makes sense, else it returns 0.0. | RP |
| `query.target_x_rotation` | entity | Returns the x rotation required to aim at the entity's current target if it has one, else it returns 0.0. | RP |
| `query.target_y_rotation` | entity | Returns the y rotation required to aim at the entity's current target if it has one, else it returns 0.0. | RP |
| `query.ticks_since_last_kinetic_weapon_hit` | entity | Returns the number of ticks elapsed since the user last hit something while using a kinetic weapon. | RP |
| `query.timer_flag_1` | entity | Returns 1.0 if behavior.timer_flag_1 is running, else it returns 0.0. | RP |
| `query.timer_flag_2` | entity | Returns 1.0 if behavior.timer_flag_2 is running, else it returns 0.0. | RP |
| `query.timer_flag_3` | entity | Returns 1.0 if behavior.timer_flag_3 is running, else it returns 0.0. | RP |
| `query.time_of_day` | world | Returns the time of day (midnight=0.0, sunrise=0.25, noon=0.5, sunset=0.75) of the dimension the entity is in. |  |
| `query.time_since_last_vibration_detection` | client | Mojang: client only. Returns the time in seconds since the last vibration detected by the entity. | RP |
| `query.time_stamp` | world | Returns the current time stamp of the level. | RP |
| `query.total_emitter_count` | client | Returns the total number of active emitters in the world. |  |
| `query.total_particle_count` | client | Returns the total number of active particles in the world. |  |
| `query.touch_only_affects_hotbar` | client | Mojang: client only. Returns 1.0 if the touch input only affects the touchbar, otherwise returns 0.0. |  |
| `query.trade_tier` | entity | Returns the trade tier of the entity if it makes sense, else it returns 0.0. | RP |
| `query.variant` | entity | Returns the entity's variant index. | BP, RP |
| `query.vertical_speed` | entity | Returns the speed of the entity up or down in meters/second, where positive is up. | RP |
| `query.walk_distance` | client | Returns the total distance traveled by an entity while on the ground and not sneaking. | RP |
| `query.wing_flap_position` | entity | Returns the wing flap position of the entity, or 0.0 if this doesn't make sense. | RP |
| `query.wing_flap_speed` | entity | Returns the wing flap speed of the entity, or 0.0 if this doesn't make sense. | RP |
| `query.yaw_speed` | entity | Returns the entity's yaw speed. |  |

## 3. Semantics that matter for parity

- Numbers. Every value is a float (`Molang.html` "Values"). The engine's floats are 32-bit: `IntroductionToEntityProperties.md` warns that incrementing an `int` property "will fail when the value exceeds about 16.7 million" because "Molang expressions are evaluated as float values", and 16,777,216 is the float32 integer limit. A JavaScript evaluator using doubles diverges only above that range; `Math.fround` on arithmetic results would match exactly at a cost. No Molang operator does integer division; `/` is float division and division by zero yields 0.0.
- Truthiness. 0.0 is false; anything else is true. Comparison and logical operators return 1.0 or 0.0. `!` of a nonzero value is 0.0.
- Strings. Single quoted, no escapes, case preserved, `==` and `!=` only. `'text' + 1` is a content error since 1.17.40. Vanilla compares `query.block_state('minecraft:cardinal_direction') == 'east'`, so block state enum values must compare as strings and booleans as 0.0/1.0 (`query.block_state('custom:is_lit') == true` in `BlockStatesAndPermutations.md`).
- Undefined variables. Without `??` the docs describe a content error and a 0.0 result ("Errors (such as divide by zero, missing variables, null references, etc) generally return a value of 0.0"). `query.property` on a missing property "will send a content error message and return 0" (`IntroductionToEntityProperties.md`).
- `->` short-circuits: a null or dead left side returns 0 without evaluating the right side.
- `loop` is capped at 1024 iterations. `break` and `continue` apply to the innermost loop; a `return` inside a loop body ends the whole expression (bridge-core's test `v.x = 2; loop(10, { return 1; }); return v.x;` expects 1).
- Array indices: C-style cast to int, negative clamps to 0, large wraps by size.
- Randomness. `math.random`, `math.random_integer`, `math.die_roll` and `math.die_roll_integer` are documented as random with no seed, so each evaluation draws a fresh value. Vanilla uses them for experience (`on_bred`, `on_death`) and for two feature-rule offsets. Nothing in either text says a feature rule's random is derived from the world seed; `query.get_level_seed_based_fraction` exists for that purpose ("Returns a value in range [0.0, 1.0] based on the level seed", format version 1.26.10 or later) and vanilla does not use it. A server that wants reproducible worldgen can seed its own generator per chunk and still satisfy the docs.
- `query.noise`: the Learn page says "Queries a Perlin Noise Map. Pertains to terrain generation."; the HTML says "Returns a Perlin simplex noise value for the given (x, z) position." Neither gives the range, octaves or seed. Vanilla thresholds it at `-0.8` and multiplies `(noise + 0.3) * 160`, which only makes sense for a range near [-1, 1]. Exact parity with vanilla bamboo density is not reachable from the docs.
- `query.heightmap` returns "the heightmap value at the given (x, z) position" and `query.above_top_solid` "the height of the block immediately above the highest solid block"; which heightmap (world surface, motion blocking, ocean floor) is unstated. Vanilla puts features at `heightmap`, `heightmap + 32`, `heightmap * 2`, and `max(above_top_solid, heightmap - 4)`.
- Trigonometry is in degrees for `sin` and `cos`; `lerprotate` and `min_angle` are in degrees. The 30 easing functions and `inverse_lerp` require format version 1.21.120.
- Rounding: `math.round` "to nearest integral number" without a tie rule; `math.trunc` toward zero; `math.sign` "1 if value is positive, -1 otherwise", so 0 gives -1 by the letter of the text.
- `math.mod`: "remainder of value / denominator" with no sign rule. C's `fmod` (sign of the dividend) is the reading consistent with "modeled on the C math library" (syntax guide "Math Functions").
- Evaluation order and caching. Statements run in order; `temp.` lives for one execution. Feature rules evaluate `scatter_chance` once per rule per chunk and `x`, `y`, `z` once per iteration in `coordinate_eval_order` (default `xzy`), "Should be used when a coordinate depends on another" (`feature_rule_definition.md`). `set_property` values are "calculated immediately" and applied "the next time the entity ticks"; int and float properties clamp to their `range` "without any warning or error" (`IntroductionToEntityProperties.md`). `pre_animation` scripts run once per render tick on the client; nothing in the docs describes server-side caching of query results.

## 4. Filters are not Molang

Entity filters are JSON objects, not expressions. `FilterList.md` lists 108 tests (`has_component`, `is_family`, `is_biome`, `clock_time`, `bool_property`, `enum_property`, ...). Each test object has `test`, an optional `subject` (`self`, `other`, `target`, `parent`, `player`, `damager`, `block`), an optional `operator` (`==`, `=`, `equals`, `!=`, `<>`, `not`, `<`, `<=`, `>`, `>=`; `Definitions/NestedTables/operator.md`), and a `value`; `all_of`, `any_of` and `none_of` nest them (`Filters/has_component.md`). The `value` is a literal, never an expression. Spawn rules (`biome_filter`, `brightness_filter`, `difficulty_filter`, ...) and feature rules (`minecraft:biome_filter`) use the same object form.

Where the two meet: components take filters for who or when (`minecraft:entity_sensor.subsensors[].event_filters`, `minecraft:environment_sensor.triggers[].filters`, `minecraft:interact.interactions[].on_interact.filters`, event `filters`) and Molang for how much (`experience_reward`, `heartbeat.interval`, `rotate_rider_by`, `success_chance`). Entity properties are readable by both: Molang through `query.property`, filters through `bool_property`, `int_property`, `float_property`, `enum_property` and `has_property`; Molang writes them through `set_property` (`IntroductionToEntityProperties.md`, "Entity Properties can be read by two systems to affect how the game behaves: Molang and Filters"). The breeze's `environment_sensor` in `minecraftComponent_environment_sensor.md` shows a `bool_property` filter and `on_ground` test side by side with no Molang. An implementation needs a filter evaluator and a Molang evaluator as two modules sharing the entity property store.

## 5. Existing implementations

| Project | Language, license | Commit read | Approach | Coverage gaps against sections 1 and 3 |
|---|---|---|---|---|
| bridge-core/molang (npm `molang` 2.0.1, 2022-08-25, repo URL still `solvedDev/MoLang`; `@bridge-editor/molang` 2.0.2, 2024-05-23) | TypeScript, MIT | `8b4c2bafc502eeab2d7ea414d95b2ac23e5eb9ae` (2025-10-11) | Pratt parser (`lib/parser/parse.ts`), tree-walking AST with static folding, expression cache of 256 entries flushed whole when full (`lib/MoLang.ts`) | `EPrecedence` (`lib/parser/precedence.ts`) orders `AND = 7` below `OR = 8` and both parselets use `parseExpression(this.precedence)`, so `\|\|` binds tighter than `&&`: the pre-1.18.20 rule. `??` (`6`) binds tighter than the ternary (`4`); Mojang ranks it lowest. Math table (`lib/env/math.ts`) spells `math.lerp_rotate`, omits `sign`, `copy_sign`, `inverse_lerp` and all 30 easings, and `dieRoll` never increments its counter (`while (i < sum) total += random(low, high)`), so `math.die_roll(n, ...)` with n > 0 never returns; vanilla calls it from three `on_death` expressions. `random_integer` is `Math.round(low + Math.random() * (high - low))`. No `this`, no version switch, no `Legacy Molang Expression` object. Only `query.all`, `any`, `count`, `in_range` built in. 12 `any` in `lib/`; environment is `Record<string, unknown>` flattened to dotted keys. Tests: one table of about 90 expressions (`__tests__/tests.ts`) plus six small files. Has `->` (`ContextSwitchExpression`), `loop`, `for_each`, `break`, `continue`, arrays, scopes, `#` comments (not in the spec). |
| JannisX11/molangjs (npm `molangjs` 1.7.1, 2026-09-17) | JavaScript, MIT; a 25-line `types/index.d.ts` | `0b17bc32fa12a94c4b77b4602f19a87f15448c04` (2026-09-18) | No tokenizer: `parse` lowercases the whole input and strips all whitespace, then splits the string on operators by bracket depth (`src/molang.js` `iterateString`); result tree is interpreted; 400-entry cache | Lowercasing and whitespace stripping alter string contents, against "strings maintain the case provided". `testOp(s, '&&', 11)` runs before `'\|\|'`, so the split happens at `&&` first and `A && B \|\| C` becomes `A && (B \|\| C)`. No `->`, `for_each`, arrays, structs, `this`, `temp.` scoping or versioning; `??` works by a flag set when a variable lookup fails. Math is complete for the 61 functions including easings (`src/easing.js`). `randomInt` draws uniformly over the inclusive range; `lerp` does not clamp. 46 assertion lines in `tests.js`, run as a script. |
| unnamed/mocha | Java 8+, MIT | `eac679c71a1c4211ccf5ec2ff9a31b25c52e7509` (2025-03-14) | Lexer, parser, interpreter, and a compiler to JVM bytecode (`runtime/MolangCompiler.java`); 91 source files, 26 test files; case-insensitive maps | Not usable from TypeScript; useful as a reference for the compile-once design. Feature list not verified beyond file names. |
| Ocelot5836/molang-compiler | Java, MIT | `bcb00f25c1438a4af29203458f0e9f788e839bc0` (2025-04-21) | Bytecode compiler for per-frame use | README "Limitations": no structs, arrays, strings, `->`, `for_each`, or `??` inside loops; adds non-spec `+=`, `++`, `math.triangle_wave`. |
| arexon/nolana | Rust, MIT | `7dcd2709e225005b5d394b668a4c26bf7495f413` (2026-03-06) | Parser, AST, semantic checker, code generator; no evaluator | AST (`src/ast.rs`) covers loop, for_each, arrow, array access, resource expressions, `this`, ternary and binary conditional, plus non-spec update operators. The most complete grammar read for this note; a good cross-check for a parser's test corpus. |
| ConcreteMC/MolangSharp | C#, MPL-2.0 | `fd08e2ccf0754f79d2dcfd05d16f5ef28089fee3` (2026-08-07) | Runtime ported from bedrockk/MoLang (Java, GPL-3.0) | Not read in depth; license mix matters if anything were ported. |
| hollow-cube/mql | Java, MIT | `f68420b12eb1bc870e2836f19b3189a12821db9b` (2024-07-30) | Interpreter and JIT for "a subset of MoLang" | README: queries and math/comparison operators only; temp variables listed under future plans. |
| JannisX11/molang_rs | Rust, MIT | `275c367452301db71800a4b181957db1773859e4` (2023-02-25) | Port of molangjs | README: "Experimental and work in progress!" |
| Blockception/BC-Minecraft-Molang | TypeScript, BSD-3-Clause | `f2dc986542b2c2e7ca88cfa700e50ef8be7e207a` (2025-09-28) | Data and syntax helpers for a language server, not an evaluator | README: archived, moved into `Blockception/minecraft-bedrock-language-server`. |

Peer servers do not evaluate Molang. AllayMC/Allay's `server/.../utils/MolangUtils.java` "builds client Molang conditions that select block-state permutations" for custom blocks sent to clients, and its `MOLANG_VERSION = 1` is a wire field; df-mc/dragonfly's `server/block/customblock/permutations.go` and PowerNukkitX's `MolangDescriptor` serve the same wire purposes (file names from GitHub code search; only Allay's header was read). EndstoneMC/endstone mirrors BDS's `MolangVersion` enum and `MolangVariableMap` because it hooks the official binary.

Recommendation: write one. The two JavaScript libraries get the 1.18.20 precedence wrong, which is the one language rule that changes results, and neither models versions, `this` (vanilla uses it), or the `Legacy Molang Expression` object. bridge-core would also need its math table fixed and 12 `any` sites replaced to pass this repository's rule against `as` casts and `any`. The vanilla server-side subset is small (21 queries, 7 math functions, single-statement expressions), so a complete parser plus a tested evaluator is a smaller task than auditing and patching a dependency. nolana's AST and molangjs's `easing.js` are useful references under MIT.

## 6. Design input

Environment. Bind one `MolangScope` per evaluation with: the entity (for `query.*` entity queries, `variable.*` storage, `this`), an optional block permutation (`query.block_state`, `query.has_block_state`, `query.block_face`), an optional item stack (`query.max_durability`, `query.remaining_durability`, `query.any_tag`, `query.all_tags`, `query.is_item_name_any`), the world or dimension (`query.time_of_day`, `query.day`, `query.moon_phase`, `query.moon_brightness`, `query.time_stamp`, `query.get_level_seed_based_fraction`), and a placement context for feature rules (`query.heightmap`, `query.above_top_solid`, `query.noise`, `query.has_biome_tag` with its `(tag)`, `(tag, x, z)` and `(tag, x, y, z)` forms per the HTML, `has_any_biome_tags`, `has_all_biome_tags`, plus the engine variables `variable.worldx`, `worldz`, `originx`, `originz`, `is_legacy`). `context.*` is a read-only map the caller supplies per expression; vanilla needs `context.other` (the repair item, an entity-like reference for `->`). `variable.*` lives on the entity and is not persisted (docs). `temp.*` is a map created per execution. Represent values as a discriminated union of number, string, entity reference, entity array and struct, and make queries declare their required context so the loader can reject `query.block_state` in an entity field at load.

Precompile. Parse each string once when the pack loads, keyed by (expression text, Molang version); keep the AST, then compile it to a closure `(scope) => Value` with constant subtrees folded (`"query.last_hit_by_player ? 10 : 0"` folds its branches; `"Math.Random(1,7)"` cannot fold). Closures avoid `new Function` and tree-walk overhead; server volume is low (ambient-sound conditions every few seconds, experience on death, feature placement a few hundred times per chunk), so a tree-walker would also do. Do not use a whole-cache flush. Choose the version from the pack's `min_engine_version`, or from a `{ "expression", "version" }` object where the field allows one, and map it onto BDS's enumerators (section 1); implement the pre- and post-1.18.10 ternary associativity and pre- and post-1.18.20 precedence as parser options, and the 1.19.60 negative-divisor fix as an evaluator option. For operators the precedence table omits, use C ranks: unary minus with `!`; call, `->` and `[ ]` above `!`; `=` below `??` and right-associative.

Unknown identifiers. The docs say unknown tokens are a content error at parse (1.17.40) and that missing variables and other errors evaluate to 0.0 with a content error in development builds. Mirror that: at load, resolve every `query.*` and `math.*` against the registry and every `context.*` against the field's declared context; log each unknown once with pack, file and JSON path; substitute a constant 0.0 so the entity or feature still loads. Offer a strict mode for tests and CI that fails the load instead, and a parity test that asserts the registry covers the 21 queries and 7 math functions in section 2.

What to build first. The parser and evaluator with the full grammar (so resource packs and third-party behavior packs parse), the 61 math functions, the 7 pure queries, the 6 world queries, the 6 placement queries, the 21 vanilla queries, and `query.block_state`. Entity queries beyond vanilla's 21 can be added as the components that back them land.

## Open questions

- `query.noise` range, octaves and seed are unspecified; vanilla bamboo and sea pickle densities depend on them.
- Which heightmap `query.heightmap` and `query.above_top_solid` read is unspecified.
- Whether the engine applies a Molang version to the server-root `definitions/` files, which have no manifest.
- Whether feature-rule `math.random` is seeded from the world seed, and how a float `iterations` such as `Math.Random(48, 96)` is rounded; the docs do not say.
- `math.round` tie rule, `math.mod` sign, `math.sign(0)`, `math.lerp` clamping and `math.random_integer` endpoint handling are undocumented; only the BDS binary settles them.
- Float32 versus float64: the entity-property page implies 32-bit evaluation; whether every operator rounds to float32 is not stated.
- The Learn and HTML texts disagree on the 1.20.50 versioned change; the HTML (engine-generated) is more likely correct.
- Whether the six entity files at layer roots (`vanilla_1.20.10/donkey.json` and others) are read by the engine.
- `query.get_nearby_entities` and `query.get_relative_block_state` appear in the HTML's `for_each` and `->` examples but on neither query index.

## Reproduction

```
# Pinned sources (read-only clones under /tmp/bds-research-molang)
git clone --filter=blob:none --no-checkout --depth 1 https://github.com/MicrosoftDocs/minecraft-creator.git docs/mc-creator
# sparse-checkout creator/Documents/molang creator/Reference/Content/{MolangReference,EntityReference,FeaturesReference,BlockReference,ItemReference,BiomesReference}; HEAD 4432fb62
git clone --filter=blob:none --no-checkout --depth 1 --branch v1.26.50.4 https://github.com/Mojang/bedrock-samples.git samples/bedrock-samples
# sparse-checkout documentation resource_pack/{animations,animation_controllers,render_controllers,entity,attachables,particles} behavior_pack/{entities,blocks,items,trading,loot_tables,spawn_rules,recipes}
for r in bridge-core/molang JannisX11/molangjs unnamed/mocha Ocelot5836/molang-compiler arexon/nolana ConcreteMC/MolangSharp Blockception/BC-Minecraft-Molang hollow-cube/mql JannisX11/molang_rs; do git clone --depth 1 https://github.com/$r.git libs/${r/\//_}; done

# Compose the vanilla behavior pack (later layer wins) and scan for Molang identifiers
node tools/compose.mjs /tmp/bds-research/bds/extracted/behavior_packs composed/vanilla_bp
cp -R /tmp/bds-research/bds/extracted/definitions composed/definitions
# composed/server_only: symlinks to the server-side folders plus definitions/{features,feature_rules,spawn_groups}
node tools/scan-molang.mjs composed/server_only            # tally: 537 strings, 35 identifiers
DUMP=1 node tools/scan-molang.mjs composed/server_only     # every expression with its JSON path
node tools/scan-molang.mjs samples/bedrock-samples/resource_pack   # client contrast

# Precedence table and query labels from Mojang's generated HTML
python3 -I -c 'import re,html,sys; s=open(sys.argv[1]).read(); s=re.sub(r"<[^>]+>"," ",s); print(html.unescape(s))' samples/bedrock-samples/documentation/Molang.html | grep -n -A30 "Operator Precedence"
grep -o "Available on the [A-Za-z (]*only" samples/bedrock-samples/documentation/Molang.html | sort | uniq -c

# Pack versions
for d in /tmp/bds-research/bds/extracted/behavior_packs/vanilla*; do python3 -I -c 'import json,sys; print(sys.argv[1].split("/")[-1], json.load(open(sys.argv[1]+"/manifest.json"))["header"]["min_engine_version"])' $d; done

# Library findings cited above
sed -n 1,20p libs/bridge-core_molang/lib/parser/precedence.ts
grep -n "while (i < sum)" libs/bridge-core_molang/lib/env/math.ts
grep -n "toLowerCase().replace" libs/JannisX11_molangjs/src/molang.js
```
