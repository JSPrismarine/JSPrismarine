---
'@jsprismarine/prismarine': patch
'@jsprismarine/errors': patch
---

The `JSP_JAVA_PORT` environment variable sets the Java Edition port in place of `java-port` from `config.json`, and `0` lets the operating system choose a free one. A value that is not a TCP port throws `JavaPortEnvInvalid`.
