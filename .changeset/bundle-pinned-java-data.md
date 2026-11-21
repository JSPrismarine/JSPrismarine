---
'@jsprismarine/server': patch
---

A packaged executable carries the Java world generation data for the release `sources.json` pins as the default. It used to carry the newest release in the packager's cache, so packaging with a Java snapshot cached, as the preview does, shipped an executable that could not generate terrain.
