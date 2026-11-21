---
'@jsprismarine/console': patch
---

Make the console easier to use:

- `?` on an empty command line opens the help overlay, as the placeholder says.
- Ctrl+C stops the server from the log pane too when nothing is selected, and typing a character there starts a command.
- PgUp, PgDn, Ctrl+R, Ctrl+L and the restart chord work while the command line has focus.
- The help overlay shows every shortcut without scrolling at 80×24.
- The palette and the usage card ask for the command list again once the server runs, so a slow start no longer leaves them empty.
- While the server starts, the running step shows how long it has taken, the footer names it when the details pane is hidden, and the command line says the server is starting.
- The activity line says "Starting the server" rather than "Starting generation 1", and the help overlay and palette call the side pane "Server details", as the footer does.
