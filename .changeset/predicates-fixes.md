---
'@jsprismarine/predicates': patch
---

Fix four item modifier defects and match the `food` member of a player sub-predicate. Each one was
checked against the unobfuscated Java 26.3 server jar.

- `set_lore`, `set_written_book_pages` and `set_writable_book_pages` read the list operation mode
  from their own members. `ListOperation.codec` is a `MapCodec` that dispatches on a flat `mode`
  key, so these three modifiers carry `mode`, `offset` and `size` beside `lore` or `pages`. The
  parser was handing `listOperation` the value of `mode`, which then looked for a second `mode`
  inside it and fell back to `replace_all`. Every `append`, `insert` and `replace_section` use
  silently replaced the whole list instead.
- `insert` and `replace_section` leave the list unchanged when the offset is past its end, and
  `replace_section` without a `size` takes out as many entries as it puts in. The size previously
  defaulted to zero, which turned that form into an insert.
- `set_fireworks` reads its explosions from `explosions.values`. The `explosions` member is a
  `ListOperation.StandAlone`, so the list and the mode live inside it. The modifier read
  `explosions` as the list itself, which yielded nothing and cleared the component. An absent
  `explosions` member now leaves the existing explosions alone instead of clearing them.
- `furnace_smelt` multiplies the input count by the count the recipe yields and clamps the result
  to the stack size, which is what `SmeltItemFunction.run` computes. The count the recipe yields
  was dropped, so a recipe that produces more than one item smelted too few.
- The `food` member of `minecraft:type_specific/player` matches Java's `FoodPredicate`: an int
  bound on the food level and a float bound on the saturation. Both read the new `food` member of
  `EntityView`, and a view that does not report hunger makes the predicate fail with a diagnostic.
  The vanilla `lunge` enchantment uses this member, and the parser used to warn and refuse it.

`advancements`, `recipes`, `stats` and `input` on the player sub-predicate still warn. They need
per-player progression and client input state, which no host seam in this package exposes, and no
vanilla file uses them.
