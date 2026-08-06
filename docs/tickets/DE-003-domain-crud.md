# DE-003 — Build Domain CRUD

## Goal

Allow the user to create, view, edit, archive, unarchive, duplicate, and delete domain records.

## Scope

- Domain list.
- Add/edit form.
- Domain detail screen.
- Inline validation.
- Registrar and DNS autocomplete suggestions.
- Currency selection.
- Currency-change clearing warning.
- First-domain `Expanded` confirmation.

## Acceptance Criteria

- A valid domain can be created with the required fields.
- Invalid forms explain missing or incorrect fields.
- Editing persists all supported fields.
- Currency changes with saved costs require confirmation and clear costs only after confirmation.
- Newly entered registrar and DNS values become suggestions.
- Archive/unarchive works.
- Delete requires confirmation.
- First successful creation displays `Expanded`.

## Dependencies

DE-002.
