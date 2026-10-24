---
'@jsprismarine/prismarine': patch
---

`PlayerSession` now remembers the container windows it opens, and `ContainerCloseHandler` closes the window on the server before answering. The answer always carries `Server Initiated Close` false, as the docs ask for a close the player made, instead of echoing whatever the client sent. A close for a window the session never opened is logged at debug level and still answered. `PlayerSession.closeWindow` is new.
