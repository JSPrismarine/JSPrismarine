---
'@jsprismarine/prismarine': minor
---

A chunk generation task carries its dimension as a `PipelineDimension`, the id, Bedrock id, floor
and height, instead of the whole `DimensionType` with its Java definition and attributes map.
`PipelineKey.dimension` is that record, `pipelineDimensionOf` builds one, and
`DataDrivenGenerator.forStem` takes a `StemKey` whose dimension is still the full type, so the
chunks it hands back keep the type their stem was built with. Code that typed a key passed to
`forStem` as `PipelineKey` has to type it as `StemKey`. The generated chunks do not change.
