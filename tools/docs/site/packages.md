---
title: Packages
description: Every package JSPrismarine publishes to npm.
outline: false
pageClass: is-wide
aside: false
---

<script setup>
import { data as project } from './project.data.mts';
</script>

# Packages

JSPrismarine publishes the server as {{ project.packages.length }} packages on npm. Take the ones you
need: each has an API reference, a README and its npm page. Install one with `pnpm add`, for example
`pnpm add @jsprismarine/nbt`.

<PackageDirectory :packages="project.packages" :repository-url="project.repositoryUrl" />
