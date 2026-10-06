---
target: saleem-store/index.html
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/idk/saleem-store/index.html"
target_fingerprint: "sha256:4bea4ece310d189f96b7d50de647ac3d6ef9ee9626753872e05ca7fcb60ce741"
target_path: /home/user/idk/saleem-store/index.html
timestamp: 2026-10-06T10-33-05Z
slug: saleem-store-index-html
closed: true
---
Method: dual-agent (A: design-review sub-agent · B: detector/browser sub-agent; Playwright headless, no user-visible overlay)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Toast never names the mode added; "sent" state is lost on reload |
| 2 | Match System / Real World | 3 | Need-based IA and Iraqi register are excellent; "Total pieces" and "Pay on delivery: Cash on delivery…" read oddly |
| 3 | User Control and Freedom | 3 | No undo on remove; "Start a new order" wipes the cart without confirming |
| 4 | Consistency and Standards | 2 | The "Buy" filter is the same as "All"; Add on the Rent and Monthly rails adds as Buy; Kits tab is desktop-only; digit scripts are mixed |
| 5 | Error Prevention | 2 | The card Add button silently picks Buy for rentable items; the same order can be sent twice after a reload |
| 6 | Recognition Rather Than Recall | 3 | Breadcrumbs, recently viewed and the mode select on each order line help |
| 7 | Flexibility and Efficiency | 3 | Reorder links, order again, share and "/" to search; no mode choice on cards |
| 8 | Aesthetic and Minimalist Design | 2 | The mobile home page is about 5,860px with 11 equal-weight sections; Arabic text is bold everywhere |
| 9 | Error Recovery | 3 | Errors are inline, in plain language, with an example; dead ends route to WhatsApp |
| 10 | Help and Documentation | 3 | The nurse is on WhatsApp everywhere, plus the finder and "how it works"; rental terms are vague at the moment of choosing |
| **Total** | | **27/40** | **Acceptable** |

## Design Specificity Verdict
The words and the information architecture are written for Saleem:
- departments grouped by need
- "why a patient needs it" on every product
- links from products to Saleem visit types
- kits named after real situations
- a "nearest landmark" address field
- an Iraqi-Arabic register

The visual system is a generic marketplace template that any shop could use:
- carousel → chips → trust strip → 15-tile grid → product rails → 3 steps
- one card recipe used everywhere
- navy and orange applied as a theme, not to mean anything

The one claim only Saleem can make, the link to a clinician's care plan, is buried as the 7th block on mobile.

Detector results:
- **Command-line scan:** 1 finding, dark-glow. It is a false positive: the shadows are low-opacity, offset navy on a light page.
- **Browser detector**, 5 routes × 2 viewports, real findings:
  - orange call-to-action buttons at 2.7:1 contrast
  - the WhatsApp send button at 3.1:1
  - small orange text at 3.7:1
  - text on the orange banner at 2.1:1
  - search placeholder at 4.3:1
  - department pages skip from h1 to h3
  - the home page has no h1
  - too many em dashes in the copy
- **Browser detector, low-signal findings:**
  - heading rhythm inside product cards
  - the off-screen carousel slide counted as text bleeding to the edge
  - cards flush to the edge of a scrolling rail
  - the width transition on the carousel dots
- **Tap targets under 44px:**
  - carousel dots 8×8
  - the footer WhatsApp link, 16px tall
  - order-page quantity buttons 34×32
  - the remove button 32×39
  - chips and filter buttons, 36px tall
  - text links, about 22px tall
- **Text under 12px:** mobile tab labels at 11.5px; badges at 11px.

## Priority Issues
1. **[P1] The card "Add" button always chooses Buy, even in the Rent and Monthly rails.**
   - The cause is `modesFor(p)[0]`. A hospital bed or oxygen concentrator gets ordered as a purchase.
   - Fix: pass a mode for each rail and collection; for items with several modes, open a mode choice instead of guessing; name the mode in the toast and on the quantity stepper.
   - Command: /impeccable harden
