# Where the sounds come from: Splice, Tracklib and the owned lane

Written 2026-09-23 for MASTERPROMPT_SMOOTH phase 4. Everything below marked "probed" was requested from the live service on 2026-09-23 without an account; the raw answers are quoted. The full licensing brief is `~/.dictation/producer/knowledge/splice.md`.

## The hard line

Splice audio never touches our servers, our storage, the stems worker, logs, the clip vault, the DNA or Galton stores, or any training data. It is licensed to one person, it lands on that person's own machine, and it is only ever part of their own record.

This comes from Splice's Terms of Use, last updated July 24, 2026 (re-read 2026-09-23). Section 3.1.1.3 forbids using Sounds "as source or training material for generative or other types of artificial intelligence models", using them "in a manner competitive to DCI or its licensors", transferring them "to a third party except as incorporated into a New Recording or Creative Work", sublicensing them "in isolation as sound effects, loops, or as source material for any other form of sample", and redistributing them "in new sample packs". Preview audio "may not be modified, reproduced, publicly performed, distributed, transmitted" or otherwise used, so the studio never plays a Splice preview either. The Terms do not mention MCP, APIs or third party applications.

## What the Splice MCP server really supports (probed)

| Request | Answer |
|---|---|
| `GET https://mcp.splice.com/mcp` | `HTTP/2 401`, `www-authenticate: Bearer resource_metadata=https://mcp.splice.com/.well-known/oauth-protected-resource`, body `no bearer token` |
| `POST /mcp` with a JSON-RPC `initialize` | the same `401` and header. Nothing, not even `initialize` or `tools/list`, answers without a token. |
| `GET /.well-known/oauth-protected-resource` | `200`, `access-control-allow-origin: *`, `{"resource":"https://mcp.splice.com/mcp","authorization_servers":["https://mcp.splice.com"],"scopes_supported":["openid","profile","email","offline_access"]}` |
| `GET /.well-known/oauth-protected-resource/mcp` and `/.well-known/openid-configuration` | `404 page not found` |
| `GET /.well-known/oauth-authorization-server` | `200`, `access-control-allow-origin: *`, `{"issuer":"https://mcp.splice.com","authorization_endpoint":"https://mcp.splice.com/oauth/authorize","token_endpoint":"https://mcp.splice.com/oauth/token","registration_endpoint":"https://mcp.splice.com/oauth/register","response_types_supported":["code"],"grant_types_supported":["authorization_code","refresh_token"],"token_endpoint_auth_methods_supported":["none","client_secret_post"],"code_challenge_methods_supported":["S256"],"scopes_supported":["openid","profile","email","offline_access"]}` |
| `POST /oauth/register` with `{}` | `400 {"error":"invalid_client_metadata","error_description":"redirect_uris is required"}` |
| `POST /oauth/register`, a public client (`token_endpoint_auth_method: none`) with redirects `http://localhost:3111/sources/splice/callback` and `https://producer-web-acuntels-projects.vercel.app/sources/splice/callback` | `201`, both redirect URIs accepted as given. Registration is open: no initial access token, loopback and web redirects both allowed. This was the only registration made; its client id was not kept and was never used. |
| `OPTIONS /mcp` from `Origin: http://localhost:3111` or the production origin | `401`, no `access-control-allow-origin` |
| `OPTIONS /oauth/token`, `/oauth/register`, `/oauth/authorize` from either origin | `405 {"error":"invalid_request","error_description":"method not allowed"}`, no `access-control-allow-origin` |
| `POST /oauth/token` (form body) and `GET /mcp` with an `Origin` header | `401`, no `access-control-allow-origin` on the response |

What that means:

1. It is standard MCP authorization: OAuth 2.1 with PKCE (S256), protected resource metadata, and open dynamic client registration for public clients. Any native MCP client can connect, which matches Splice's own page ("Claude, Cursor, Windsurf, or VS Code", ChatGPT not supported).
2. A web page cannot be the client. Only the two metadata documents carry CORS headers. The browser cannot register (JSON needs a preflight, which is refused), cannot read a token response, and cannot call a tool. The client has to be native code: a desktop app, a command line tool, or a server.
3. A server is ruled out by the hard line. Splice's page (last updated April 6, 2026) says downloads "save sounds directly to your computer" in "a location you choose when downloading". The computer that runs the client is the computer that receives the file, so a server-side client would put Splice audio on our servers.
4. The client therefore runs on the user's own machine.

