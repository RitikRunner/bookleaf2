# Approach: BookLeaf Author Support Portal

**The problem as I read it.** BookLeaf's backlog isn't only a volume problem; it's a consistency problem. Authors ask about money, ISBNs, print quality and timelines, and the right answer usually depends on their own account. I built for that: every AI answer is grounded in BookLeaf's policy *and* the author's data, and a person always sends the final reply.

## What I prioritised

1. **AI that's right for this business, and can show it.** Facts like "₹850 is below the ₹1,000 minimum, so it rolls over" or "paid by 14 February 2026" are computed in code and handed to the model. LLMs make confident mistakes with dates and money, so the model never does that arithmetic. Each draft carries only the policy section for its category. Unknown facts become `[CONFIRM: …]` placeholders that the API won't let anyone send. BookLeaf rules, such as "ISBN errors are high priority", are enforced in code after the model answers. I built a 46-scenario evaluation on the real dataset. Triage scores 36/36. Drafts passed every policy check in all 10 scenarios on the saved run, and 9 of 10 on earlier runs. The eval also drove decisions: prompt v2 fixed problems the first run exposed, and a thinking-level experiment cut draft cost by 74% with no quality loss.
2. **Never blocked by the AI.** Tickets are saved before any AI work, so triage falls back to keyword rules and retries later. A circuit breaker stops repeated calls during an outage, and drafting degrades to manual writing. These paths ran against real rate-limit and "high demand" errors during development, not only in tests.
3. **Correct access control.** Authors' queries are scoped in one place, and another author's records return 404. The author's view of a ticket is built from a query that never loads internal fields. 99 tests cover this, the AI paths (with a fake client) and real-time delivery.
4. **A tool the team would actually use.** The queue opens on unresolved work, most urgent and oldest first, with overdue flags. The ticket screen shows the draft, the AI's reasoning and the author's royalty position together. Authors see replies live.

## Trade-offs I made

- **Gemini 3.5 Flash-Lite, chosen by measurement.** It was the fastest model that worked reliably. A newer model returned "high demand" errors, and a smaller one took 58 seconds. Swapping providers touches four files.
- **One service, in-process queue and event hub.** It's simple to deploy and reason about, and state is in Postgres so restarts are safe. It would not scale horizontally as-is.
- **Server-Sent Events over WebSockets.** Updates only flow one way. Events are thin ("ticket X changed") and the browser refetches through the normal API, so permissions are checked in one place.
- **Royalty data is a snapshot.** Payout dates are computed against a configurable as-of date (15 Jan 2026), and possible missed payouts are flagged for review rather than asserted.
- **Attachments are recorded, not stored,** as the brief allowed.

## Taking it to production

- **Infrastructure:** a shared job queue and Redis/Postgres pub-sub, so it runs on several servers; object storage for attachments; email notifications.
- **Data:** a payouts table, so "overdue" is a fact rather than a flag; OpenAPI-generated client types.
- **AI quality loop:** feed admin corrections and edited drafts back into the eval set and the prompt examples, and alert when the correction rate rises.
- **Deflection:** suggest knowledge-base answers while the author is typing, so fewer tickets need to be raised at all. That is the biggest lever on the backlog.
- **Ops:** per-priority SLAs agreed with the team (mine are assumptions), and a paid Gemini tier, which also keeps author data out of Google's training.
