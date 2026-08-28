# Upstream React TypeScript baseline

This admin starter is derived from the official `create-vite@9.2.0`
`react-ts` template, verified on 2026-08-28. It is a bundled snapshot, not an
automatic upstream-update service. Project generation does not fetch or execute
create-vite, install dependencies, or start services.

## Source identity

- Versioned metadata: https://registry.npmjs.org/create-vite/9.2.0
- Published artifact: https://registry.npmjs.org/create-vite/-/create-vite-9.2.0.tgz
- Archive template prefix: `package/template-react-ts/`
- SHA-512 integrity: `sha512-Fra5Zj1DLdjGn7qG0R33bRq60da4sKjWZjrJIRtpKWJJtQEAhl7vQ3/snPjheqY7Ryzqi3pJsozIG1JRWbG3ig==`
- Archive SHA-256: `c370c3eafa839d8b16b51fbf28bf521b5beffab816ee236de5fa7e0c513a2eb4`

All 18 upstream template files are retained. Sixteen keep their exact upstream
bytes; only `package.json` and `vite.config.ts` are customized. The official
demo, counter, HTML, styles, five image/icon assets, TypeScript settings, Oxlint
configuration, and technical `README.md` are unchanged.

## Filename materialization

| Upstream archive path | Temvia template path | Generated admin path |
| --- | --- | --- |
| `_gitignore` | `_gitignore` | `.gitignore` |
| `_oxlintrc.json` | `.oxlintrc.json` | `.oxlintrc.json` |
| All other upstream files | Same relative path | Same relative path |

The Oxlint config is already materialized in the template so template-local
lint works. The ignore seed stays inert until generation so npm retains it.
There are no omitted upstream files. `UPSTREAM.md` is the sole additional
admin file; the former handwritten `src/style.css` is no longer used.

## Intentional customizations

In `package.json`:

- Change the package name to `admin`; retain `private: true`, version
  `0.0.0`, and module type.
- Add Node `>=24` and `packageManager: pnpm@11.24.0`.
- Keep the upstream `dev`, `build`, `lint`, and `preview` scripts.
  Add `check: tsc -b` to preserve Temvia's existing command.
- Replace upstream dependency ranges with these exact compatible versions:

| Dependency | Upstream range | Temvia pin |
| --- | --- | --- |
| react, react-dom | ^19.2.8 | 19.2.8 |
| @types/node | ^24.13.3 | 24.13.3 |
| @types/react | ^19.2.18 | 19.2.18 |
| @types/react-dom | ^19.2.4 | 19.2.5 |
| @vitejs/plugin-react | ^6.1.0 | 6.1.1 |
| oxlint | ^1.79.0 | 1.80.0 |
| typescript | ~6.0.2 | 6.0.3 |
| vite | ^8.2.2 | 8.2.2 |

All pins except the newly added Oxlint preserve the previous Temvia starter.
No optional type-aware lint peers or React Compiler are enabled. There is no
seed lockfile; the first install resolves transitive dependencies and creates
the consuming application's own lockfile.

In `vite.config.ts`, add only `server.host: '127.0.0.1'` and
`server.port: 5173`. Keep the official React plugin. Do not set `strictPort`:
when 5173 is occupied, Vite tries the next available port. Open the URL Vite
prints. Bind production-preview checks explicitly to loopback, for example
`pnpm preview --host 127.0.0.1`, and use its printed URL too.

## Template-specific upstream notice

The following section is reproduced verbatim from `package/LICENSE` in the
verified artifact. It applies to the upstream template files and generated
files. The initializer CLI's separate MIT license and bundled-dependency
notices are not imported; this document does not assign a project-wide
license to Temvia.

