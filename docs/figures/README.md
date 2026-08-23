# Figures

The report embeds versioned PDF exports of the Mermaid sources in
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

They were rendered with `@mermaid-js/mermaid-cli@11.12.0`. Update the matching
`.mmd` source first, regenerate its PDF, then build `main.tex` to verify page
layout.
