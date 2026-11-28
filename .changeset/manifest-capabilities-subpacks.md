---
'@jsprismarine/packs': minor
---

`parseManifest` reads a manifest's `capabilities` and `subpacks`, which the returned `Manifest` now always carries, empty when the manifest lists none. Code that builds a `Manifest` itself must set both. `readContentArchive` keeps the `.key` file beside each pack of an `.mcaddon`, `<name>.key` for a nested `<name>` or `<folder>.key` for a folder, as the member's `key`.
