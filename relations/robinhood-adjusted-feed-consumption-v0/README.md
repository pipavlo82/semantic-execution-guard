# Direct adjusted-feed consumption v0

Profile: `semantic-execution-guard.robinhood-adjusted-feed-consumption.v0`.

The companion profile makes the direct adjusted-feed semantic route independently
falsifiable over synthetic, exact, deterministic fixtures. It is an offline
relation/recompute component, not an execution guard or a live evidence adapter.

```text
OFFCHAIN_UNDERLYING_EQUITY_QUOTE
    DOES_NOT_ESTABLISH EXECUTABLE_TOKEN_PRICE
    even when its numeric value equals the adjusted feed value

ALREADY_ADJUSTED_ONCHAIN_PRICE
    + declared registered feed, asset, chain, token, state and freshness coordinates
    + DIRECT consumption
    CAN_ESTABLISH the local EXECUTABLE_TOKEN_PRICE claim
```

The direct route preserves `value = evidence.mantissa` and native
`decimals = evidence.decimals` exactly. No multiplier or other arithmetic
transformation is permitted. No amount or USD notional is calculated.

## Relationship to the frozen conversion route

The unchanged sibling `robinhood-stock-token-v0` at
`8c786d8134632cdb4892ed32051377e739495300` models:

```text
UNDERLYING_EQUITY_QUOTE + SHARES_PER_TOKEN_MULTIPLIER
    -> MULTIPLIER_ADJUSTED_TOKEN_PRICE through explicit exact conversion
```

This new profile models:

```text
already-adjusted registered on-chain feed
    -> executable token price through direct consumption
```

Neither supersedes the other. The old profile's
`ALREADY_ADJUSTED_ONCHAIN_PRICE -> DOUBLE_ADJUSTMENT` rule means already-adjusted
evidence cannot enter the RAW-CONVERSION route. It does **not** mean that a separate
direct-feed profile can never consume already-adjusted evidence. This profile does
not reinterpret that rule, reuse the old profile ID, or modify the old handoff.

## Input and trust model

`relation.schema.json` is a normalized fixture schema, not a Robinhood or Chainlink
wire schema. Every vector is `SYNTHETIC_RELATION_FIXTURE`. Asset names, addresses,
chain IDs 31337/31338, state labels, observations, rounds and times are invented.
Raw adversarial records intentionally retain plausible feed-related coordinates;
those are not assertions that a real off-chain API supplies Chainlink rounds.

The profile evaluates:

- Exact asset ID, chain ID and nonzero token contract identity in evidence/context.
- Nonzero registered feed equal to the evidence feed; no fallback feed.
- Declared `feed_code_present = true`. False rejects; unknown/null cannot establish.
  This field does not query bytecode or authenticate any contract.
- Exact non-null evidence/context state ID. This opaque synthetic snapshot label
  is not independently established latest state, an anchored block or a version proof.
- Input claim `ALREADY_ADJUSTED_ONCHAIN_PRICE` and requested claim
  `EXECUTABLE_TOKEN_PRICE`; raw or unrelated claims cannot be promoted.
- Fixed source `REGISTERED_ONCHAIN_ADJUSTED_FEED` and authority
  `DECLARED_REGISTERED_ADJUSTED_FEED` in both evidence and context. Relabeling both
  to some other role cannot redefine the profile's accepted authority.
- Declared USD denomination and native feed decimals matching the context.
- Positive int256 answer, uint80 round coordinates, `answered_in_round >= round_id`.
- The timestamp policy below and operation `DIRECT`.

`context.comparison_adjusted_price` is a nullable **non-authorizing** numeric
reference used to describe L2/L3 and the equality-collapse mutant. The production
evaluator never compares prices against it. A valid direct feed still passes when
it is null; a raw quote still fails. Only the deliberately faulty M2 source mutant
treats equality with this declared comparison value as authority. It is not a
runtime mutation switch, second trusted feed or live observation.

