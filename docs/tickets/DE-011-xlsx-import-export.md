# DE-011 — Add XLSX Import/Export

## Goal

Provide a spreadsheet-compatible full-fidelity format.

## Scope

Workbook sheets:

- Metadata
- Domains
- Reminders
- Suggestions

Implement parsing, validation, and export formatting.

## Acceptance Criteria

- XLSX opens in Microsoft Excel and Google Sheets.
- Every canonical field is represented.
- Relationships use stable exported domain IDs.
- Edited valid workbooks can be re-imported.
- Invalid cells report sheet, row, column, and reason when practical.
- Round-trip tests preserve semantic data.

## Dependencies

DE-008.
