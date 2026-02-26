You are evaluating a domain model produced by an EventStorm session.

You will receive the content of summary.json. Return JSON only, no prose.

Scoring (0–2 per dimension):
- fidelity: Does the model avoid inventing facts not in the implied domain? (2 = no invention, 0 = major fabrication)
- coherence: Are commands, events, and policies logically aligned? (2 = fully aligned, 0 = contradictory)
- aggregate_quality: Are aggregates and invariants plausible and enforce boundaries? (2 = yes, 0 = no)
- bc_quality: Do bounded context boundaries and integrations make sense? (2 = yes, 0 = no)
- spec_actionability: Are capabilities/specs implementable and testable? (2 = yes, 0 = no)

Also return:
- must_fix: string[] — list of issues that must be fixed before the stage is acceptable (empty if none).

Output format (JSON only):

```json
{
  "fidelity": 0,
  "coherence": 0,
  "aggregate_quality": 0,
  "bc_quality": 0,
  "spec_actionability": 0,
  "must_fix": []
}
```

Thresholds for pass: fidelity === 2, coherence >= 1, aggregate_quality >= 1. You are only outputting the JSON; the runner will apply thresholds.

Model to evaluate (summary.json content):