Prices are canonical signed decimal integer strings: no leading zeros, plus sign,
negative zero, exponent notation or fractional mantissa. Rounds are unsigned
decimal strings. The evaluator checks int256/uint80 bounds exactly using BigInt;
unsupported ranges return CANNOT_ESTABLISH. Decimals are uint8 integers (0..255).
Times and other numeric metadata are nonnegative safe JSON integers. No binary
floating-point price arithmetic occurs. Direct consumption requires no rounding
and does not normalize to 18 decimals or use ERC-20 amount decimals.

Missing feed binding, evidence feed, declared code availability or state identity
is CANNOT_ESTABLISH; an explicitly conflicting coordinate is FAIL. Structural
schema errors are CANNOT_ESTABLISH / INVALID_INPUT. Domain is parsed JSON values,
not cyclic JavaScript objects, functions, NaN, Infinity or BigInt objects.

## Deliberate timestamp and round policy

```text
updated_at > 0
updated_at <= execution_time
execution_time - updated_at <= max_staleness_seconds
```

Zero and future timestamps fail explicitly. The future check precedes subtraction;
age arithmetic uses BigInt. Exactly the freshness limit passes; one second beyond
fails. Zero staleness window permits only the same timestamp. These are this
profile's policies, not a universal assertion about all Chainlink implementations.

The round policy rejects `answered_in_round < round_id`. It does not independently
ban zero round IDs: L28 deliberately permits both IDs zero with otherwise valid
coordinates. `startedAt` is not modeled and no nonzero rule for it is invented.
Feed-specific assumptions require later authoritative documentation/live evidence.

Only DIRECT consumption is accepted. A request for MULTIPLY, APPLY_MULTIPLIER,
DOUBLE_ADJUST or another non-DIRECT transformation fails as DOUBLE_ADJUSTMENT.
This status rejects the attempted route; it does not claim a transformation ran.

## Receipts and canonicalization

Each vector stores an independently specified **full expected receipt** outside its
`input`. `recompute(input)` never reads expected outcomes. PASS exposes the exact
input mantissa/native decimals. FAIL and CANNOT_ESTABLISH expose null value/decimals
and distinct reason codes; they are not collapsed into a boolean. The receipt
retains source/type, asset/chain/token, feed/binding, state, round and time fields.

`input_digest` uses the frozen sibling's discipline: SHA-256 over UTF-8 JSON with
recursively sorted object keys, preserved array order and no whitespace, formatted
as `0x` plus 64 lowercase hexadecimal digits. Every input field, including the
non-authorizing comparison reference, is committed. Expected results are not.
This is the repository's JSON convention, not a new claim of universal JCS
interoperability. Do not substitute keccak256 or another canonicalization.

PASS means only that supplied profile coordinates establish this local semantic
relation. It does **not** independently prove:

- That a feed is Chainlink, really registered on Robinhood, correctly associated
  with the asset, USD-denominated or genuinely multiplier-adjusted.
- That a real Robinhood API response or Chainlink round was captured.
- Authentic state/version, RPC provenance, consensus/finality or current live state.
- Authorization, a mined transaction, guarded action execution or economic safety.

Matching caller-controlled facts can manufacture internally consistent input. A
digest does not make those facts authentic. Temporal consistency with a supplied
execution time is not an event-time enforcement guarantee. FAIL and
CANNOT_ESTABLISH must both block any future consumer that requires this claim;
PASS alone must never confer execution permission.

## Corpus and mutation falsifiability

30 vectors: **4 PASS / 22 FAIL / 4 CANNOT_ESTABLISH**. L1-L18 implement the requested
control, raw equality/inequality, feed/asset/chain binding, timestamp/round,
positivity, operation and authority/claim boundaries. L19-L30 cover distinct token
identity, zero/missing binding, false/unknown code, decimals, currency and state
coordinates, plus positive zero-round and zero-window policies and unrelated input
claim rejection. All four positive controls preserve exact native value/decimals.

