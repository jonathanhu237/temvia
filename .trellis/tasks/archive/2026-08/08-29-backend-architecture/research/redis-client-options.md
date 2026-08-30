# Go Redis Client Options

Status: go-redis v9 accepted under R37 on 2026-08-29 and pinned to v9.22.0 under R55 on 2026-08-30. No client has been installed.

## Existing Constraints

- Repository searches found no Redis client references in `template/api/` or `.trellis/spec/backend/`; there is no existing client integration to preserve.
- R32 selects Redis session storage; R34/R35 select AOF with everysec synchronization. R36 requires local AOF confirmation before successful logout, using Redis 7.2 or later.
- The user values stable APIs and selected `database/sql` for PostgreSQL under R15. A Redis client is a separate dependency choice, not a change to that decision.
- No throughput target or benchmark result establishes one client's performance advantage for Temvia. Client selection does not approve caching, automatic batching, Sentinel, or Cluster deployment.

## Comparison

| Candidate | Evidence and tradeoff |
| --- | --- |
| `github.com/redis/go-redis/v9`, accepted under R37 | Direct command methods and automatic connection pooling. Redis publishes a dedicated Go integration guide. The inspected upstream source provides `Conn` and `WaitAOF`, relevant to R36. The user accepted it for this session adapter. |
| `github.com/redis/rueidis` | Its main API uses a command builder and supports automatic pipelining, client-side caching, and dedicated connections. It is a viable alternative; those features do not establish a measured advantage for this application's session workload. Its different command/result API is the main integration tradeoff in this comparison. |

Primary references: [go-redis guide](https://redis.io/docs/latest/develop/clients/go/), [go-redis repository](https://github.com/redis/go-redis), [rueidis repository](https://github.com/redis/rueidis).

The current go-redis development branch also documents automatic pipelining and client-side caching. Do not claim these capabilities are exclusive to rueidis or silently enable them for authentication. This is a choice about integration clarity, not proof that go-redis is always faster or that rueidis cannot satisfy R36.

## Accepted Client and Proposed Dependency Boundary

The user accepted go-redis v9 under R37 and its v9.22.0 release under R55. It is not part of the Go standard library and has no standard-library compatibility guarantee. The proposed Clean Architecture boundary is a session-storage interface owned by the application, with the Redis adapter depending on go-redis; use cases should not need its client types or command objects. This boundary is a design proposal, not a selected generic Redis abstraction or a second session-store implementation. Exact interface names, method contracts, and package placement remain unresolved.

## go-redis Release: Accepted under R55

The current stable go-redis v9 tag is v9.22.0, released on 2026-08-03. It adds Redis 8.10 support and, directly relevant to R36, changes `WaitAOF` from `*IntCmd` to `*IntSliceCmd` so the client matches Redis's two-integer WAITAOF reply; the release notes say the prior type failed to parse the reply at runtime. It also changes several default timeouts/retry values and introduces experimental client-side caching and automatic pipelining. See the [go-redis v9.22.0 release notes](https://github.com/redis/go-redis/releases/tag/v9.22.0).

The user accepted pinning `github.com/redis/go-redis/v9 v9.22.0` under R55. The session adapter must use the corrected return shape, configure its required timeouts/retries explicitly instead of relying on changed defaults, and leave experimental caching and automatic pipelining disabled. The release is recent and requires integration tests around the corrected WAITAOF path; selecting it does not opt into unrelated Redis features.

## R36 Integration Checks Before Implementation

The inspected upstream source exposes `Client.Conn()` and a `Conn` type for a continuous connection, plus `WaitAOF(ctx, numLocal, numSlaves, timeout)`. These API capabilities are evidence of feasibility, not proof of correctness under reconnection or retry. See [connection source](https://github.com/redis/go-redis/blob/master/redis.go) and [WaitAOF source](https://github.com/redis/go-redis/blob/master/commands.go).

- Verify the chosen tagged release's APIs and compatibility; development-branch inspection is not a version pin.
- Verify revocation and confirmation use the same uninterrupted connection. Inspect retry/reconnect behavior; never assume using a connection wrapper by itself proves the R36 guarantee.
- Check local acknowledgement counts, bounded waits, context/socket timeout interactions, and connection release on every path.
- Cover ambiguous writes, retries after a missing-key response, and concurrent renewal without reviving revoked sessions. Keep the remaining recovery requirements in `bootstrap-auth.md` visible.

No dependency changes, services, benchmarks, or implementation tests were run for this comparison.

## Redis Container Release: Accepted under R53

The current official-image manifest publishes Redis 8.10.1 as the newest line, along with maintained 8.8, 8.6, 8.4, 8.2, 7.4, and 7.2 images. It publishes `redis:7.2.16-bookworm`; Redis 7.2.16 was released on 2026-08-17 with security fixes. See the [official Redis image manifest](https://github.com/docker-library/official-images/blob/master/library/redis) and [Redis 7.2 release notes](https://github.com/redis/redis/blob/7.2/00-RELEASENOTES).

R36 needs WAITAOF, introduced in Redis 7.2, so the session contract does not require Redis 8. Redis 7.2 and earlier use the BSD 3-Clause license. Redis 8 and later offer a choice of RSALv2, SSPLv1, or AGPLv3 and integrate additional capabilities beyond the selected session workload. See the [WAITAOF command](https://redis.io/docs/latest/commands/waitaof/) and [Redis repository licensing statement](https://github.com/redis/redis#code-contributions).

The assistant initially recommended `redis:7.2.16-bookworm` to minimize feature and licensing surface. After the user challenged why Redis 8 was excluded, the recommendation was revised for the actual constraints: this is a greenfield personal deployment with no existing Redis data or redistribution requirement established. Use `redis:8.10.1-trixie`, the current official security release, to avoid beginning on an older major and planning an earlier upgrade. It retains WAITAOF and aligns the base distribution family with the selected PostgreSQL image.

The revision does not erase Redis 8's trade-offs. Redis 8 integrates capabilities beyond the session workload and is available under a choice of RSALv2, SSPLv1, or AGPLv3 rather than Redis 7.2's BSD license. Self-use lowers the immediate practical licensing impact, but any future redistribution must explicitly review and select a license basis. The user accepted `redis:8.10.1-trixie` under R53. Pinning the patch and distro avoids floating `8` or `latest`, while later security releases still require reviewed updates. R53 is planning acceptance, not implementation approval; digest pinning, AOF command/config delivery, volume target/name, user authentication, health check, port exposure, memory limit, and eviction policy remain separate decisions.
