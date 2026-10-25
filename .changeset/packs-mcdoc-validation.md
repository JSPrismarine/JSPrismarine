---
'@jsprismarine/packs': patch
'@jsprismarine/bedrock-data': patch
---

Validate Java datapack definitions against `SpyglassMC/vanilla-mcdoc`.
`@jsprismarine/packs/mcdocValidator` exports `createMcdocValidator`, which reads a vanilla-mcdoc
checkout and returns a synchronous `DefinitionValidator`; construction is asynchronous because
binding the schema modules is, so `load` stays synchronous. Findings name the JSON pointer and the
reason, and the release gates `#[since=]` and `#[until=]` fields, which matters: the 26.3 vanilla
datapack reports one finding at 26.3 and thousands at 26.1.

A vanilla-mcdoc finding is a warning by default, because the schema set trails Mojang's releases
and an error would drop the definition. At 26.3 the one disagreement is
`recipe/map_extending.json`, which vanilla ships with `"result": {}` where the schema wants an
`id`. `severity: 'error'` opts into the stricter reading.

The four `@spyglassmc` packages are optional peer dependencies and the module is not re-exported
from the package index, so the eleven workspace packages importing the loader do not pay for 91
transitive packages they never load.

`bedrock-data` pins `SpyglassMC/vanilla-mcdoc` in `sources.json`, so `fetch:sources` puts a
checkout in the cache beside the other pinned upstreams.
