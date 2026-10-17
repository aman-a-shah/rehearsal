# Rebuild record

The rebuild began on October 17, 2026, using the earlier local Rehearsal prototype as a requirements reference. The incident scenario, technology choices, and evidence-bound repair concept were developed before this repository. Existing dependency version pins are reused. Application modules and the interface are being authored anew here.

Commit dates are the actual commit times. No historical timestamps or earlier test reports are imported as new results.

## Product decisions

- One incident workspace brings customer impact, candidate repairs, and approval together.
- Source material and execution traces remain inspectable without filling the main screen with implementation details.
- A structured, reviewed policy change demonstrates that new company evidence invalidates an old proposal.
- A guided tool sequence and a live model loop are visibly distinct modes.
- The application runs locally with synthetic workloads. Demo identities do not constitute production authentication.

## Interface audit

| Before | After | Why |
| --- | --- | --- |
| Long, dense page with repeated technical panels | One incident canvas with contextual evidence drawers | Keep attention on the next decision |
| A 1,209-line application component | Focused screens and shared state/actions | Make interaction changes easier to reason about |
| Three candidate cards with similar visual weight | Comparable experiment rows with an explicit recommended result | Make the failed promise visible |
| A graph competing with operational detail | A focused dependency map tied to customer status | Explain the actual impact |
| Raw implementation details in the main flow | Source citations, exported artifacts, and optional trace inspection | Give reviewers evidence when they need it |
