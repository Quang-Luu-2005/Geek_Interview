# Concert Ticket Booking Backend Submission

Candidate: Lưu Huy Minh Quang  
Assessment: Product Backend Engineer Technical Assessment  
Submission date: 2026-08-23

## Reviewer-first index

- Main report: `01_TECHNICAL_REPORT.pdf`
- Complete runnable source snapshot: `source-code/`
- Full-resolution diagrams, including the UML Use Case Diagram, and editable
  sources: `diagrams/README.md`
- Postman collections, local environment, and OpenAPI contract: `api/`
- Concise concurrency and performance evidence: `test-results/`
- GitHub repository and submission commit: `02_GITHUB_REPOSITORY.txt`

## Quick start

Open `source-code/README.md` for the exact Docker/local setup, migration, seed,
test, Postman, OpenAPI, metrics, and reviewer-smoke instructions.

## Implemented scope

The submission implements published-concert browsing, ticket-category pricing
and availability, atomic booking reservation, idempotent retries, voucher quota
consistency, booking confirmation/cancellation/expiry, guarded operation
workflows, observability endpoints, automated correctness tests, and a local k6
performance baseline.

## Deliberate limitations

Real payment processing, seat-level selection, refunds, notifications, full
catalog/voucher update-delete CRUD, production authentication, and multi-region
deployment are outside the submitted implementation. The report distinguishes
implemented, partial, future, and out-of-scope behavior.

## Repository

https://github.com/Quang-Luu-2005/Geek_Interview  
Branch: `main`  
Submission commit: `fd76c7f99d1879f0e6bf8add46b19bb48e8257a6`

The UML Use Case Diagram is embedded in the report and also supplied separately
at full resolution for convenient zooming in Google Drive.