2. **[P1] The "sent" state lives only in memory.**
   - After a reload the cart looks unsent, so duplicate sends are easy.
   - "Start a new order" wipes the cart without confirming.
   - The sent screen hedges ("if WhatsApp opened…") and shows neither the items nor the number that will reply.
   - Fix: save the order number, time and WhatsApp link; show an "already sent" banner on #/order; add an item summary and the reply number to the sent screen; make "Start a new order" less prominent.
   - Commands: /impeccable harden and /impeccable clarify
3. **[P1] The main actions fail contrast for an older audience.**
   - The orange buttons are 2.73:1, the green WhatsApp button 3.09:1, small orange text 3.70:1 and the orange banner 2.1:1.
   - Badges are 11px and the mobile tab labels 11.5px.
   - Fix: darker fills (orange about #C4510F, green about #12733F), small orange text at #A8480F or darker, and badges and tab labels at 12.5px or more.
   - Commands: /impeccable colorize or /impeccable audit
4. **[P2] The home page is a long template and buries what makes Saleem different.**
   - It has 11 sections and 15 departments in one flat grid. The visit section comes 7th, the Kits tab is hidden on mobile, and the carousel advances on its own.
   - Fix: lead with "Saleem visited, what do I need?" (the finder and visit types), then kits, then search; group the departments; move the rails further down; put Kits in the mobile bottom bar.
   - Commands: /impeccable layout or /impeccable distill
5. **[P2] The mobile product page hides the decision.**
   - The 4:3 image is about 535px tall, and the Add button sits at about 1,007px, below the first screen.
   - The sticky bar only appears after scrolling past that button.
   - Fix: a shorter image; the title and modes first; show the sticky bar whenever the Add button is off-screen; fold the delivery, payment and rental lines into one section that expands.
   - Command: /impeccable adapt

## Persona Red Flags
**Casey, mobile:**
- the Add button is below the first screen
- 8px carousel dots, 34px quantity buttons and 36px chips
- the sent confirmation is lost if the tab reloads
- no Kits tab on mobile
- blank white tiles while photos load

**Jordan, first-timer:**
- the "Buy" filter shows the same list as "All"
- the "شهري" (monthly) badge is unexplained
- "recommends it with:" reads as if it lists products
- "Total pieces 4" means nothing for a bed plus diapers
- the sent screen leaves the success check to the user
- no prices anywhere may read as "the shop isn't open yet"

**Riley, stress tester:**
- the same order can be sent twice after a reload
- adding a kit twice silently doubles the bed rentals
- switching an item's mode merges quantities silently
- a stale "View order" toast
- mixed digit scripts

**Zainab, 41, ordering for her bedridden father after a nursing visit:**
- the kit adds 9 lines, with no way to drop items she already owns first
- Add on the rent rail buys the bed
- the form doesn't say whose name, or which address to deliver to
- the deposit "may apply" with no amount
- no item list or reply number at the end

## Minor Observations
- On a section page, every card repeats the section name as its small label.
- Arabic body text at weight 600 flattens the hierarchy.
- The banner hard-codes "١–٢ يوم" (1–2 days) outside the delivery setting.
- "Pay on delivery: Cash on delivery…" is redundant.
- The navy clinic tile is the heaviest thing in the retail grid.
- Department descriptions are hidden on mobile.
- The carousel arrows are labelled "‹ ›" for screen readers.
- The home page has no h1, and department pages skip from h1 to h3.
- The search placeholder is 4.3:1.

## Questions to Consider
- If most shoppers arrive straight after a Saleem visit, why does the shop open on a banner and a catalogue instead of "what did the nurse ask you to get?"
- With no prices, is a "build my list, the nurse checks it, we quote" flow more honest than 224 product pages?
- Should durable equipment (beds, concentrators) default to rent, with buying the exception?
