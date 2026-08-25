# Container image lock

AW-007 resolves application and local dependency images by immutable digest.

| Purpose | Immutable image |
|---|---|
| Application build/runtime | `node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d` |
| Local PostgreSQL | `postgres:17.11-bookworm@sha256:84560e3b9c6874893fc4e2854f5dc3e7c1a37bc9d1dfd7a8c641310ae22ba5ad` |
| Local S3 compatibility tests | `rustfs/rustfs:1.0.0-rc.3@sha256:800cf3f352a0a27e3275ca854a51f0027975d7acc7a0d52089a35bcc9fcbf0b5` |

RustFS `1.0.0-rc.3` is a pre-release used only for local S3-compatible testing. It is not an approved production storage service. Production storage remains the managed S3-compatible service selected by M1-OPS procurement.
