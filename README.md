# RETO — Beyond Borders. Within Reach.

RETO is an India-focused US-retailer discovery and sourcing platform. The repository now contains a storefront, a Node.js API, a PostgreSQL data model, customer account pages, an admin workspace and automated smoke tests.

## Current architecture
- `index.html`: responsive discovery storefront; uses demo product cards until the API has published products.
- `account.html`: customer registration, login and sourcing-enquiry form.
- `admin.html`: admin-only product and enquiry operations UI (API enforces admin permissions).
- `server.js`: Express API, JWT sessions, password hashing, input validation, PostgreSQL schema migration and retailer seed directory.
- `openapi.yaml`: API contract.
- `tests/smoke.test.js`: Node test-runner safety and route checks.
- `sw.js`: installable app shell; API responses are deliberately never cached.

## Local development
Requirements: Node.js 20+ and PostgreSQL.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env`.
3. Set `DATABASE_URL` to a database you are authorised to use.
4. Set `JWT_SECRET` to a randomly generated secret with at least 32 characters.
5. Set `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` of at least 12 characters.
6. Start: `npm start`
7. Open `http://localhost:10000`.

Run checks with `npm run check`.

## API overview
- `GET /api/health`
- `GET /api/catalogue`
- `GET /api/retailers`
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/me`
- `POST /api/inquiries`
- `POST /api/order-requests`
- Admin: `GET /api/admin/inquiries`, `PATCH /api/admin/inquiries/:id`, `POST /api/admin/products`, `PATCH /api/admin/products/:id`, `GET /api/admin/orders`

See `openapi.yaml` for request/response contract details.

## Render deployment
The existing `reto-store.onrender.com` resource is a **Static Site**. It cannot run this Node server. To activate the backend, create a separate Render **Node Web Service** from this repository:
- Build command: `npm install`
- Start command: `npm start`
- Add `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `DATABASE_SSL` as private environment variables.
- Provision a dedicated PostgreSQL database and use its internal connection string when both services are in the same Render region.

Do not point RETO at a database belonging to another application. The connected Render workspace currently has an existing free database for another project and cannot provision a second free database; no database has been attached to RETO. Do not select a paid plan without the owner's approval. The API is therefore committed but not yet deployed.

## Sale-readiness safeguards
- Products default to draft, availability unverified and resale authorisation false.
- Customer order requests are rejected unless each product is published, marked in stock and explicitly marked as authorised for resale.
- Payment processing is not implemented. No card or UPI details are collected.
- Retailer directory entries are not supplier contracts or proof of export/resale rights.
- Verify supplier permissions, stock, India import restrictions and product certifications, HS codes, customs duties/IGST, freight, warranty, returns and fulfilment before accepting payment or promising delivery.

This is a working software foundation, not yet a production-ready marketplace. Add email verification, password recovery, audit logs, privacy/terms/refund policies, backups, monitoring, payment integration and security review before public commerce launch.