```text
# License of the files in the directories starting with "template-" in create-vite
The files in the directories starting with "template-" in create-vite and files
generated from those files are licensed under the CC0 1.0 Universal license:

CC0 1.0 Universal

Statement of Purpose

The laws of most jurisdictions throughout the world automatically confer
exclusive Copyright and Related Rights (defined below) upon the creator and
subsequent owner(s) (each and all, an "owner") of an original work of
authorship and/or a database (each, a "Work").

Certain owners wish to permanently relinquish those rights to a Work for the
purpose of contributing to a commons of creative, cultural and scientific
works ("Commons") that the public can reliably and without fear of later
claims of infringement build upon, modify, incorporate in other works, reuse
and redistribute as freely as possible in any form whatsoever and for any
purposes, including without limitation commercial purposes. These owners may
contribute to the Commons to promote the ideal of a free culture and the
further production of creative, cultural and scientific works, or to gain
reputation or greater distribution for their Work in part through the use and
efforts of others.

For these and/or other purposes and motivations, and without any expectation
of additional consideration or compensation, the person associating CC0 with a
Work (the "Affirmer"), to the extent that he or she is an owner of Copyright
and Related Rights in the Work, voluntarily elects to apply CC0 to the Work
and publicly distribute the Work under its terms, with knowledge of his or her
Copyright and Related Rights in the Work and the meaning and intended legal
effect of CC0 on those rights.

1. Copyright and Related Rights. A Work made available under CC0 may be
protected by copyright and related or neighboring rights ("Copyright and
Related Rights"). Copyright and Related Rights include, but are not limited
to, the following:

  i. the right to reproduce, adapt, distribute, perform, display, communicate,
  and translate a Work;

  ii. moral rights retained by the original author(s) and/or performer(s);

  iii. publicity and privacy rights pertaining to a person's image or likeness
  depicted in a Work;

  iv. rights protecting against unfair competition in regards to a Work,
  subject to the limitations in paragraph 4(a), below;

  v. rights protecting the extraction, dissemination, use and reuse of data in
  a Work;

  vi. database rights (such as those arising under Directive 96/9/EC of the
  European Parliament and of the Council of 11 March 1996 on the legal
  protection of databases, and under any national implementation thereof,
  including any amended or successor version of such directive); and

  vii. other similar, equivalent or corresponding rights throughout the world
  based on applicable law or treaty, and any national implementations thereof.

2. Waiver. To the greatest extent permitted by, but not in contravention of,
applicable law, Affirmer hereby overtly, fully, permanently, irrevocably and
unconditionally waives, abandons, and surrenders all of Affirmer's Copyright
and Related Rights and associated claims and causes of action, whether now
known or unknown (including existing as well as future claims and causes of
action), in the Work (i) in all territories worldwide, (ii) for the maximum
duration provided by applicable law or treaty (including future time
extensions), (iii) in any current or future medium and for any number of
copies, and (iv) for any purpose whatsoever, including without limitation
commercial, advertising or promotional purposes (the "Waiver"). Affirmer makes
the Waiver for the benefit of each member of the public at large and to the
detriment of Affirmer's heirs and successors, fully intending that such Waiver
shall not be subject to revocation, rescission, cancellation, termination, or
any other legal or equitable action to disrupt the quiet enjoyment of the Work
by the public as contemplated by Affirmer's express Statement of Purpose.

3. Public License Fallback. Should any part of the Waiver for any reason be
judged legally invalid or ineffective under applicable law, then the Waiver
shall be preserved to the maximum extent permitted taking into account
Affirmer's express Statement of Purpose. In addition, to the extent the Waiver
is so judged Affirmer hereby grants to each affected person a royalty-free,
non transferable, non sublicensable, non exclusive, irrevocable and
unconditional license to exercise Affirmer's Copyright and Related Rights in
the Work (i) in all territories worldwide, (ii) for the maximum duration
provided by applicable law or treaty (including future time extensions), (iii)
in any current or future medium and for any number of copies, and (iv) for any
purpose whatsoever, including without limitation commercial, advertising or
promotional purposes (the "License"). The License shall be deemed effective as
of the date CC0 was applied by Affirmer to the Work. Should any part of the
License for any reason be judged legally invalid or ineffective under
applicable law, such partial invalidity or ineffectiveness shall not
invalidate the remainder of the License, and in such case Affirmer hereby
affirms that he or she will not (i) exercise any of his or her remaining
Copyright and Related Rights in the Work or (ii) assert any associated claims
and causes of action with respect to the Work, in either case contrary to
Affirmer's express Statement of Purpose.

4. Limitations and Disclaimers.

  a. No trademark or patent rights held by Affirmer are waived, abandoned,
  surrendered, licensed or otherwise affected by this document.

  b. Affirmer offers the Work as-is and makes no representations or warranties
  of any kind concerning the Work, express, implied, statutory or otherwise,
  including without limitation warranties of title, merchantability, fitness
  for a particular purpose, non infringement, or the absence of latent or
  other defects, accuracy, or the present or absence of errors, whether or not
  discoverable, all to the greatest extent permissible under applicable law.

  c. Affirmer disclaims responsibility for clearing rights of other persons
  that may apply to the Work or any use thereof, including without limitation
  any person's Copyright and Related Rights in the Work. Further, Affirmer
  disclaims responsibility for obtaining any necessary consents, permissions
  or other rights required for any use of the Work.

  d. Affirmer understands and acknowledges that Creative Commons is not a
  party to this document and has no duty or obligation with respect to this
  CC0 or use of the Work.

For more information, please see
<http://creativecommons.org/publicdomain/zero/1.0/>

```
