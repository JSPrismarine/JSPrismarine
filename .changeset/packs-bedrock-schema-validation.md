---
'@jsprismarine/packs': patch
---

Validate Bedrock definitions against Mojang's published JSON schemas. `readBedrockSchemas` reads
`metadata/json_schemas` out of a bedrock-samples checkout, `bedrockSchemaValidator` checks each
definition against the document for its registry and `format_version`, and `composeValidators`
joins it to the structural checks rather than replacing them. A file picks its schema by the
engine's own rule, the same version or the closest one that is not greater, so a file older than
every published schema checks against none. Six registries have a published root document; the
other five keep the structural checks alone.

The schemas load with one repair: every `oneOf` reads as `anyOf`. Mojang's generator writes variant
unions as `oneOf` and the variants overlap, so `Filter Group` and `Block Descriptor` admit no value
at all when read literally, and the vanilla behavior pack reports 347 violations that are all
wrong. With the repair both vanilla corpora, the bedrock-samples publication and the composed BDS
layers, validate with zero schema diagnostics, strict mode included.
