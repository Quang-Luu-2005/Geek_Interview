# Documentation index (VI)

Đây là mục lục tài liệu hiện hành của Ticket Booking Backend. Bắt đầu từ
[README ở thư mục gốc](../README.md) hoặc [submission manifest](../submission/README.md)
để có quick start và checklist bàn giao.

## Tài liệu thiết kế

- [System design](SYSTEM_DESIGN.md): kiến trúc, invariant, sequence, failure,
  security và observability.
- [Database design](DATABASE_DESIGN.md): schema, ERD, constraint/index và SQL
  chống oversell/quota race/expiry race.
- [ADR](adr/): các quyết định kiến trúc và trade-off.
- [Diagrams](diagrams/): architecture, booking sequence, state machine và ERD.

## API và vận hành

- [Customer API](API_CUSTOMER.md)
- [Operation API](API_OPERATION.md)
- [OpenAPI contract](../openapi/openapi.yaml)
- [Postman runbook](../postman/README.md)
- [Security assumptions](SECURITY_ASSUMPTIONS.md)
- [Observability](OBSERVABILITY.md)

## Kiểm thử và giới hạn

- [Test strategy](TEST_STRATEGY.md)
- [Performance report](PERFORMANCE_REPORT.md)
- [Assumptions, scope and limitations](ASSUMPTIONS_SCOPE_LIMITATIONS.md)
- [WOW / plus points](WOW_PLUS_POINTS.md)
- [Final QA & delivery](FINAL_QA.md)
- [Coding guidelines](CODING_GUIDELINES.md)
- [Test-results index](../test-results/README.md)

## Long-form report

`main.tex` là nguồn LaTeX của báo cáo; các appendix trong `appendices/` được
cập nhật theo implementation hiện tại. Biên dịch bằng `make -C docs pdf` khi
cần bản PDF mới.
