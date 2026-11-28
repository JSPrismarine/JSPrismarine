---
'@jsprismarine/prismarine': patch
---

An addon the server installs as it starts, such as an `.mcaddon` dropped into `addons/`, no longer logs that its blocks, items or entities load when the server restarts. The content build that follows loads them on that same start. An addon installed while the server runs still says so.
