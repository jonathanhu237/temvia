# Password Storage Options

Researched: 2026-08-29. Email/password login and explicit login after setup are accepted under R26 and R28. The user accepted Argon2id under R29 and golang.org/x/crypto/argon2 with project-owned hashing/verification integration under R30. Work factors and storage encoding remain unresolved. No implementation or benchmarking has run.

## Repository and User Constraints

`template/api/go.mod` specifies Go 1.27.0 and has no third-party dependencies. The API currently only serves health checks; there is no existing password-storage contract. `.trellis/spec/backend/database-guidelines.md` is a placeholder. The user values standard-library API stability and requires discussing technical selections before accepting them.

The user identified bcrypt as a previously used solution and asked why it was not the recommendation. Familiarity was considered in the comparison; after the explanation, the user accepted Argon2id under R29.

Password verification should not require recovering the plaintext password. The planned database representation needs a password hash and the metadata necessary to verify it, with a fresh random salt, rather than plaintext or reversible password encryption. Salt and cost metadata are not substitutes for the password's secrecy. The exact representation remains a design question.

## Algorithm Comparison

| Algorithm | Evidence | Trade-off |
| --- | --- | --- |
| Argon2id, accepted under R29 | OWASP prefers it for new password storage. It has memory, iteration, and parallelism parameters. Go's `golang.org/x/crypto/argon2` exposes `IDKey`. | The selected Go implementation under R30 is outside the standard library and requires deliberate memory/concurrency limits. The low-level API requires caller-supplied salt and parameters; it is not a complete encoded-password storage and comparison helper. |
| PBKDF2 | Available in the project's Go generation through the standard-library `crypto/pbkdf2` package. OWASP especially recommends it where relevant FIPS requirements apply. | Fits the user's standard-library preference. Still requires appropriate iteration/hash choices, salt, encoded metadata, and verification handling; selecting a standard-library API does not itself select secure parameters or establish FIPS compliance. |
| bcrypt | Go's `golang.org/x/crypto/bcrypt` provides password-hash generation and comparison helpers. Its generator rejects passwords longer than 72 bytes. OWASP positions it for legacy use when Argon2/scrypt are unavailable. | Convenient password-specific API, but not a standard-library option, and its byte limit needs an explicit password policy. Do not describe it as universally broken or silently truncate passwords. |

