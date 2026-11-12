import json
import os
import sqlite3
from datetime import date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
DATA_DIR = Path(os.environ.get('DATA_DIR', str(ROOT / 'data')))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / 'travel.db'

SUPPORTED_CURRENCIES = {'INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'SGD', 'AED', 'THB', 'NZD'}
SUPPORTED_CATEGORIES = {'Transport', 'Stay', 'Food', 'Activities', 'Shopping', 'Other'}


def connect():
    db = sqlite3.connect(DB_PATH, timeout=15.0)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys = ON')
    db.execute('PRAGMA journal_mode = WAL')
    db.execute('PRAGMA synchronous = NORMAL')
    return db


def init_db():
    with connect() as db:
        db.executescript('''
            CREATE TABLE IF NOT EXISTS trips (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                destination TEXT NOT NULL,
                budget REAL NOT NULL CHECK(budget > 0),
                currency TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
                description TEXT NOT NULL,
                category TEXT NOT NULL,
                amount REAL NOT NULL CHECK(amount > 0),
                date TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_expenses_trip_id ON expenses(trip_id);
            CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
        ''')


init_db()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'public'), **kwargs)

    def end_headers(self):
        # Security headers for all responses
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        super().end_headers()

    def reply(self, status, body):
        data = json.dumps(body).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def read_json_body(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
        except (ValueError, TypeError):
            raise ValueError('Invalid Content-Length header.')
        if length <= 0:
            raise ValueError('Request body cannot be empty.')
        if length > 32768:
            raise ValueError('Request body exceeds maximum size (32KB).')
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode('utf-8'))
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise ValueError('Malformed JSON payload.')

    def validate_trip(self, data):
        name = str(data.get('name', '')).strip()
        destination = str(data.get('destination', '')).strip()
        if not name:
            raise ValueError('Trip name is required.')
        if len(name) > 120:
            raise ValueError('Trip name cannot exceed 120 characters.')
        if not destination:
            raise ValueError('Trip destination is required.')
        if len(destination) > 120:
            raise ValueError('Destination cannot exceed 120 characters.')

        try:
            budget = float(data.get('budget', 0))
        except (ValueError, TypeError):
            raise ValueError('Budget must be a valid positive number.')
        if not (0 < budget < 1e12):
            raise ValueError('Budget must be between 0.01 and 1,000,000,000,000.')

        currency = str(data.get('currency', '')).upper().strip()
        if currency not in SUPPORTED_CURRENCIES:
            raise ValueError(f"Currency '{currency}' is not supported.")

        return name, destination, budget, currency

    def validate_expense(self, data):
        description = str(data.get('description', '')).strip()
        if not description:
            raise ValueError('Expense description is required.')
        if len(description) > 200:
            raise ValueError('Expense description cannot exceed 200 characters.')

        category = str(data.get('category', '')).strip()
        if category not in SUPPORTED_CATEGORIES:
            raise ValueError(f"Category '{category}' is invalid. Allowed: {', '.join(sorted(SUPPORTED_CATEGORIES))}")

        try:
            amount = float(data.get('amount', 0))
        except (ValueError, TypeError):
            raise ValueError('Amount must be a valid positive number.')
        if not (0 < amount < 1e12):
            raise ValueError('Amount must be between 0.01 and 1,000,000,000,000.')

        date_str = str(data.get('date', '')).strip()
        try:
            date.fromisoformat(date_str)
        except ValueError:
            raise ValueError('Date must be in valid ISO format (YYYY-MM-DD).')

        return description, category, amount, date_str

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Allow', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        clean_path = self.path.split('?')[0].rstrip('/')
        if clean_path == '/health':
            return self.reply(200, {'status': 'ok'})

        if clean_path == '/api/trips':
            with connect() as db:
                trips = [dict(r) for r in db.execute('SELECT * FROM trips ORDER BY id DESC')]
                for trip in trips:
                    trip['expenses'] = [
                        dict(r) for r in db.execute(
                            'SELECT * FROM expenses WHERE trip_id = ? ORDER BY date DESC, id DESC',
                            (trip['id'],)
                        )
                    ]
            return self.reply(200, trips)

        parts = clean_path.strip('/').split('/')
        if len(parts) == 3 and parts[:2] == ['api', 'trips'] and parts[2].isdigit():
            trip_id = int(parts[2])
            with connect() as db:
                row = db.execute('SELECT * FROM trips WHERE id = ?', (trip_id,)).fetchone()
                if not row:
                    return self.reply(404, {'error': 'Trip not found.'})
                trip = dict(row)
                trip['expenses'] = [
                    dict(r) for r in db.execute(
                        'SELECT * FROM expenses WHERE trip_id = ? ORDER BY date DESC, id DESC',
                        (trip_id,)
                    )
                ]
            return self.reply(200, trip)

        if self.path.startswith('/api/'):
            return self.reply(404, {'error': 'Endpoint not found.'})

        return super().do_GET()

    def do_POST(self):
        clean_path = self.path.split('?')[0].rstrip('/')
        try:
            data = self.read_json_body()
            with connect() as db:
                if clean_path == '/api/trips':
                    name, destination, budget, currency = self.validate_trip(data)
                    cursor = db.execute(
                        'INSERT INTO trips (name, destination, budget, currency) VALUES (?, ?, ?, ?)',
                        (name, destination, budget, currency)
                    )
                    return self.reply(201, {'ok': True, 'id': cursor.lastrowid})

                elif clean_path == '/api/expenses':
                    try:
                        trip_id = int(data.get('trip_id', 0))
                    except (ValueError, TypeError):
                        raise ValueError('A valid trip_id is required.')

                    trip = db.execute('SELECT id FROM trips WHERE id = ?', (trip_id,)).fetchone()
                    if not trip:
                        return self.reply(404, {'error': 'Selected trip does not exist.'})

                    description, category, amount, date_str = self.validate_expense(data)
                    cursor = db.execute(
                        'INSERT INTO expenses (trip_id, description, category, amount, date) VALUES (?, ?, ?, ?, ?)',
                        (trip_id, description, category, amount, date_str)
                    )
                    return self.reply(201, {'ok': True, 'id': cursor.lastrowid})

                else:
                    return self.reply(404, {'error': 'Endpoint not found.'})

        except ValueError as e:
            return self.reply(400, {'error': str(e)})
        except sqlite3.IntegrityError:
            return self.reply(400, {'error': 'Database integrity constraint failed.'})
        except Exception as e:
            return self.reply(500, {'error': 'Internal server error.'})

    def do_PUT(self):
        clean_path = self.path.split('?')[0].rstrip('/')
        parts = clean_path.strip('/').split('/')
        if len(parts) != 3 or parts[:2] not in [['api', 'trips'], ['api', 'expenses']] or not parts[2].isdigit():
            return self.reply(404, {'error': 'Endpoint not found.'})

        target_id = int(parts[2])
        target_type = parts[1]

        try:
            data = self.read_json_body()
            with connect() as db:
                if target_type == 'trips':
                    name, destination, budget, currency = self.validate_trip(data)
                    cur = db.execute(
                        'UPDATE trips SET name = ?, destination = ?, budget = ?, currency = ? WHERE id = ?',
                        (name, destination, budget, currency, target_id)
                    )
                    if cur.rowcount == 0:
                        return self.reply(404, {'error': 'Trip not found.'})
                    return self.reply(200, {'ok': True, 'message': 'Trip updated successfully.'})

                elif target_type == 'expenses':
                    description, category, amount, date_str = self.validate_expense(data)
                    cur = db.execute(
                        'UPDATE expenses SET description = ?, category = ?, amount = ?, date = ? WHERE id = ?',
                        (description, category, amount, date_str, target_id)
                    )
                    if cur.rowcount == 0:
                        return self.reply(404, {'error': 'Expense not found.'})
                    return self.reply(200, {'ok': True, 'message': 'Expense updated successfully.'})

        except ValueError as e:
            return self.reply(400, {'error': str(e)})
        except Exception:
            return self.reply(500, {'error': 'Internal server error.'})

    def do_DELETE(self):
        clean_path = self.path.split('?')[0].rstrip('/')
        parts = clean_path.strip('/').split('/')
        if len(parts) != 3 or parts[:2] not in [['api', 'trips'], ['api', 'expenses']] or not parts[2].isdigit():
            return self.reply(404, {'error': 'Endpoint not found.'})

        table = 'trips' if parts[1] == 'trips' else 'expenses'
        target_id = int(parts[2])

        with connect() as db:
            cur = db.execute(f'DELETE FROM {table} WHERE id = ?', (target_id,))
            if cur.rowcount == 0:
                item_name = 'Trip' if table == 'trips' else 'Expense'
                return self.reply(404, {'error': f'{item_name} not found.'})

        return self.reply(200, {'ok': True})


def run_server():
    port = int(os.environ.get('PORT', '8080'))
    server_address = ('0.0.0.0', port)
    httpd = ThreadingHTTPServer(server_address, Handler)
    print(f'Roam Travel Expense Tracker serving on http://localhost:{port}')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down server gracefully...')
        httpd.shutdown()


if __name__ == '__main__':
    run_server()
