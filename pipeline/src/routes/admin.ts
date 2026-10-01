import type { FastifyInstance } from "fastify";
import basicAuth from "@fastify/basic-auth";
import formbody from "@fastify/formbody";
import { eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { db } from "../db/client.js";
import { affiliates, type Affiliate } from "../db/schema.js";
import { parseCsv } from "../lib/csv.js";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function parsePricing(raw: string): { plan: string; price: string; note?: string }[] {
  // "Starter:$29/mo:50k words | Pro:$59/mo"
  return raw
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [plan = "", price = "", note] = s.split(":").map((x) => x.trim());
      return note ? { plan, price, note } : { plan, price };
    });
}
const parseList = (raw: string) => raw.split("|").map((s) => s.trim()).filter(Boolean);

function page(rows: Affiliate[]): string {
  const list = rows
    .map(
      (a) => `<tr>
      <td>${a.id}</td><td><b>${esc(a.name)}</b><br><small>${esc(a.category)}</small></td>
      <td>${esc(a.commission ?? "—")}</td><td>${a.cookieDays ?? "—"}d</td>
      <td>${a.rating ?? "—"}</td><td>${(a.pros ?? []).length}+ / ${(a.cons ?? []).length}−</td>
      <td><a href="#" onclick="edit(${a.id})">edit</a> ·
        <form method="post" action="/admin/affiliate/${a.id}/delete" style="display:inline" onsubmit="return confirm('Delete ${esc(a.name)}?')"><button class="link">delete</button></form></td>
    </tr>`,
    )
    .join("");

  const data = JSON.stringify(rows);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Affiliates · admin</title>
<style>
  :root{font-family:system-ui,sans-serif;color:#1a1a1a}
  body{max-width:1000px;margin:2rem auto;padding:0 1rem}
  h1{font-size:1.5rem} h2{font-size:1.1rem;margin-top:2rem}
  table{width:100%;border-collapse:collapse;font-size:14px} td,th{padding:.5rem;border-bottom:1px solid #eee;text-align:left}
  input,textarea,select{width:100%;padding:.5rem;margin:.25rem 0;border:1px solid #ccc;border-radius:6px;font:inherit;box-sizing:border-box}
  label{font-size:12px;color:#555;font-weight:600} .row{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
  button{background:#4f46e5;color:#fff;border:0;padding:.6rem 1rem;border-radius:8px;font-weight:600;cursor:pointer}
  button.link{background:none;color:#c00;padding:0;font-weight:400;text-decoration:underline}
  fieldset{border:1px solid #ddd;border-radius:10px;margin:1rem 0;padding:1rem} small{color:#777}
</style></head><body>
<h1>Affiliate programs <small>(${rows.length})</small></h1>
<table><thead><tr><th>#</th><th>Name</th><th>Commission</th><th>Cookie</th><th>Rating</th><th>Pros/Cons</th><th></th></tr></thead>
<tbody>${list || '<tr><td colspan="7"><em>No affiliates yet. Add one below or import a CSV.</em></td></tr>'}</tbody></table>

<h2>Add / edit affiliate</h2>
<form method="post" action="/admin/affiliate">
  <input type="hidden" name="id" id="f_id">
  <div class="row">
    <div><label>Name*</label><input name="name" id="f_name" required></div>
    <div><label>Category*</label><input name="category" id="f_category" placeholder="ai-writing" required></div>
  </div>
  <div class="row">
    <div><label>Product URL*</label><input name="url" id="f_url" required></div>
    <div><label>Affiliate link*</label><input name="affiliate_link" id="f_affiliate_link" required></div>
  </div>
  <div class="row">
    <div><label>Network</label><input name="network" id="f_network" placeholder="Impact / PartnerStack"></div>
    <div><label>Commission (verbatim)</label><input name="commission" id="f_commission" placeholder="30% recurring"></div>
  </div>
  <div class="row">
    <div><label>Cookie days</label><input name="cookie_days" id="f_cookie_days" type="number"></div>
    <div><label>Rating (0-5)</label><input name="rating" id="f_rating" type="number" step="0.1"></div>
  </div>
  <div class="row">
    <div><label>Promo code</label><input name="promo_code" id="f_promo_code"></div>
    <div><label>Logo URL</label><input name="logo_url" id="f_logo_url"></div>
  </div>
  <label>Pricing <small>Plan:Price:Note | Plan:Price</small></label>
  <input name="pricing" id="f_pricing" placeholder="Starter:$29/mo:50k words | Pro:$59/mo">
  <label>Pros <small>pipe | separated</small></label>
  <input name="pros" id="f_pros" placeholder="Fast | Great brand voice">
  <label>Cons <small>pipe | separated (required — honesty)</small></label>
  <input name="cons" id="f_cons" placeholder="No desktop app | Pricey">
  <button type="submit">Save affiliate</button>
</form>

<h2>Import CSV</h2>
<form method="post" action="/admin/import">
  <small>Columns: name,url,affiliate_link,network,commission,cookie_days,category,pricing,promo_code,rating,pros,cons<br>
  (pricing/pros/cons use the same pipe syntax as above)</small>
  <textarea name="csv" rows="6" placeholder="name,url,affiliate_link,network,commission,cookie_days,category,pricing,promo_code,rating,pros,cons"></textarea>
  <button type="submit">Import</button>
</form>

<script>
  const DATA = ${data};
  function edit(id){
    const a = DATA.find(x=>x.id===id); if(!a) return;
    f_id.value=a.id; f_name.value=a.name||''; f_category.value=a.category||''; f_url.value=a.url||'';
    f_affiliate_link.value=a.affiliate_link||a.affiliateLink||''; f_network.value=a.network||'';
    f_commission.value=a.commission||''; f_cookie_days.value=a.cookie_days||a.cookieDays||'';
    f_rating.value=a.rating||''; f_promo_code.value=a.promo_code||a.promoCode||''; f_logo_url.value=a.logo_url||a.logoUrl||'';
    f_pricing.value=(a.pricing||[]).map(p=>[p.plan,p.price,p.note].filter(Boolean).join(':')).join(' | ');
    f_pros.value=(a.pros||[]).join(' | '); f_cons.value=(a.cons||[]).join(' | ');
    window.scrollTo(0,document.body.scrollHeight);
  }
</script>
</body></html>`;
}

interface AffForm {
  id?: string;
  name?: string;
  url?: string;
  affiliate_link?: string;
  network?: string;
  commission?: string;
  cookie_days?: string;
  category?: string;
  pricing?: string;
  promo_code?: string;
  rating?: string;
  logo_url?: string;
  pros?: string;
  cons?: string;
}

function upsertFromForm(f: AffForm): void {
  const values = {
    name: f.name ?? "",
    url: f.url ?? "",
    affiliateLink: f.affiliate_link ?? "",
    network: f.network || null,
    commission: f.commission || null,
    cookieDays: f.cookie_days ? Number(f.cookie_days) : null,
    category: f.category ?? "",
    pricing: f.pricing ? parsePricing(f.pricing) : [],
    promoCode: f.promo_code || null,
    rating: f.rating ? Number(f.rating) : null,
    logoUrl: f.logo_url || null,
    pros: f.pros ? parseList(f.pros) : [],
    cons: f.cons ? parseList(f.cons) : [],
    active: true,
  };
  if (f.id) db.update(affiliates).set(values).where(eq(affiliates.id, Number(f.id))).run();
  else db.insert(affiliates).values(values).run();
}

export async function registerAdmin(app: FastifyInstance, ctx: AppContext): Promise<void> {
  await app.register(formbody);
  await app.register(basicAuth, {
    validate: async (username, password) => {
      if (username !== ctx.env.ADMIN_USER || password !== ctx.env.ADMIN_PASSWORD) {
        throw new Error("Unauthorized");
      }
    },
    authenticate: { realm: "blog-ai admin" },
  });

  app.after(() => {
    const guard = { onRequest: app.basicAuth };

    app.get("/admin", guard, async (_req, reply) => {
      const rows = db.select().from(affiliates).all();
      reply.type("text/html").send(page(rows));
    });

    app.post<{ Body: AffForm }>("/admin/affiliate", guard, async (req, reply) => {
      upsertFromForm(req.body);
      reply.redirect("/admin");
    });

    app.post<{ Params: { id: string } }>("/admin/affiliate/:id/delete", guard, async (req, reply) => {
      db.delete(affiliates).where(eq(affiliates.id, Number(req.params.id))).run();
      reply.redirect("/admin");
    });

    app.post<{ Body: { csv?: string } }>("/admin/import", guard, async (req, reply) => {
      const rows = parseCsv(req.body.csv ?? "");
      const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
      let imported = 0;
      for (const r of rows.slice(1)) {
        const rec: Record<string, string> = {};
        header.forEach((h, i) => (rec[h] = r[i] ?? ""));
        if (!rec.name || !rec.category) continue;
        upsertFromForm({
          name: rec.name,
          url: rec.url,
          affiliate_link: rec.affiliate_link,
          network: rec.network,
          commission: rec.commission,
          cookie_days: rec.cookie_days,
          category: rec.category,
          pricing: rec.pricing,
          promo_code: rec.promo_code,
          rating: rec.rating,
          pros: rec.pros,
          cons: rec.cons,
        });
        imported++;
      }
      reply.type("text/html").send(`<p>Imported ${imported} affiliates. <a href="/admin">Back</a></p>`);
    });
  });
}