| Mutation | Required killer | Rule changed |
| --- | --- | --- |
| M1_RAW_QUOTE_ACCEPTED_AS_EXECUTION_PRICE | L3 | Raw promotion regardless of value |
| M2_NUMERIC_EQUALITY_COLLAPSES_AUTHORITY | L2 | Equality with declared reference grants authority |
| M3_FEED_BINDING_IGNORED | L4 | Feed identity |
| M4A_ASSET_BINDING_IGNORED | L6 | Asset identity |
| M4B_CHAIN_BINDING_IGNORED | L7 | Chain identity |
| M4C_TOKEN_BINDING_IGNORED | L19 | Token identity |
| M5A_STALENESS_REMOVED | L16 | Maximum age |
| M5B_FUTURE_TIMESTAMP_ACCEPTED | L9 | Future-time exclusion |
| M5C_ZERO_TIMESTAMP_ACCEPTED | L10 | Zero-time exclusion |
| M6_INCOMPLETE_ROUND_ACCEPTED | L11 | Round completeness |
| M7_DOUBLE_ADJUSTMENT_ALLOWED | L14 | Forbidden operation accepted as direct consumption |
| M8_SOURCE_AUTHORITY_ROLE_IGNORED | L17 | Source/authority roles |
| M9_NONPOSITIVE_PRICE_ACCEPTED | L12 | Positive answer |
| M10_FEED_DECIMALS_IGNORED | L24 | Native decimal metadata |
| M11_STATE_IDENTITY_IGNORED | L26 | Snapshot identity |
| M12_FEED_CODE_ABSENCE_IGNORED | L22 | Explicit absence of code |

All 16 mutations patch exactly one source site in a unique temporary module.
M4 and M5 are split because their predicates are separate. L10 uses an age window
that includes timestamp zero so M5C cannot be masked by a separate stale check.
M2 must leave the unequal raw quote L3 rejected. Every required killer must become
PASS and every positive control must preserve its **entire expected receipt**,
including reason, coordinates and digest. Crashes, unchanged/unapplied patches,
wrong killers or broken positive controls fail the runner; they are never kills.
No production runtime mutation mode exists. Mutation receipts include source
digests and per-mutant observations. The suite itself tests these rejection rules.

## Read-only Fede reference; hardened guard compatibility

Repository: `babyblueviper1/semantic-execution-guard`, branch
`guard/robinhood-semantic-execution-guard-v0`.

- First audited draft: `8dc4f920bfbebf3531d6ebdbfcc3f16c154b5d04`, based on
  `8c786d8134632cdb4892ed32051377e739495300`. The original compatibility mapping
  recorded its registration/timestamp defects, undefined notional units and
  execution-name/price-only scope mismatch.
