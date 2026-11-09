---
title: Releases
description: What changed in each JSPrismarine release.
outline: false
---

<script setup>
import { data } from './releases.data.mts';
</script>

# Releases

Every server package ships at the same version, so one set of notes covers the server and its
packages. These notes come from the server's changelog. The newest {{ data.releases.length }} of
{{ data.totalReleases }} releases are below; the <a :href="data.changelogUrl">full changelog</a> has the rest.

<ReleaseNotes :releases="data.releases" />
