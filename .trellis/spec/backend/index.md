# Backend Development Guidelines

> Best practices for backend development in this project.

---

## Overview

This directory contains the executable contracts and conventions for Temvia's generated Go API and its deployment template.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Scaffolding Contract](./scaffolding-contract.md) | CLI generation, nested seed files, Git safety, npm packing, and generated application contract | Active |
| [Identity and Access](./authentication-contract.md) | Cross-layer setup/login/recovery/RBAC/invitations, HTTP, PostgreSQL, Redis, cookie, and environment contract | Active |
| [Directory Structure](./directory-structure.md) | Feature-oriented modular-monolith boundaries and layout | Active |
| [Database Guidelines](./database-guidelines.md) | `database/sql`, direct SQL, transactions, and external migrations | Active |
| [Error Handling](./error-handling.md) | Domain/application errors and Problem Details/i18n mapping | Active |
| [Quality Guidelines](./quality-guidelines.md) | Required gates, forbidden patterns, and generated-output verification | Active |
| [Logging Guidelines](./logging-guidelines.md) | Standard-library operator logs and credential redaction | Active |

---

## How to Maintain These Guidelines

When behavior changes:

1. Update the concrete signatures, payloads, variables, or validation matrix.
2. Update the production required-file inventory and its independent test oracle together.
3. Add the exact test assertion that proves the new behavior.
4. Keep planning rationale in task artifacts; keep stable executable contracts here.

The goal is to help AI assistants and new team members understand how YOUR project works.

---

**Language**: All documentation should be written in **English**.