From Splice's support page, not probed: search by description, stacks built from a prompt or a loop, stack editing and sharing are free; downloads need Sounds+, Creator or Creator+; a new download costs 1 credit and re-downloads are free; at most 100 downloads per rolling 24 hours; the first use logs in through the browser. The brief of 2026-09-21 names the tools `describe_a_sound`, `create_stack`, `prompt_to_stack`, `share_stack` and `download_asset`.

Not verified, because each needs a signed in paid account: the live `tools/list`, what `download_asset` returns (the file's bytes, a signed link, or a path on disk), how the certified license is issued for an MCP download, and the rate limit headers.

## The lane design that obeys the hard line

The MCP client and every Splice byte stay on the user's machine. The studio only ever receives the file from the user's own disk into the user's own browser.

1. **Connect.** The user adds Splice's connector (`https://mcp.splice.com/mcp`) to their own MCP host on their own machine and signs in through the browser once. This works today with Claude Desktop, Claude Code or Cursor and needs no code from us. Later, a small native companion can be the client instead, with a loopback redirect such as `http://localhost:<port>/callback`, which registration accepts. The token never reaches our servers either way.
2. **Search.** The studio knows the grid (`song.source`: tempo, key and their confidence). It shows the words to search with, for example "a vocal chop at 128 BPM in C sharp minor", and the user's own host calls the search. The studio makes no request to Splice.
3. **Download.** The user's host calls the download into a folder the user picks, for example `~/Music/Producer/Splice`. One credit, and Splice issues the certified license in the account holder's name.
4. **Bring it in.** The studio reads that folder through a directory handle the user grants (the File System Access API in Chrome and Edge), or the user drops the file. The bytes go into the browser's clip store under a `splice:<asset>` key (`spliceKey` in `lib/sources/splice.ts`). `needsVault` refuses every `splice:` key (built in this phase), so the vault never mirrors it.
5. **Play.** The engine plays it like any clip. With the flag on, the ritual's `next` draws from the Splice lane after the owned lane (`lanesFor` in `lib/sources/index.ts`).
6. **Export.** The finished record the user renders and downloads carries the sound inside it, which the license allows ("incorporated into a New Recording").
7. **Credits.** The song's credits file names the Splice sound and says its license is the certified Splice license in the subscriber's name, kept in their Splice account. Nothing is copied.

Every place in today's code where audio leaves the device, and what each needs before the flag goes on:

| Exit | Where | Status |
|---|---|---|
| The clip vault | `hooks/useVault.ts` sends every stored clip to `mirrorClip` in `lib/account/clips.ts`, gated by `needsVault` | Closed for `splice:` keys in this phase, and a unit test reads the wiring. |
| An ordinary drop | `hooks/useUploads.ts` `addClip` stores the file under an ordinary key, and the vault then mirrors it | Open. A Splice file must come in through the lane's own path with a `splice:` key, never through the ordinary drop. |
| Analyze an upload | `hooks/useStems.ts` `start({ file })` uploads to `<owner>/uploads/` and calls the worker | Open. It must refuse a `splice:` clip. |
| Listen back properly | `hooks/useStems.ts` renders the record's stem groups to `<owner>/hear/<stamp>/` for the worker | Open. It must render with `deviceOnlyTracks(song)` left out (`lib/sources/splice.ts`, built and tested, one line to wire). |
| Identify and match | `hooks/useStems.ts` uploads captures to `<owner>/queries/` | Open. A capture of the studio's own output must leave out the same tracks. |
| The brain | words and measured features only | No audio leaves. A clip's name in the taste ledger is metadata, not sound. |
| DNA, Galton, the learning lane | worker jobs read storage paths only | Safe once the rows above are closed: Splice bytes never reach storage, so no job can read them. |

What has to be true for the gate ("a sample pulled through a user's own Splice account lands in that user's own project with the certified license in their name"), and how we will know:

1. Brady holds a paid plan. Sounds+ at $12.99 a month is enough (100 credits).
2. In his own Claude Desktop or Claude Code he adds the Splice connector and signs in.
3. He asks it for one vocal at the grid the studio names and downloads it to a folder he picks. One credit.
4. We build the ingest (the folder handle or drop, the `splice:` key, the lane's candidates) and close the open exits above. Measured with the browser's network log during the whole session: no request carries the file's bytes (no storage upload, no `/api/stems`, no `hear` upload), and the `clips` table has no row for the key.
5. His Splice account's license page shows the certified license for that sample in his legal name.
6. Separately, ask Splice's business development and legal team in writing whether a third party product working on the subscriber's own machine is fine. Clause 3.1.1.3 "competitive to DCI" is the risk, and the masterprompt's section 8 holds anything that needs a partnership until Splice answers.

## Tracklib: no public API (verified 2026-09-23)

| Check | Answer |
|---|---|
| `https://api.tracklib.com/` | `404 page not found` |
| `https://www.tracklib.com/developers`, `/api` | `404` |
| `https://www.tracklib.com/api/v1/` | `307`: the site's own private backend. `robots.txt` has `Disallow: /api`. |
| `developer.tracklib.com`, `developers.tracklib.com` | the names do not resolve |
| `https://www.tracklib.com/sitemap/pages.xml` | 398 pages, none about an API, developers or partners |
| `github.com/tracklib` | three public repositories (a django-fsm fork, MailHog, wgclient), no SDK |
| Tracklib Connect | a VST plugin driven by the Tracklib Desktop App; samples play in sync in the DAW and "don't transfer as files"; included with any subscription; no API mentioned |

One web search summary claimed Tracklib publishes "a public version of their internal API documentation". That text belongs to developer.trackhs.com (Track, a hospitality software company), not Tracklib.

The handoff, not code: the famous record stays a person's route. The user licenses the song in their own Tracklib account, downloads its stems to their own machine, drops them into the studio under the same device-only rule as Splice, and registers the derivative work for each release (the Terms of 2026-01-20; the 60 second limit rests on a search snippet and is unverified). Tracklib's Terms forbid putting its Sounds into "sample packs, loops, libraries, music recognition systems or similar", so the stems worker, the DNA store and the print store must never see them. This becomes code only if Tracklib publishes a documented API.

## The owned lane (built)

- `lib/sources/lane.ts`: the interface every lane answers (`Lane`, `Candidate`, `Want`) and `nextFrom`, the first unplayed candidate from the first lane that is on.
- `lib/sources/owned.ts`: the starter library's vocals as seeds, stretched onto the grid at their own tempo or at double or half time, whichever bends them least (at most 12 percent), and moved at most three semitones into the grid's key. The pack's tempo carries 0.75 when it was tagged and 0.5 when the pack only inferred it from a loop's length, and the unsure one is said out loud.
- `lib/sources/manifest.ts` and `docs/SOURCES_MANIFEST.json`: every file the product ships with its license, source page, author and sha256. Only CC0, public domain and a commissioned buyout with its contract named are owned. A file from a per-user license host (Splice, Tracklib, Landr, Loopcloud, Cymatics, Output, BandLab, Looperman) fails the check.
- `lib/sources/splice.ts`: the Splice lane as a stub behind `NEXT_PUBLIC_SOURCES_SPLICE`, off unless it is exactly `1`, and with nothing to offer even when on. It holds the hard line in code: the `splice:` key space, `spliceMayGo` (the user's device and nowhere else), `staysOnDevice`, `deviceOnlyTracks` and the user-held license.
- `hooks/useRitual.ts`: "next one" draws from the lanes once the heard record's lines and the finder's records are used up, or at once when the user is signed out. The owned library is instant and needs no account.
- `app/api/find` and `hooks/useStems.ts` did not change. The owned lane runs from the static pack manifest in the browser and needs no seam there.