- Current compatibility target, hardened regression-audited draft:
  `686d9247451d68c6910c2e6bae79664cb763b33f`, exactly one commit after that draft.
  See the pinned [contract](https://github.com/babyblueviper1/semantic-execution-guard/blob/686d9247451d68c6910c2e6bae79664cb763b33f/contracts/SemanticExecutionGuard.sol)
  and [tests](https://github.com/babyblueviper1/semantic-execution-guard/blob/686d9247451d68c6910c2e6bae79664cb763b33f/test/SemanticExecutionGuard.t.sol).

The independent regression audit on 2026-09-17 classified this exact hardened
commit as **READY FOR TESTNET PRICE-ESTABLISHMENT PROTOTYPE**. This does **not**
establish live Robinhood deployment, actual live feed identity, actual Stock
Token/feed association, live round correctness, protected-action execution,
transaction settlement or economic safety. Price-establishment prototype readiness
is not end-to-end protected-action readiness.

That audit freshly observed 14/14 repository Solidity tests and 20/20 independent
probes passing. The same four hardening assertions failed against the old exact
contract for the expected reasons, including its future-time Panic(0x11).
Registration and timestamp repairs, removal of undefined notional arithmetic, and
the renamed price-only claim boundary were verified; no new code regression was
reproduced. These are recorded external audit results, not Solidity test counts for
this Pavlo branch. The guard remains an implementation reference, **not normative
authority for this profile**; this documentation change does not repair its code.

| Relation/design requirement | Behavior at 686d9247451d68c6910c2e6bae79664cb763b33f | Status |
| --- | --- | --- |
| OFFCHAIN_UNDERLYING_EQUITY_QUOTE cannot enter executable price path | Price comes from the registered feed read, not a caller's raw quote; owner configuration remains the trust root | MATCH |
| No external price argument | establishExecutablePrice(bytes32 assetId) accepts only assetId; no alternative public price-input route | MATCH |
| Registered feed is the consumed feed | getExecutablePrice reads latestRoundData from feedOf[assetId]; successful binding cannot be replaced | MATCH |
| Zero feed rejected | registerFeed reverts ZeroFeedAddress before writing state | MATCH |
| Non-contract feed rejected | registerFeed reverts FeedNotAContract when code.length is zero | MATCH |
| Asset selection has no fallback | Unregistered assetId reverts UnknownAsset; other assets' feeds are not substituted | MATCH |
| Positive answer required | Rejects answer <= 0 with NonPositiveAnswer | MATCH |
| answeredInRound >= roundId | Rejects an incomplete round; no separate universal zero-round ban | MATCH |
| updatedAt > 0 | Rejects zero with ZeroUpdatedAt before subtraction | MATCH |
| updatedAt <= current block time | Rejects future time with FutureUpdatedAt before subtraction, not Panic(0x11) | MATCH |
| Inclusive freshness boundary | Age == maxStalenessSeconds passes; one second beyond reverts StaleAnswer | MATCH |
| Direct consumption of native feed value | Returns the feed answer unchanged | MATCH |
| No second multiplier | No shares-per-token transformation is performed | MATCH |
| Feed decimals returned/preserved | Getter, establishment result and event carry native feedDecimals | MATCH |
| Explicit normalized chain/profile/token coordinates | Opaque bytes32 assetId and local guard context do not implement this profile's explicit normalized coordinates | MISMATCH |
| Explicit evidence/context state identity | No comparison of the profile's evidence and context state IDs | MISMATCH |
| Expected-decimal comparison against configured semantic scale | Returns feed decimals but has no configured expected-scale comparison | MISMATCH |
| Genuine Chainlink / Robinhood / adjusted / USD semantics | Owner-selected contract and code-presence check do not independently establish these claims | LIVE-EVIDENCE-PENDING |
| Explicit feed identity in the profile receipt | Event omits feed; reconstructable through guard address + assetId + immutable feedOf[assetId], with chain provenance | MISMATCH |
| Defined amount/notional units | Undefined amount-scaled arithmetic was removed; both routes now expose price only, with no amount input | OUT_OF_SCOPE |
| Protected-action authorization/execution | Establishes and receipts a price; no trade, transfer, settlement or protected state transition | OUT_OF_SCOPE |

MATCH describes narrow semantic behavior, not live authenticity or full interface
compatibility. MISMATCH records differences from the profile's richer coordinate
model or receipt format; it is not automatically a contract bug or a requirement
to expand this limited testnet price-establishment prototype. The offline evaluator
accepts declared evidence mantissas; it is not itself a Solidity no-price-argument
admission API. Authentic source/state acquisition and agreed normalized mappings
remain integration work.

The receipt mismatch does not automatically require duplicating a feed field in
Solidity: reconstructable immutable binding and a self-contained feed-identity
receipt are distinct choices. Code presence and immutable registration do not prove
interface correctness, economic asset identity or immutable proxy implementation.
An earlier price receipt alone does not authorize a later protected action.

Fede 686d924 maps to this **NEW direct-feed route**, not the frozen raw quote plus
multiplier conversion route. It does not execute that old relation and applies no
second multiplier. Neither profile supersedes or reinterprets the other.

External documentation caveats at that pinned Fede commit: its
[README](https://github.com/babyblueviper1/semantic-execution-guard/blob/686d9247451d68c6910c2e6bae79664cb763b33f/contracts/README.md)
still references the old conversion handoff and a pending control-path state change;
that latter acceptance condition belongs to a future protected-action integration.
Its inherited numeric-comparator rationale must not be read as proving that a
simple equality comparator necessarily fails open when values diverge. This
profile's claim is narrower: **numeric equality does not establish source
authority**. Acceptance/rejection must depend on evidence provenance, claim type
and registered authority, not merely matching numbers. Fede's repository was not
edited, and no Solidity was copied into this profile.

## Official sources observed during this task

External-source confirmation: **CONFIRMED FOR DOCUMENTATION SEMANTICS ONLY**.
The web reader could not open these pages; direct HTTPS retrieval of the official
pages succeeded and their text was inspected. No REST price or JSON-RPC endpoint
was queried, and no live feed round was captured.

| Official URL | Access UTC | Classification | Proposition relied upon |
| --- | --- | --- | --- |
| https://docs.robinhood.com/chain/oracles-and-price-feeds/ | 2026-09-17T12:42:14.7764632Z | Normative documentation; numeric illustration is only an example | The Stock Token feed gives the per-token price including the share multiplier. Exact excerpt: "latestRoundData() returns this directly, so you don't apply the multiplier yourself." |
| https://docs.robinhood.com/chain/building-with-stock-tokens/ | 2026-09-17T12:42:14.9256781Z | Normative explanatory documentation; Solidity snippets are examples | Exact excerpt: "The Chainlink price already includes the corporate-action multiplier (dividends, splits)". Direct consumption should not multiply it again. |
| https://docs.robinhood.com/chain/stock-token-apis/ | 2026-09-17T12:49:49.7818867Z | Normative documentation | Exact excerpt: "The REST /prices endpoint returns the raw underlying-equity bid/ask (not multiplier-adjusted)." The source distinguishes this surface from adjusted on-chain prices. |

These observations do not identify any real feed address or prove deployed
behavior. Timestamp handling, normalized state labels, code-presence declarations,
fixture values and chosen freshness windows are this profile's synthetic policy.
The official oracle page also discusses oracle-paused state and sequencer uptime;
this narrow price-relation v0 does **not** model or establish those operational
conditions. They, feed heartbeat/finality, proxy authority, chain/token bindings and
event-time consumer checks require separate live integration review. A PASS must
not be presented as complete execution eligibility during a pause or outage.

## Provenance, reuse and running

This is NEW companion relation/recompute work on Pavlo's new branch from the pinned
relation base. Existing Semantic ABI/RSI concepts and methods are pre-existing
foundations as disclosed in the unchanged provenance documents. Canonicalization
and the small schema validator are reused from this repository at
`8c786d8134632cdb4892ed32051377e739495300`; the extra profile-local
`schema-validator.mjs` keeps the profile and temporary mutation modules
self-contained without editing the frozen sibling or installing dependencies.
It preserves the sibling validator verbatim after a provenance comment. Test and
mutation structure follows the same repository conventions; fixtures and direct
consumption predicates are new. No external foundation or Fede Solidity was copied.
No new license grant is selected or inferred.

From repository root (Node >=22):

```sh
node --test
node relations/robinhood-adjusted-feed-consumption-v0/recompute.mjs
node relations/robinhood-adjusted-feed-consumption-v0/mutations.mjs
forge fmt --check
forge build
forge test
git diff --check
```

The two profile CLIs emit deterministic JSON to stdout. An optional output pathname
writes that same JSON; verification outputs can remain outside the repository.
Tests spawn fresh processes and compare byte output. CI/tests never fetch official
documentation, REST, RPC, Chainlink or Blockscout.

This branch is based on Pavlo's relation SHA, not Fede's fork: it contains no
Solidity guard and has zero Solidity tests. A successful empty Foundry run is not
guard validation. The separately audited repairs in Fede's pinned hardened commit
are documented above, not implemented here. No real Robinhood API response/round,
testnet success, Tiago deployment, Blockscout verification, protected action or
production economic correctness is established by this profile. Its publication
does not establish merge, deployment or independent verification by another author.
