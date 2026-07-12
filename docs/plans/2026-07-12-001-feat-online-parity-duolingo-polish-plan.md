---
title: "feat: Online-table parity via shared table kit + Duolingo-hard polish"
date: 2026-07-12
type: feat
depth: deep
origin: user feedback (Round 10, phone screenshots + quality complaint)
---

# Round 10: Online-Table Parity, Vertical Home, Duolingo Executed Hard

## Summary

Extract the designed bot table into a shared table kit, rebuild the online multiplayer table on it, fix the deal-to-play line shift, overlap avatars onto opponent card stacks, redesign home as a vertical page-filling layout, and push every menu screen to an unmistakable Duolingo look. Dan picked the direction explicitly: "Duolingo, executed hard." This is a quality round: every UI unit self-verifies with 360px portrait screenshots before reporting done, and the orchestrator re-verifies against Dan's complaints.

## Problem Frame

Dan's phone screenshots exposed that the online multiplayer table (app/room/[code].tsx) never received the R8/R9 table design: it is a plain cream page with wrapped card rows, ad hoc opponent boxes, flat centered text, and no felt panel, while bot play (app/game-local.tsx) has the full designed table. The divergence happened because the table UI lives inline in game-local.tsx and is not shareable. Separately: home reads horizontal and empty on portrait phones, the deal animation lands cards on a different line than live play (visible shift), opponent seats waste vertical space, and the menu screens read flat rather than Duolingo-playful. Dan's meta-complaint: sloppy QC. Verification discipline is part of the deliverable.

## Requirements

- R1: Online live table has full layout + effects parity with the bot table (felt panel, gold border, seats, protected full-size pool, banner strip, compact mode, chunky buttons, hand fan with drag, ad row, turn timer).
- R2: The table UI is shared code, not a copy: future changes hit both tables by construction.
- R3: Home is a vertical, page-filling portrait layout keeping PLAY / QUICK MATCH / PRIVATE, the first-play difficulty picker, instant PLAY with saved difficulty, players-online chip, and how-to-play access.
- R4: Dealing lands the accumulating hand and any table cards on exactly the same lines used during live play; zero vertical shift at the dealing-to-play transition.
- R5: Opponent seats overlap the avatar onto the card stack to save vertical space, on both tables.
- R6: Menu screens (settings, profile, leaderboard, friends, how-to-play, matchmaking, play-online) and the tab bar read unmistakably Duolingo: chunky bordered rows, bold rounded type, juicy pressed states.
- R7: Every UI unit produces 360px portrait screenshot evidence before reporting done; the orchestrator re-verifies through the deployed bundle.

## Key Technical Decisions

- KTD1 Shared table kit under `components/table/`: extract TablePanel, SeatPlate, TopBar, banner strip, pool/trick region, HandRow + DraggableCard, and the compact-height budget out of game-local.tsx (recon: TablePanel at lines 173-225, SeatPlate 263-339, TopBar 344-391, HandRow 1026-1182 are props-only or near props-only; the pool region is inlined and needs componentizing first). game-local.tsx becomes a consumer. Rationale: parity by construction, and the extraction is the only durable fix for the divergence class.
- KTD2 U1 is a zero-visual-change refactor. The extraction must reproduce the bot table pixel-identically (DOM geometry check against the known R9 numbers: PASS 37px at y~122, pool region 138px, SORT y~353 at 360x570). Visual changes land in later units so regressions are attributable.
- KTD3 Deal-line fix is an anchor alignment, not a new animation. Recon found the exact cause: DealingAnimation's dealHandFan anchors cards bottom:0 inside a bottom:56 absolute container while live HandRow anchors top:12+FAN_LIFT_MAX inside a container of height CARD_HEIGHT+24+FAN_LIFT_MAX. Fix: DealingAnimation renders its accumulating fan inside the same container geometry as HandRow (share the constants or the container component from the kit).
- KTD4 Avatar-over-cards lands once in the shared SeatPlate (avatar badge overlapping the stack corner, name below or beside per compact) and both tables inherit it.
- KTD5 Duolingo-hard is executed through the existing token system: new list-row component (chunky bordered tappable row with pressed 3D edge) in components/ui.tsx, bolder tab bar, bigger type where the scale already allows. No parallel design system; extend lib/theme + lib/uiState.
- KTD6 Online-table verification path: solo QUICK MATCH auto-starts a room vs expert bots after the queue timeout (R7 matchmaker behavior), giving a live online table to screenshot without playing turns.
- KTD7 No server changes expected; deploy is export + pages --branch=main only (worker deploy only if something server-side surfaces during U2).

## Scope Boundaries

