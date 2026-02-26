---
name: eventstorm-bounded-contexts
description: Splits the domain into bounded contexts and defines relationships (context map).
tools: Read, Grep, Glob
model: sonnet
permissionMode: plan
---

Output Markdown:
# Bounded Contexts
For each BC:
## <BCName>
- Responsibilities
- Key aggregates/events
- APIs/messages it exposes
- Dependencies

# Context Map Relations
List relations with type: Upstream/Downstream, Conformist, ACL, Published Language, etc (if uncertain, mark as hypothesis).
