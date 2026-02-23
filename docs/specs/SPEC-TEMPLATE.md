# Spec: [One-line summary]

Brief description of the feature or module in one sentence.

---

## Contract

- **Name:** (function, service, or API name)
- **Signature / API:** (parameters, return type, or HTTP method + path)
- **Location:** (file path or module path, e.g. `business_modules/<name>/app/<name>Service.js` or `lib/<name>.js`)

---

## Business module (optional)

**Include this section when** the feature belongs under `business_modules/<name>/` (user said "business module" or Contract Location is under `business_modules/<name>/`).

- **Module name:** (camelCase)
- **Entities:** (objects with identity; name + brief role)
- **Aggregates / aggregate roots:** (consistency boundaries; name + brief role)
- **Value objects:** (immutable concepts: IDs, result shapes; name + brief role)
- **Domain events:** (things that happen in the domain; name + brief role)
- **Ports:** (interfaces for I/O: persistence, external services; e.g. `I<Module><Port>` — role)

---

## Input / Output

| Input | Output |
|-------|--------|
| (describe) | (describe) |

Or use bullets for explicit input → output pairs.

---

## Edge cases and corner cases

- **Edge:** empty, null/undefined, boundaries, Unicode, duplicates.
- **Corner:** rare or combined conditions that might expose gaps.

---

## Error cases

- Invalid types, preconditions, what throws or returns an error.

---

## Invariants

- e.g. pure function, no side effects, idempotent, ordering guarantees.

---

## Success criteria

- What "done" and "correct" mean; what must be tested.

---

## Test file hint

- **Unit:** e.g. `tests/lib/<name>.test.js` or `tests/business_modules/<module>/app/<name>Service.test.js`
- **Integration / e2e:** (if applicable)
