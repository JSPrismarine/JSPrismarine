---
'@jsprismarine/addon-tools': minor
'@jsprismarine/errors': patch
---

`addon.json` takes optional listing keys for the addon marketplace: `title`, `tags` from a fixed list (`ADDON_TAGS`), `authors`, `screenshots` under `media/` with alt text, `deprecated` and `replacedBy`. `jsp-addon build` leaves `media/` out of the pack, checks that `pack_icon.png` is a square PNG, and writes the README, icon and screenshots beside each pack as `<name>-<version>.md`, `.png` and `-<n>.<type>`. Each new index entry gains a `listing` that links those files with their SHA-256; the schema stays version 1, since readers drop keys they do not know. A published version whose listing files changed fails the build with `PublishedListingChanged`, as a changed pack does. `--github-output` adds a `listing` output naming the new listing files, and `isAddonInstallId` and `isAddonRepository` check install ids and repositories.
