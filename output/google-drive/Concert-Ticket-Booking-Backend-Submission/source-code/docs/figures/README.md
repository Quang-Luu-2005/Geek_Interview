# Figures

The report embeds versioned PDF exports of the diagram sources in
`../diagrams/` so a reviewer can build LaTeX without installing a browser or
Mermaid CLI.

Current exports:

- `use-case.pdf`
- `system-context.pdf`
- `architecture.pdf`
- `erd.pdf`
- `booking-sequence.pdf`
- `booking-state.pdf`
- `expiry-worker-sequence.pdf`

The Mermaid diagrams were rendered with `@mermaid-js/mermaid-cli@11.12.0`
using `--pdfFit` so
the PDF bounding box follows the diagram instead of adding a Letter-sized page
with unreadable whitespace. `use-case.pdf` is rendered from the manually laid
out vector source `use-case.svg`. Update the matching source first, regenerate
its PDF, then build `main.tex` to verify page layout.
