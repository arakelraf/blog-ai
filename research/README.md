# Research — manual (human-in-the-loop) mode

The automated daily publisher is **off**. Instead we run a manual loop:

```
1. Daily keyword sheet  →  research/keywords-YYYY-MM-DD.xlsx
     top AI search queries (by volume, US+CA+UK)
     → matched AI service per query
     → affiliate program? + terms (verify before trusting)
2. You review the sheet, pick rows, and try to sign up for the affiliate programs.
3. For each approved row you send back: query #, the service, and YOUR affiliate link.
4. Claude writes several SEO-optimized comparison articles for that service and
   publishes them to the blog.
```

## Sheet columns (`keywords-*.xlsx`)

| Column | Meaning |
|---|---|
| `#` | Row id — you reference this when approving (e.g. "row 7 approved") |
| `query` | The search phrase people use |
| `est_volume` | Approx. monthly search volume (or tier) |
| `intent` | commercial / informational / navigational |
| `page_type` | best-list / versus / review / alternatives / deal / guide |
| `category` | ai-writing, ai-seo, ai-image, ai-video, … |
| `matched_service` | The leading AI service that answers the query |
| `service_url` | The service's website |
| `affiliate?` | Yes / No / Unknown — does an affiliate program exist |
| `network` | Impact / PartnerStack / direct / … |
| `commission` | Stated terms — **always verify on signup**, never taken as final |
| `cookie` | Cookie window if known |
| `apply_url` | Where to apply for the program |
| `notes` | Anything useful (verify flags, caveats) |
| `status` | **You fill this**: `approved` / `rejected` / `pending` / `registered` |
| `your_affiliate_link` | **You fill this** after signup — Claude uses it in the articles |

## Honesty rule

Commissions, cookie windows and prices in the sheet are **researched, not guaranteed**
— the `commission` / `cookie` columns are starting points you confirm at signup. Articles
only ever use facts you've verified and sent back.
