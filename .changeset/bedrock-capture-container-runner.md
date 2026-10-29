---
'@jsprismarine/bedrock-data': patch
---

Run the Bedrock capture in a Linux x86-64 container on hosts where Mojang's server binary cannot
run, so `dump:bedrock` works on an Apple Silicon or Linux arm64 machine. A Linux x86-64 host still
runs the binary directly, and that is what CI does. The runner is chosen from the host platform
and from whether a container daemon actually answers, and `JSP_BDS_RUNNER`,
`JSP_BDS_CONTAINER_CLI` and `JSP_BDS_CONTAINER_IMAGE` override the choice. No image carries the
server: the container mounts the staged copy from the gitignored fetch cache.
