---
'@jsprismarine/console': patch
---

The title bar opens on a solid tile naming the server state: accent while running, warning yellow while starting, stopping or restarting, and signal once it crashed, including while it waits for a change. Without color it is drawn in reverse video. The status bar shows the state only while the title bar is hidden. The side pane draws TPS as a one-row bar graph scaled to the server's tick rate, puts the player count in the Players heading, drops the state row the tile replaces, and shows the dev section only once the server has restarted.
