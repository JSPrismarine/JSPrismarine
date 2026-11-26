---
'@jsprismarine/packs': patch
---

Add `@jsprismarine/packs/archive`, whose `readContentArchive` lists the packs and worlds an `.mcpack`, `.mcaddon`, `.mcworld` or `.mctemplate` holds. The content build now reads archives through it, so it also takes an `.mcaddon` whose packs are folders and an `.mcpack` zipped with its folder.
