# Catch Me Up and Follow-up Q&A Specification

## Status

Design only. No AI provider, embeddings, retrieval pipeline, or user-facing recap is implemented in the foundation phase.

## Inputs

- User identity and authorization
- Show, season, and episode IDs
- A selected watched boundary, normally the latest completed episode or the user’s current episode
- Structured episode plot events and character/relationship facts available only through that boundary

## Recap behavior

Return a concise, plot-relevant recap of watched material. Prioritize unresolved context, important characters, relationships, and events needed to resume. Omit trivia and future material. The response should identify the boundary it used and fail closed if the boundary or source data is ambiguous.

## Q&A behavior

Every question is answered against a retrieval scope bounded by the selected episode. Retrieval must exclude all later episodes before generation. If the answer requires future information, say that it cannot be answered yet rather than hinting at it.

## Safety and quality

- Enforce boundaries in retrieval and authorization, not only in the prompt.
- Keep AI credentials server-side.
- Store source episode IDs and model/version metadata for evaluation.
- Test questions that tempt the system to reveal later plot points.
- Provide a useful “not enough information yet” response.

## Future acceptance criteria

For a user stopped at S2E6, neither recap nor Q&A may use S2E7+ facts, names, relationships, or outcomes. A change in watch progress must change the retrieval boundary deterministically.
