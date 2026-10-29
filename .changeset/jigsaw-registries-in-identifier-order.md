---
'@jsprismarine/bedrock-data': patch
---

Write the captured jigsaw structure rules with their four registries in identifier order. The
engine serializes `template_pools` out of an unordered container, so two captures of one server
carried the same 64 pools in a different order and the committed golden was byte stable only by
luck. Reordering is invisible to a client - every entry names itself in `description.identifier`,
and every reference between the registries is that name rather than a position - so the payload a
server replays is unchanged apart from the order of whole entries, and a recapture of an unchanged
server is now an empty diff.
