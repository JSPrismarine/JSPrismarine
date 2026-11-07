---
'@jsprismarine/console': patch
---

Copy and paste work in the console on more terminals. Cmd+C and Ctrl+Shift+C copy the selected log text or the selected command line text whichever pane has focus, and a finished mouse selection is copied at once, because many terminals keep Cmd+C for themselves while mouse reporting is on. Copies go to the system clipboard as well as to the terminal with OSC 52, so they work in terminals without OSC 52, and over SSH they go to the terminal only. Cmd+V and Ctrl+Shift+V paste the clipboard for terminals that send them as keys. A pasted block of several lines becomes one line with spaces between the lines, where it used to run the lines together.
