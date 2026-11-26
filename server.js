require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { z } = require("zod");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 10000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("JWT_SECRET must be set to a random value of at least 32 characters.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "").split(",").map(x => x.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("Origin not allowed"));
  },
  methods: ["GET", "POST", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "1mb" }));
app.use("/api", rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false }));

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const emailSchema = z.string().email().max(254).transform(v => v.toLowerCase());
const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: emailSchema,
  password: z.string().min(10).max(128)
});
const productSchema = z.object({
  name: z.string().trim().min(2).max(180),
  brand: z.string().trim().max(100).optional().default(""),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000).optional().default(""),
  image_url: z.string().url().max(1000).optional().or(z.literal("")).default(""),
  retailer_name: z.string().trim().max(120).optional().default(""),
  retailer_url: z.string().url().max(1000).optional().or(z.literal("")).default(""),
  source_price_usd: z.number().positive().max(100000).nullable().optional(),
  currency: z.string().length(3).default("USD"),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  availability_status: z.enum(["unverified", "in_stock", "out_of_stock", "discontinued"]).default("unverified"),
  is_authorised_for_resale: z.boolean().default(false)
});
const inquirySchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: emailSchema,
  phone: z.string().trim().max(40).optional().default(""),
  product_name: z.string().trim().min(2).max(180),
  product_url: z.string().url().max(1000).optional().or(z.literal("")).default(""),
  quantity: z.number().int().min(1).max(10000).default(1),
  budget_inr: z.number().nonnegative().max(100000000).nullable().optional(),
  notes: z.string().trim().max(3000).optional().default("")
});

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: "7d", issuer: "reto-api", audience: "reto-client" });
}
function auth(requiredRole) {
  return (req, res, next) => {
    const raw = req.headers.authorization || "";
    const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
    try {
      if (!token) return res.status(401).json({ error: "Authentication required" });
      const payload = jwt.verify(token, JWT_SECRET, { issuer: "reto-api", audience: "reto-client" });
      if (requiredRole && payload.role !== requiredRole) return res.status(403).json({ error: "Insufficient permissions" });
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ error: "Invalid or expired session" });
    }
  };
}

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS retailers (
      id BIGSERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL UNIQUE,
      category VARCHAR(120) NOT NULL DEFAULT '', website_url TEXT NOT NULL,
      country VARCHAR(2) NOT NULL DEFAULT 'US', status VARCHAR(20) NOT NULL DEFAULT 'directory',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS products (
      id BIGSERIAL PRIMARY KEY, name VARCHAR(180) NOT NULL, brand VARCHAR(100) NOT NULL DEFAULT '',
      category VARCHAR(80) NOT NULL, description TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '', retailer_name VARCHAR(120) NOT NULL DEFAULT '',
      retailer_url TEXT NOT NULL DEFAULT '', source_price_usd NUMERIC(12,2),
      currency VARCHAR(3) NOT NULL DEFAULT 'USD', status VARCHAR(20) NOT NULL DEFAULT 'draft',
      availability_status VARCHAR(30) NOT NULL DEFAULT 'unverified',
      is_authorised_for_resale BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS products_public_idx ON products(status, category);
    CREATE TABLE IF NOT EXISTS sourcing_inquiries (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(100) NOT NULL, email VARCHAR(254) NOT NULL, phone VARCHAR(40) NOT NULL DEFAULT '',
      product_name VARCHAR(180) NOT NULL, product_url TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 1, budget_inr NUMERIC(14,2),
      notes TEXT NOT NULL DEFAULT '', status VARCHAR(30) NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS order_requests (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      customer_name VARCHAR(100) NOT NULL, email VARCHAR(254) NOT NULL,
      items JSONB NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'needs_supplier_verification',
      payment_status VARCHAR(30) NOT NULL DEFAULT 'not_enabled',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  const adminEmail = process.env.ADMIN_EMAIL && process.env.ADMIN_EMAIL.toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword && adminPassword.length >= 12) {
    const hash = await bcrypt.hash(adminPassword, 12);
    await pool.query(
      `INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'admin')
       ON CONFLICT(email) DO NOTHING`,
      ["RETO Administrator", adminEmail, hash]
    );
  }
  const seed = [
    ["Best Buy","Electronics & technology","https://www.bestbuy.com/"],
    ["Amazon US","Marketplace","https://www.amazon.com/"],
    ["Walmart","General merchandise","https://www.walmart.com/"],
    ["Target","Home, style & essentials","https://www.target.com/"],
    ["Apple","Consumer technology","https://www.apple.com/"],
    ["Nike","Sport & apparel","https://www.nike.com/"],
    ["Sephora","Beauty","https://www.sephora.com/"],
    ["Home Depot","Home improvement","https://www.homedepot.com/"],
    ["Costco","Membership warehouse retail","https://www.costco.com/"],
    ["Newegg","PC parts & technology","https://www.newegg.com/"],
    ["B&H Photo Video","Cameras & AV","https://www.bhphotovideo.com/"],
    ["Macy's","Fashion & home","https://www.macys.com/"]
  ];
  for (const r of seed) await pool.query(
    `INSERT INTO retailers(name,category,website_url) VALUES($1,$2,$3) ON CONFLICT(name) DO NOTHING`, r
  );
}

app.get("/api/health", asyncRoute(async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ ok: true, service: "reto-api", database: "connected", version: "1.0.0" });
}));
app.get("/api/catalogue", asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id,name,brand,category,description,image_url,retailer_name,retailer_url,
      source_price_usd,currency,availability_status,is_authorised_for_resale
     FROM products WHERE status='published' ORDER BY created_at DESC LIMIT 200`
  );
  res.json({ items: rows, count: rows.length, note: "Only published records are shown. Availability must be independently verified." });
}));
app.get("/api/retailers", asyncRoute(async (_req, res) => {
  const { rows } = await pool.query("SELECT id,name,category,website_url,country,status FROM retailers ORDER BY name");
  res.json({ items: rows });
}));
app.post("/api/auth/register", rateLimit({ windowMs: 60 * 60 * 1000, limit: 8 }), asyncRoute(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid registration details", details: parsed.error.issues.map(i => i.message) });
  const { name, email, password } = parsed.data;
  const hash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await pool.query("INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email,role", [name,email,hash]);
    const user = rows[0];
    res.status(201).json({ user, token: signToken(user) });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "An account with this email already exists" });
    throw e;
  }
}));
app.post("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, limit: 10 }), asyncRoute(async (req, res) => {
  const parsed = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Email and password are required" });
  const { rows } = await pool.query("SELECT id,name,email,role,password_hash FROM users WHERE email=$1", [parsed.data.email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(parsed.data.password,user.password_hash))) return res.status(401).json({ error: "Email or password is incorrect" });
  delete user.password_hash;
  res.json({ user, token: signToken(user) });
}));
app.get("/api/me", auth(), asyncRoute(async (req, res) => {
  const { rows } = await pool.query("SELECT id,name,email,role,created_at FROM users WHERE id=$1", [req.user.sub]);
  if (!rows[0]) return res.status(404).json({ error: "Account not found" });
  res.json({ user: rows[0] });
}));
app.post("/api/inquiries", asyncRoute(async (req, res) => {
  const parsed = inquirySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Please check the enquiry details", details: parsed.error.issues.map(i => i.message) });
  const d = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO sourcing_inquiries(name,email,phone,product_name,product_url,quantity,budget_inr,notes)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,status,created_at`,
    [d.name,d.email,d.phone,d.product_name,d.product_url,d.quantity,d.budget_inr ?? null,d.notes]
  );
  res.status(201).json({ inquiry: rows[0], message: "Enquiry received. This is not an order or confirmation of supply." });
}));
app.post("/api/order-requests", auth(), asyncRoute(async (req, res) => {
  const schema = z.object({
    customer_name: z.string().trim().min(2).max(100),
    email: emailSchema,
    items: z.array(z.object({ product_id: z.number().int().positive(), quantity: z.number().int().min(1).max(100) })).min(1).max(30)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid order request" });
  const ids = parsed.data.items.map(i => i.product_id);
  const { rows: found } = await pool.query("SELECT id,name,status,availability_status,is_authorised_for_resale FROM products WHERE id = ANY($1::bigint[])", [ids]);
  if (found.length !== new Set(ids).size || found.some(p => p.status !== "published" || p.availability_status !== "in_stock" || !p.is_authorised_for_resale)) {
    return res.status(409).json({ error: "These products are not verified for sale. Submit a sourcing enquiry instead; no order or payment was created." });
  }
  const { rows } = await pool.query(
    "INSERT INTO order_requests(user_id,customer_name,email,items) VALUES($1,$2,$3,$4) RETURNING id,status,payment_status,created_at",
    [req.user.sub,parsed.data.customer_name,parsed.data.email,JSON.stringify(parsed.data.items)]
  );
  res.status(201).json({ request: rows[0], message: "Request recorded for manual confirmation. Payment is not enabled." });
}));
app.get("/api/admin/inquiries", auth("admin"), asyncRoute(async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM sourcing_inquiries ORDER BY created_at DESC LIMIT 300");
  res.json({ items: rows });
}));
app.patch("/api/admin/inquiries/:id", auth("admin"), asyncRoute(async (req, res) => {
  const parsed = z.object({ status: z.enum(["new","reviewing","supplier_check","quoted","closed","rejected"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid inquiry status" });
  const { rows } = await pool.query("UPDATE sourcing_inquiries SET status=$1 WHERE id=$2 RETURNING id,status", [parsed.data.status,req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Inquiry not found" });
  res.json({ inquiry: rows[0] });
}));
app.post("/api/admin/products", auth("admin"), asyncRoute(async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid product", details: parsed.error.issues.map(i => i.message) });
  const d = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO products(name,brand,category,description,image_url,retailer_name,retailer_url,source_price_usd,currency,status,availability_status,is_authorised_for_resale)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [d.name,d.brand,d.category,d.description,d.image_url,d.retailer_name,d.retailer_url,d.source_price_usd ?? null,d.currency,d.status,d.availability_status,d.is_authorised_for_resale]
  );
  res.status(201).json({ product: rows[0] });
}));
app.patch("/api/admin/products/:id", auth("admin"), asyncRoute(async (req, res) => {
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data || {}).length === 0) return res.status(400).json({ error: "Provide valid product fields" });
  const keys = Object.keys(parsed.data);
  const vals = Object.values(parsed.data);
  const sets = keys.map((k,i) => `${k}=$${i+1}`);
  vals.push(req.params.id);
  const { rows } = await pool.query(`UPDATE products SET ${sets.join(",")},updated_at=NOW() WHERE id=$${vals.length} RETURNING *`, vals);
  if (!rows[0]) return res.status(404).json({ error: "Product not found" });
  res.json({ product: rows[0] });
}));
app.get("/api/admin/orders", auth("admin"), asyncRoute(async (_req, res) => {
  const { rows } = await pool.query("SELECT id,customer_name,email,items,status,payment_status,created_at FROM order_requests ORDER BY created_at DESC LIMIT 300");
  res.json({ items: rows });
}));

// Serve the existing storefront from this same Node service.
app.use(express.static(path.join(__dirname), { index: "index.html", dotfiles: "ignore" }));
app.use((req,res) => res.status(404).json({ error: "Route not found" }));
app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Unexpected server error" });
});

migrate().then(() => {
  app.listen(PORT, "0.0.0.0", () => console.log(`RETO API listening on ${PORT}`));
}).catch(err => {
  console.error("Database startup failed:", err);
  process.exit(1);
});
