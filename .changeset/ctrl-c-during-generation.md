---
'@jsprismarine/prismarine': minor
'@jsprismarine/server': patch
---

Make Ctrl+C work, including while a world is generating.

Three defects stacked up, and a terminal needed all three fixed before a keypress could stop the
server. `Console` puts stdin in raw mode, and Node's tty documentation says of `setRawMode` that
"Ctrl+C will no longer cause a SIGINT when in this mode" - the keypress arrives as stdin byte 3 and
raises nothing. readline parses that byte and answers an unhandled one by closing itself, so the
single Ctrl+C that was meant to start a shutdown instead left the server running with a console
that would never read another keystroke. The console now reads the byte off stdin directly and
counts every press in a read, since an operator at a frozen console presses more than once and the
terminal hands all of them over in one go.

`Server.shutdown` opened with `if (this.stopping) return`, so no amount of pressing could escape a
shutdown that was itself waiting on a world save behind minutes of chunk generation. A second
request now forces the exit instead, and says so. `stayAlive` callers such as `/stop` are
unaffected. `Server.releaseOnShutdown` is new, and registers work to do the moment a shutdown
begins, before it awaits anything.

The last defect was the signal handlers themselves. Node removes a signal's default disposition
once a listener is installed, and that default is the only thing that can end a process while the
event loop is blocked - which, on a server generating terrain, is most of the time. The entry point
now gives the termination signals back to the kernel as soon as a shutdown starts, so the next
Ctrl+C or `kill -INT` lands whether or not the loop is free. Measured against a server preloading a
start region: one Ctrl+C never exited at all before this, and now shuts down cleanly; a second
press exits in 0.07 s where three presses had done nothing.

A crash also now shuts down as a crash. The single handler compared its argument against the string
`'uncaughtException'`, which no listener is ever passed, so an uncaught exception exited zero.
