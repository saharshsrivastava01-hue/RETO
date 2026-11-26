# RETO full-stack backend

This repository now includes a Node.js/Express API backed by PostgreSQL. The same Node service can serve the existing `index.html` storefront and the `/api/*` endpoints.

## Implemented API
- `GET /api/health` — service/database health.
- `GET /api/catalogue` — published catalogue only.
- `GET /api/retailers` — retailer directory.
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/me` — customer accounts and signed sessions.
- `POST /api/inquiries` — validated sourcing enquiry intake.
- `POST /api/order-requests` — authenticated request intake, blocked unless each item is published, in stock and explicitly authorised for resale.
- `GET /api/admin/inquiries`, `PATCH /api/admin/inquiries/:id`, `POST /api/admin/products`, `PATCH /api/admin/products/:id`, `GET /api/admin/orders` — admin-only operations.

## Local setup
1. Install Node.js 20 or later and PostgreSQL.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and set a private database URL, a random JWT secret (32+ characters), and a strong admin password (12+ characters).
4. Run `npm start`; open `http://localhost:10000`.

## Render deployment
Create a PostgreSQL database and a Node web service from this repository. Use:
- Build command: `npm install`
- Start command: `npm start`
- Runtime: Node
- Environment variables: `DATABASE_URL` (from Render database), `DATABASE_SSL=true` if required by the database, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `FRONTEND_ORIGIN` (the deployed site origin).

Do not commit secrets or place admin credentials in frontend code. Configure database networking and TLS as required by the selected Render region/plan.

## Important operational boundaries
The initial retailer list is a directory, not a supplier integration. No retailer catalogue feed, stock, export eligibility, wholesale/resale authorisation, shipping rates, customs classification or landed price is asserted by this API. Product records start as drafts and availability starts unverified. Only an administrator can publish products or mark stock and resale authorisation. Order requests are deliberately blocked until all sale-readiness flags are verified. Payment processing is not implemented; no card or UPI details should be collected by this application.

For production, add email verification, password reset, audit logs, CSRF strategy if cookies are introduced, automated backups, monitoring, privacy/terms pages and a payment provider only after business/legal readiness checks.
