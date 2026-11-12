# Roam — Travel Expense Tracker

A fast, responsive travel budget application built with Python's standard library, SQLite persistence, and Docker Compose. No external packages, frameworks, or API keys required.

---

## Features

- **Zero Third-Party Dependencies:** Powered by Python 3's built-in `http.server` and `sqlite3`, paired with vanilla modern JavaScript and CSS.
- **Full CRUD Capabilities:** Create, edit, and delete trips and individual expenses.
- **Budget Health & Utilization Meter:** Visual tracking with alert states when approaching or exceeding budgets.
- **Expense Categorization & Visual Breakdown:** Track spending across Transport, Stay, Food, Activities, Shopping, and Other categories.
- **Live Search & Multi-Criteria Filtering:** Filter by category, search by notes/descriptions, and sort by date or amount.
- **Currency-Aware:** Support for major travel currencies (`INR`, `USD`, `EUR`, `GBP`, `JPY`, `AUD`, `CAD`, `CHF`, `SGD`, `AED`, `THB`, `NZD`) with native `Intl.NumberFormat`.
- **Sanitized CSV Export:** Export expenses per trip with dynamic file naming and formula-injection protections.
- **SQLite Concurrency & Data Safety:** Configured with Write-Ahead Logging (`WAL`), `NORMAL` synchronous mode, cascading foreign keys, and indexed queries.
- **Production-Ready Containerization:** Non-root execution (`10001:10001`), Docker health check, and loopback binding.

---

## Quick Start

### Option 1: Run with Docker Compose (Recommended)

Make sure Docker Desktop is installed and running, then execute from the repository root:

```sh
docker compose up --build -d
```

- Open **[http://localhost:8080](http://localhost:8080)** in your browser.
- Data is saved in the persistent Docker volume `travel-data`.
- To stop the container: `docker compose down`
- To view live logs: `docker compose logs -f`

### Option 2: Run Locally (Without Docker)

Requires Python 3.10 or newer (tested on Python 3.10 - 3.13):

```sh
python server.py
```

- Open **[http://localhost:8080](http://localhost:8080)** in your browser.
- SQLite database will be created automatically in `./data/travel.db`.
- Custom configurations:
  - `PORT=3000 python server.py` (change listening port)
  - `DATA_DIR=/path/to/data python server.py` (custom database storage path)

---

## API Reference

### Trips
- `GET /api/trips`: List all trips and nested expenses.
- `GET /api/trips/{id}`: Retrieve a single trip by ID.
- `POST /api/trips`: Create a new trip.
  - Body: `{"name": "string", "destination": "string", "budget": float, "currency": "USD"}`
- `PUT /api/trips/{id}`: Update an existing trip.
  - Body: `{"name": "string", "destination": "string", "budget": float, "currency": "USD"}`
- `DELETE /api/trips/{id}`: Delete a trip and its expenses (cascade).

### Expenses
- `POST /api/expenses`: Record an expense for a trip.
  - Body: `{"trip_id": int, "description": "string", "category": "Food", "amount": float, "date": "YYYY-MM-DD"}`
- `PUT /api/expenses/{id}`: Update an existing expense.
  - Body: `{"description": "string", "category": "Food", "amount": float, "date": "YYYY-MM-DD"}`
- `DELETE /api/expenses/{id}`: Delete an individual expense.

### System
- `GET /health`: Health check endpoint (`{"status": "ok"}`).

---

## Security & Best Practices

- **Security Headers:** Responses automatically include `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: strict-origin-when-cross-origin`.
- **Injection Defenses:** Parameterized SQLite queries throughout; CSV exports escape spreadsheet formula operators (`=`, `+`, `-`, `@`, `\t`, `\r`).
- **Input Sanitization:** Validated ISO-8601 dates, numeric boundaries, allowed currency/category enums, and string length bounds.
