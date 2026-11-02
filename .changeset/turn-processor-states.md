---
"@jsprismarine/structures": patch
"@jsprismarine/prismarine": patch
---

Turn the block states structure processors introduce with the template they land in. Java turns a template's states after its processors run, so a jigsaw block's `final_state` and a rule's `output_state` face the way the building faces; this server turns the template first, so those states were placed as written and every village house got an east-facing doorstep stair and a pen gate set into the wrong wall. `ProcessorContext` now carries the placement, the jigsaw replacement and rule processors turn the states they name by it, and both template placement paths pass it.
