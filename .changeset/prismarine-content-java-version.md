---
'@jsprismarine/prismarine': patch
'@jsprismarine/bedrock-data': patch
'@jsprismarine/errors': patch
---

Add the `content-java-version` setting, which picks the pinned Java release whose vanilla datapack the server loads. The pack stack reads that release's data pack format and data version from the generated `version.json` and loads the datapacks for it; a release that is not pinned or not generated stops startup with an error naming the pinned releases and the `datagen:java --java <release>` command. `JSP_VANILLA_DATAPACK` takes precedence: when it is set, the server loads that datapack whatever release `content-java-version` names, checks only that the named release is pinned, and skips the check that its data is generated. Each level records the release's data version in `level.dat` as `JSPrismarineJavaDataVersion` and refuses to open a world saved under a newer one. `@jsprismarine/bedrock-data/sources` exports `pinnedJavaReleases`.
