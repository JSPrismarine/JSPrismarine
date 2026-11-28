---
'@jsprismarine/packs': patch
'@jsprismarine/prismarine': patch
---

Install resource, behavior and world template packs whose manifest has `format_version` 3, such as Better Animations. The server used to refuse them with "format_version must be 2". `parseManifest` now takes 2 or 3 and reads format 3's SemVer string versions, dropping a pre-release or build suffix such as `-beta`. `Manifest.formatVersion` is the manifest's own value instead of always 2.
