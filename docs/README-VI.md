# Template LaTeX - Concert Ticket Booking Backend Report

Template này đã được custom riêng cho bài Product Backend Engineer Technical Assessment (Concert Ticket Booking Platform).

## 1. Việc đầu tiên cần sửa
Mở `config/commands.tex` và thay:
- `YOUR NAME`
- email
- repository URL
- version/date nếu cần

## 2. Compile
### Overleaf
Upload toàn bộ folder/zip lên Overleaf và chọn `main.tex` làm Main document.

### Local
Nếu có `pdflatex` + `bibtex`:

```bash
make pdf
```

Hoặc:

```bash
pdflatex main.tex
bibtex main
pdflatex main.tex
pdflatex main.tex
```

## 3. Cấu trúc report
- `00 Executive Summary`
- `01 Problem Analysis and Requirements`
- `02 Scope, Assumptions, Business Invariants`
- `03 System Architecture`
- `04 Database Design`
- `05 Booking Workflow and Transaction Boundary`
- `06 Concurrency and Overselling Prevention`
- `07 Idempotency and Retry Safety`
- `08 Voucher and Promotion Consistency`
- `09 Booking Lifecycle and Reservation Expiry`
- `10 API and Operation Workflows`
- `11 Security, Reliability, Observability`
- `12 Testing Strategy and Correctness Evidence`
- `13 Performance and Flash-Sale Analysis`
- `14 Architecture Decisions and Trade-offs`
- `15 Implemented Scope, Limitations, Future Evolution`
- `16 Conclusion`
- Appendices: Local setup, API matrix, test evidence, ADRs

## 4. Template đã có sẵn
- Cover chuyên nghiệp
- Header/footer
- Table of contents / list of figures / list of tables / list of listings
- Styled boxes: Decision / Business Invariant / Risk / Evidence
- Code blocks cho SQL, HTTP, shell và JSON-like content
- System architecture diagram bằng TikZ
- Booking flow diagram bằng TikZ
- Booking state machine bằng TikZ
- Tables cho assumptions, test traceability, performance, trade-offs, API matrix
- BibTeX entry cho assessment

## 5. Khi code xong phải update
- `chapters/15-limitations.tex`: trạng thái Planned -> Implemented / Partial / Out of scope
- `chapters/13-performance.tex`: số liệu k6 thật
- `appendices/C-test-evidence.tex`: kết quả CONC-001..004 và integration tests
- `appendices/A-local-setup.tex`: command setup/run/test thật của repo
- `appendices/B-api-matrix.tex`: endpoint thật đã implement

## 6. Nguyên tắc
Không để report mô tả feature như đã implement nếu code chưa có. Phân biệt rõ Current Implementation và Future Evolution.