- In: everything under Requirements.
- Out: new art generations (needs Dan's approval), gameplay-logic changes, Bluetooth screen redesign beyond the sweep's row treatment, native builds, Turnstile, Stripe.
- Deferred to follow-up: spectator/replay views, seat arc redesign beyond avatar overlap, animation flourishes beyond deal-line continuity.

---

## Implementation Units

### U1. Extract the shared table kit (zero visual change)

**Goal:** `components/table/` exports TablePanel, SeatPlate, TopBar, BannerStrip, PoolRegion, HandRow (+DraggableCard), and the compact budget helpers; game-local.tsx consumes them and renders pixel-identically.
**Requirements:** R2, feeds R1/R4/R5.
**Dependencies:** none.
**Files:** create `components/table/TablePanel.tsx`, `components/table/SeatPlate.tsx`, `components/table/TopBar.tsx`, `components/table/BannerStrip.tsx`, `components/table/PoolRegion.tsx`, `components/table/HandRow.tsx`, `components/table/layout.ts` (compact budget: COMPACT_PANEL_HEIGHT, POOL_MIN_HEIGHT, usablePanelHeight); modify `app/game-local.tsx`; tests `lib/tableLayout.test.ts` for the pure budget helpers (wire into root test chain).
**Approach:** move code, do not redesign. The inlined pool region must be componentized with explicit props (lastPlay, prevPlay, compact, isMyTurn, action buttons as children or slots) so U2 can reuse it. Keep the banner strip's fixed-height no-layout-shift contract (16/14px) as a documented invariant of BannerStrip.
**Patterns to follow:** the existing component prop shapes in game-local.tsx (recon line ranges above); PlayingCard exports for card constants.
**Test scenarios:** budget helpers return the R9-verified numbers for 360x570, 360x640, 412x915 (compact flag, usable height, pool floor). Existing suites stay green.
**Verification:** DOM geometry at 360x570 and 412x915 matches the R9-verified table exactly (PASS/PLAY size and y, pool region height, SORT position, no overflow). Screenshot before/after visually identical.

### U2. Rebuild the online live table on the kit

**Goal:** app/room/[code].tsx playing phase renders the designed table: TablePanel felt + gold border, three SeatPlates, PoolRegion with full-size cards, BannerStrip (turn/timer/errors, no layout shift), HandRow fan with drag, compact mode, chunky PASS/PLAY, ad row. Lobby and finished phases get the same felt treatment where sensible (lobby can stay card-based but styled).
**Requirements:** R1, R2.
**Dependencies:** U1.
**Files:** modify `app/room/[code].tsx`; possibly `lib/onlineGame.ts` (view-model additions only, e.g. per-seat passed/place flags if missing); test `lib/onlineGameView.test.ts` if view-model mapping logic is added.
**Approach:** map OnlineRoomView state onto the kit's props (seat order relative to the viewer, current-turn seat, counts, last/prev play, timer seconds into the TopBar or BannerStrip slot the bot table uses). Multiplayer specifics stay local: turn countdown display, LEFT TABLE label, finish order screen. Keep WS redaction unchanged.
**Patterns to follow:** game-local.tsx's post-U1 consumption of the kit is the reference implementation.
**Test scenarios:** seat-mapping pure function (viewer at bottom, 2/3/4-player rooms fill correct plates); timer text renders inside a fixed-height slot (no shift when it appears/disappears); LEFT TABLE and passed states render on SeatPlate.
**Verification:** solo QUICK MATCH auto-start room (KTD6): screenshot at 360x640 shows the designed felt table; DOM geometry: pool full-size, compact buttons at 360x570, no overflow; banner/timer changes cause zero movement of SORT/hand.

### U3. Deal-line continuity

**Goal:** dealing renders the accumulating hand in exactly the live HandRow geometry; dealt/landing cards for the table land on the PoolRegion line; the dealing-to-play switch moves nothing.
**Requirements:** R4.
**Dependencies:** U1 (uses kit containers/constants).
**Files:** modify `components/DealingAnimation.tsx`; possibly `app/game-local.tsx` invoke site.
**Approach:** KTD3. Replace the bottom-anchored dealHandFan with the HandRow container geometry (same height, same top anchor, same fan math already shared via fanRowLayout/fanCardArc).
**Test scenarios:** none beyond typecheck (pure layout); verification is geometric.
**Verification:** DOM geometry sampled during dealing vs immediately after play begins: the hand fan's first-card x/y and the pool line y are identical (within 1px rounding) at 360x570 and 412x915.

### U4. Avatar over cards in SeatPlate

**Goal:** SeatPlate overlaps the avatar onto the card-stack corner (badge style), reclaiming vertical space; name + count stay legible; both tables inherit.
**Requirements:** R5.
**Dependencies:** U1 (also lands after U2 merges so both consumers exist; coordinate order in execution).
**Files:** modify `components/table/SeatPlate.tsx`.
**Approach:** avatar becomes an absolutely positioned badge over the OpponentCardStack (z-order above, slight offset), active-turn ring preserved; compact mode keeps single-line name. Reclaimed height flows to the pool/hand via the existing budget.
**Test scenarios:** none (visual); Verification: screenshots of both tables at 360x570 show overlapped avatar, no clipping, count chip visible; geometry shows seat height reduced vs U1 baseline and no overflow.

### U5. Home vertical redesign (Duolingo hard)

**Goal:** home fills portrait viewports intentionally: stacked full-width chunky 3D-edge action buttons (PLAY biggest, then QUICK MATCH, PRIVATE), logo + players-online header, stat tiles or a playful empty-state hero filling remaining space, how-to-play as a chunky row. No dead space at 360x640 through 412x915; no scroll.
**Requirements:** R3, R6.
**Dependencies:** none (files disjoint from U1/U2).
**Files:** modify `app/(tabs)/index.tsx`; possibly `components/ui.tsx` (size="big" Button variant); tests: extend `lib/settingsTest.ts` only if decideOnPlay wiring changes (it should not).
**Approach:** vertical stack with flex-grow spacers or proportionally sized blocks so the page is full at all portrait sizes; picker behavior unchanged (PLAY expands in place to EASY/NORMAL/EXPERT stacked or segmented, still one tap to start); keep consent prompt behavior.
**Patterns to follow:** resolveButtonTokens variants; hero image reuse (no new art).
**Test scenarios:** decideOnPlay flow unchanged (existing tests); Verification: screenshots at 360x640, 360x570, 412x915: page filled, no scroll, buttons stacked full-width, picker swap in place, tab bar visible.

### U6. Duolingo-hard menu and tab sweep

**Goal:** settings, profile, leaderboard, friends, how-to-play, matchmaking, play-online, and the tab bar read unmistakably Duolingo: new chunky ListRow component (thick border, rounded, pressed 3D edge, bold label, chevron/toggle slots), bolder section headers, bigger tab icons with active tint + label weight, consistent screen padding.
**Requirements:** R6.
**Dependencies:** none (can run parallel with U1/U5; friends.tsx is untouched by other units this round).
**Files:** modify `components/ui.tsx` (add ListRow, export), `app/(tabs)/_layout.tsx` (tab bar styling), `app/settings.tsx`, `app/(tabs)/profile.tsx`, `app/(tabs)/leaderboard.tsx`, `app/(tabs)/friends.tsx`, `app/how-to-play.tsx`, `app/matchmaking.tsx`, `app/play-online.tsx`; test `lib/uiStateTest.ts` (extend for any new token resolver).
**Approach:** replace the plain Row/Pressable patterns with ListRow; keep information architecture identical (no moved features); Duolingo-ness comes from weight, border, edge, spacing, and pressed feel, not new colors beyond the existing palette.
**Test scenarios:** token resolver for ListRow states (default/pressed/disabled) if added to lib/uiState.
**Verification:** per-screen 360px screenshots; self-grade each against "would this pass as a Duolingo screen"; no text truncation regressions (long usernames from R9 still ellipsize).

### U7. Deploy + verification (orchestrator)

**Goal:** ship and prove it against Dan's complaints.
**Requirements:** R7 + all.
**Dependencies:** U1-U6 merged.
**Files:** docs/SECURITY-CHECK.md (round rows only if any endpoint behavior changed; else a verification note), memory update.
**Approach:** export + pages --branch=main (worker only if server files changed); hash-match prends.app entry JS to local dist; serve dist locally for iframe geometry + screenshots at 360x570, 360x640, 412x915; verify: online table designed (via KTD6 solo quick match), home filled vertical, deal-line continuity (sample during dealing), avatar overlap, menu screens. Grade against the complaint list, not the previous version. No gameplay.
**Verification:** side-by-side screenshot set delivered to Dan per complaint item.

---

## Execution Notes

- Waves: U1 + U5 + U6 in parallel (disjoint files; U6 does not touch game tables), then U2 + U3 in parallel (both need U1; disjoint files), then U4 (needs U1+U2 merged), then U7.
- Delegation: U1 and U2 opus; U3 sonnet; U4 sonnet; U5 sonnet; U6 sonnet; U7 orchestrator.
- Every subagent prompt carries the stale-worktree guard (git log check, reset to feat/redesign-login-bots) and npm install checks with real exit codes.
- Every UI unit must include its own 360px screenshot review before reporting done (launch its own expo web port; screenshot via browser tools; state what was checked). Reports without screenshot evidence are incomplete.
- No em dashes in code, comments, or copy. No new art. Token-lean: never play out games.