Sources: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [Go Argon2 API](https://pkg.go.dev/golang.org/x/crypto/argon2), [Go standard-library PBKDF2](https://pkg.go.dev/crypto/pbkdf2), [Go bcrypt API](https://pkg.go.dev/golang.org/x/crypto/bcrypt).

## Why Recommend Argon2id over bcrypt Here?

- The relevant threat is offline guessing after password hashes leak. bcrypt increases computational work through its cost setting; Argon2id also exposes a tunable memory cost, increasing the resources needed for parallel guesses. This is not a claim that bcrypt uses no memory, that Argon2id prevents cracking, or that a measured performance ratio exists for this project. See [RFC 9106](https://www.rfc-editor.org/rfc/rfc9106.html).
- Go's bcrypt generator rejects input above 72 bytes, not 72 characters. UTF-8 passwords can reach that boundary with fewer characters. Argon2id avoids that particular boundary, but application input and resource limits are still necessary. Do not truncate passwords or invent a pre-hashing workaround.
- There are no existing bcrypt hashes in this application to preserve. The recommendation follows OWASP's preference for Argon2id in new applications; it does not characterize bcrypt as broken.
- bcrypt has a genuine integration advantage: the discussed Go package supplies generation and comparison helpers. The low-level Go Argon2 package instead requires a separate encoding, parsing, and verification layer, whether implemented or supplied by an evaluated wrapper. Both packages are outside the standard library.
- Argon2id's memory cost also applies to legitimate verification. Container memory and concurrent login attempts must inform tuning. bcrypt still needs cost tuning and abuse controls. The algorithm comparison did not select settings or a wrapper; the later implementation decision is recorded under R30 below.

## Go Implementation Options

The repository has no existing password helper to reuse. After accepting the algorithm under R29, the user selected direct use of the Go package with project-owned integration under R30.

| Approach | Evidence and trade-off |
| --- | --- |
| Use `golang.org/x/crypto/argon2` directly behind a project-owned password helper; accepted under R30 | `IDKey` performs Argon2id computation. The project owns random-salt generation, encoded storage, strict parsing and parameter bounds, and constant-time hash comparison. This avoids an additional wrapper dependency and allows an explicit resource policy, but that security-sensitive integration must be maintained and tested by the project. It does not mean implementing the cryptographic algorithm. |
| Add `github.com/alexedwards/argon2id` | Its README documents a wrapper over the same Go implementation, secure random salts, encoded hashes, `CreateHash`, and `ComparePasswordAndHash`. It reduces application-owned plumbing at the cost of another dependency. The exact version, parameter-bound behavior, and compatibility still need review before acceptance; a convenience wrapper does not settle application resource policy. |

Sources: [Go Argon2 API](https://pkg.go.dev/golang.org/x/crypto/argon2), [alexedwards/argon2id README](https://github.com/alexedwards/argon2id).

The accepted project helper will expose hashing and verification operations; its exact package location and API remain design details. Salt generation and comparison can use standard-library facilities. No package has been installed. R30 does not select concrete Argon2id parameters or a storage encoding, and the alternative third-party wrapper is not selected.

## Accepted Algorithm and Pending Decisions

The user accepted Argon2id for the new application under R29 and golang.org/x/crypto/argon2 with project-owned integration under R30. PBKDF2, bcrypt, and alexedwards/argon2id remain comparison evidence, not selected implementations or fallback algorithms. Package selection does not authorize installation or implementation before the final planning approval.

With the algorithm and implementation boundary selected, resolve the encoded format and safe parsing, random-salt generation, comparison, accepted parameter bounds, and login concurrency before implementation. A corrupted or untrusted encoded hash must not control unbounded memory allocation. Resource settings need validation against the intended container limits on Centaurus; no local performance measurements or runtime tests have been performed. Do not copy a documentation example's resource settings as this project's unreviewed default.

Algorithm choice does not authorize forgot-password features, legacy-hash migration support, or any new authentication scope. R27 still defers recovery.

## User Password Input Policy: Accepted under R47

Password input length and character rules are a product contract, while Argon2id memory, iteration, and parallelism settings are server resource parameters. They must be decided and validated separately. A maximum user-password length also does not replace HTTP request-size limits or login throttling.

NIST SP 800-63B currently requires at least 15 characters when a password is the single authentication factor, recommends supporting at least 64 characters, accepting spaces and Unicode, applying NFC normalization when Unicode is accepted, and avoiding character-composition rules. It also recommends password-manager/autofill and paste support and rejects arbitrary periodic password changes. OWASP's authentication guidance reflects the same 15-character threshold when MFA is absent, at-least-64 maximum support, no silent truncation, and no composition restrictions. See [NIST SP 800-63B password verifiers](https://pages.nist.gov/800-63-4/sp800-63b.html#passwordver) and [OWASP password strength controls](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#password-strength-controls).

The user accepted 15 through 128 Unicode code points after NFC normalization under R47, including spaces and symbols, with no uppercase, lowercase, digit, or symbol quota. Setup and login normalize identically before hashing or verification. The application does not trim whitespace, collapse repeated characters, or silently truncate, and the browser allows paste/autofill. The 128-code-point ceiling supports long passphrases beyond the recommended 64-character floor while bounding pathological credential input. Screening against common or compromised passwords, password-change behavior, request-size limits, and Argon2id server parameters remain separate decisions.

## Common and Compromised Password Screening: Declined under R48

NIST requires comparing a prospective password as a whole against a blocklist of commonly used, expected, or compromised values and explains that excessively large lists provide limited incremental benefit when failed attempts are also throttled. It does not recommend rejecting arbitrary substrings. See [NIST SP 800-63B password verifiers](https://pages.nist.gov/800-63-4/sp800-63b.html#passwordver).

Two feasible delivery models have different operational contracts:

- An online breach-password range API offers broader and more frequently updated coverage. HIBP's Pwned Passwords API sends the first five SHA-1 characters and returns matching suffixes through a k-anonymity design, supports response padding, and also makes its entire corpus downloadable. The plaintext password is not sent, but the call still reveals a hash prefix, requires external network availability, and creates timeout/failure semantics during one-time setup. See [HIBP Pwned Passwords API](https://haveibeenpwned.com/API/v3#PwnedPasswords).
- A finite versioned blocklist packaged with the application works without external services and has deterministic release behavior, but its coverage becomes stale and the project must select a licensed source, data size, delivery format, update cadence, and lookup implementation. Downloading HIBP's full corpus is not proposed because it contains hundreds of millions of entries and is disproportionate to this personal deployment.

The assistant recommended the offline model because R10 requires both private-network and public-internet initialization, but the user declined weak-password-list scope under R48 because of its sourcing, licensing, packaging, and update complexity. The first milestone therefore performs neither local blocklist comparison nor an online breach-password query. Retain the accepted R47 input policy and Argon2id storage, while accepting that a known common password meeting R47 can be selected. This deferral does not remove the separate need for login throttling. A future enhancement must be reviewed rather than silently adding a corpus, dependency, or external request.

## Argon2id Resource Profile: Accepted under R49

OWASP lists 19 MiB, two iterations, and parallelism one as its minimum Argon2id configuration and says the appropriate work factor depends on the deployment hardware; as a general rule, one hash should take less than one second. RFC 9106's memory-constrained recommended profile uses 64 MiB, three iterations, and four lanes. These are reference profiles, not measurements of this repository or its target host. See [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#argon2id) and [RFC 9106 parameter selection](https://www.rfc-editor.org/rfc/rfc9106.html#section-4).

The selected low-level Go API has no default parameters: `IDKey(password, salt, time, memory, threads, keyLen)` requires the caller to supply each value. Its official package documentation repeats RFC 9106's first profile of 2 GiB, one iteration, and four threads and its lower-memory second profile of 64 MiB, three iterations, and four threads. See [Go Argon2 IDKey documentation](https://pkg.go.dev/golang.org/x/crypto/argon2#IDKey).

The assistant withdrew the earlier custom combination of 64 MiB, three iterations, and parallelism one, and the user accepted RFC 9106's second profile exactly under R49: `m=65536` KiB, `t=3`, and `p=4`. This avoids inventing a hybrid cost profile, while using up to four CPU lanes and 64 MiB of working memory per setup or login calculation. Use fixed versioned parameters rather than startup auto-tuning. Benchmark the selected profile on the intended deployment target before release and require a hash/verification operation to remain below one second; if that gate fails, revise the profile through an explicit design change instead of silently weakening it at runtime. Login/session validation after authentication does not execute Argon2id. No benchmark has run and the API container memory limit is not selected; R49 is planning acceptance, not implementation approval.

PHC encoding, salt and tag lengths, parsing ceilings, stored-parameter compatibility, future rehash behavior, per-instance concurrent-hash limits, and backpressure remain separate decisions. A future concurrency limit also does not replace rate limiting by source/account or bounded HTTP request handling.

## Argon2id Storage Encoding: Accepted under R50

The selected Go package returns raw derived-key bytes and does not create a password-record string. A password record must retain the algorithm, Argon2 version, cost parameters, salt, and derived tag so verification can reproduce the calculation and future versions can recognize older profiles.

Two shapes are feasible. Separate PostgreSQL columns make each field directly constrained and queryable but couple future algorithm/profile evolution to schema changes. One PHC-format string keeps the record self-describing and portable in a single `password_hash` column but makes strict application-owned encoding and parsing security-sensitive. The Password Hashing Competition string format represents Argon2 records in the familiar form `$argon2id$v=19$m=65536,t=3,p=4$<salt>$<tag>`. See the [PHC string format specification](https://github.com/P-H-C/phc-string-format/blob/master/phc-sf-spec.md).

The user accepted the PHC shape under R50 with Argon2 version 19, R49's accepted parameters, a fresh independent 16-byte salt from Go's [`crypto/rand`](https://pkg.go.dev/crypto/rand), and a 32-byte derived tag. Encode salt and tag with unpadded standard Base64 and store the complete value as PostgreSQL `text`. The salt is public uniqueness data rather than another secret; 16 random bytes prevent equal passwords from producing equal stored records. The 32-byte tag follows RFC 9106's recommended 256-bit tag size. See [RFC 9106 parameter selection](https://www.rfc-editor.org/rfc/rfc9106.html#section-4).

Before invoking Argon2id, parsing must bound the total encoded length, require an explicitly supported algorithm/version/profile, decode exact salt and tag lengths, and reject malformed or excessive numeric values. This prevents a corrupted or attacker-influenced database value from requesting unbounded memory. Compare the computed and stored tags with a standard-library constant-time comparison. If a future version explicitly supports an older profile, a successful login can rehash with the then-current profile; never accept arbitrary stored parameters merely because they parse. Exact parser API and maximum encoded length remain implementation design. R50 is planning acceptance, not implementation approval.
