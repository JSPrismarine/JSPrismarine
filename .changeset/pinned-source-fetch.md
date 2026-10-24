---
'@jsprismarine/bedrock-data': patch
---

Add `sources.json`, a manifest pinning the upstream data sources (the BDS 1.26.51.1 zip, Mojang/bedrock-samples v1.26.50.4, the Java Edition 26.3 server jar and GeyserMC/mappings), and a `fetch:sources` script that downloads them into `node_modules/.cache/jsprismarine/`, verifies each hash before unpacking, and writes `pack-hashes.json` with a sha256 per top-level folder. Environment overrides (`JSP_BDS_PATH`, `JSP_JAVA_JAR_PATH`, `JSP_BEDROCK_SAMPLES_PATH`, `JSP_GEYSER_MAPPINGS_PATH`) point at local copies for offline work.
