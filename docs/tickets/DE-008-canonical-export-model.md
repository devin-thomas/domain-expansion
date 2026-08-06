# DE-008 — Define the Versioned Canonical Export Model

## Goal

Create one lossless in-memory representation used by every import and export format.

## Scope

- Export metadata.
- Domain and reminder mapping.
- Suggestion mapping.
- Schema versioning.
- Validation result model.
- Stable exported IDs.
- Round-trip comparison utilities.

## Acceptance Criteria

- The canonical model represents every persisted field.
- Missing versus explicit null data is handled consistently.
- Export version is required.
- A database snapshot can map to the model and back without semantic loss.
- Automated round-trip tests pass.

## Dependencies

DE-002.
