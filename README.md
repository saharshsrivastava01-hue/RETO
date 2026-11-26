# RETO — Beyond Borders. Within Reach.

A responsive, installable, static storefront prototype for global product discovery in India.

## Features
- Responsive product discovery, search, category filters, sorting
- Local wishlist and demo bag (browser localStorage)
- Indicative landed-cost planner with editable FX, shipping and illustrative duty assumptions
- Independent retailer directory
- Local sourcing-enquiry draft generator
- PWA manifest and service worker for install/offline shell

## Run locally
Open `index.html` in a browser, or run:
`python -m http.server 8000`
Then visit http://localhost:8000.

## Deploy on Render
Create a Render Static Site connected to this repository:
- Build command: `echo "Static site ready"`
- Publish directory: `.`
- Branch: `main`
- Auto-deploy: enabled

## Important limitations
This is a discovery prototype, not a live retail marketplace. Product cards are illustrative samples, not verified live listings, stock, prices or offers. Retailer links are independent links; RETO is not affiliated with or endorsed by them. No payment, order processing, customer accounts, supplier integrations, automatic emails or live product feeds are implemented. Cart and wishlist data stay in the browser.

Before selling anything, verify supplier resale/export rights, product-specific Indian import restrictions and certifications, HS classification, duties/IGST, freight, warranty, returns, inventory and fulfilment. Have a qualified customs professional confirm landed costs. Add secure backend, privacy/terms/refund policies, payment gateway and order management before accepting payments.
