# Privacy Policy

**Effective date:** 2026-05-11
**Status:** Pre-alpha. This policy will be updated before public beta launch.

Sepio ("we", "us", "our") operates the Sepio platform — an
open-source content automation service for marketing consultants. This
Privacy Policy explains what data we collect, how we use it, and the
choices you have.

If you have any questions, contact us at **greg@sepio.app**.

---

## 1. Who we are

Sepio is operated by **WOW SOLUCIONES**, a business registered in the
Republic of Panama (Aviso de Operación N° E-8-234290-2025-292016), owned
by Ryhor (Grigoriy) Baranchuk. Registered address: edificio PH Pijao,
oficina 401, Calle Green Bay, Urbanización Costa del Este, Corregimiento
Juan Díaz, Distrito y Provincia de Panamá, República de Panamá.

The hosted product runs on managed cloud infrastructure
(Vercel, Supabase, Railway, AWS). The same source code is also
available as open-source at
[github.com/wow-solutions/Sepio](https://github.com/wow-solutions/Sepio)
for self-hosting.

## 2. Data we collect

### 2.1 Account data
- Email address
- Display name
- Password (hashed via Supabase Auth — we never see your plaintext password)
- Billing information (handled by Lemon Squeezy — we receive only
  customer ID and subscription state, never card details)

### 2.2 Brand configuration data
- Brand name, slug, website, industry, language, description
- Brand voice configuration (tone, forbidden/required phrases)
- Customer pain points and desired outcomes you provide
- SEO/GEO keyword configuration
- Internal link maps

### 2.3 Third-party OAuth tokens
When you connect a social account (LinkedIn, Facebook, Instagram, X,
WordPress, Webflow, Shopify) to a brand, we store the OAuth access
token in encrypted form using Supabase Vault. Tokens are:
- Encrypted at rest with AES-256
- Scoped per-brand (no token is shared between brands or tenants)
- Used only for actions you explicitly request (publish a post,
  read engagement metrics for posts we published)
- Revocable at any time from the brand settings page

### 2.4 Generated content
- Posts drafted, approved, scheduled, published
- Research data fetched from DataForSEO on your behalf
- Engagement metrics synced back from connected platforms

### 2.5 Usage and operational data
- Plan tier, posts used per billing period, brand count
- Audit log (security-relevant actions: OAuth connect/disconnect,
  publish, plan changes)
- Server logs (request paths, response codes, error traces) — retained
  30 days for debugging
- IP address and user agent (recorded in the audit log)

## 3. How we use your data

- **Provide the service:** generate content, manage brands, publish
  posts, sync metrics
- **Billing:** synchronize plan tier and usage with Lemon Squeezy
- **Security:** detect and prevent abuse via audit logs
- **Service communication:** transactional emails (signup verification,
  billing receipts, OAuth expiry notifications)
- **Product improvement:** aggregate, anonymized usage statistics

We do **not**:
- Sell or rent your data to third parties
- Use your content to train AI models
- Share OAuth tokens between tenants
- Post anything on your behalf without your explicit approval (every
  published post is a human-approved item)

## 4. Third-party services we use

| Service | Purpose | Data shared |
|---|---|---|
| Supabase | Database, Auth, Vault | Account data, brand configs, encrypted tokens |
| Anthropic (Claude API) | AI content generation | Brand voice config + prompt context (no PII) |
| DataForSEO | SEO research | Search keywords you submit |
| fal.ai | Image generation | Image prompts |
| Lemon Squeezy | Billing | Email, plan tier |
| LinkedIn (and other social platforms) | Publishing | Content you approve to publish |
| Vercel | Frontend hosting | Server logs |
| Railway / Fly.io | Backend hosting | Server logs |
| Sentry | Error tracking | Error traces (PII scrubbed) |

Each third party has its own privacy policy.

## 5. Your rights

You can at any time:
- **Access** your data — export from the dashboard or by request
- **Delete** your account — removes all account, brand, content, and
  token data within 30 days
- **Revoke OAuth tokens** — from the brand settings page or directly
  on the third-party platform
- **Export** your generated content as JSON or CSV
- **Update or correct** any data via the dashboard
- **Withdraw consent** for marketing communications (we don't send
  marketing emails during pre-alpha, but you can opt out at any time)

If you are an EU/UK resident, you have rights under GDPR. If you are a
California resident, you have rights under CCPA. To exercise these
rights, email **greg@sepio.app**.

## 6. Data retention

- **Account data:** retained while your account is active. Deleted
  within 30 days of account deletion.
- **OAuth tokens:** retained until you disconnect the brand. Token
  rotation is automatic where supported by the platform.
- **Generated content:** retained while your account is active.
- **Audit logs:** retained 1 year.
- **Server logs:** retained 30 days.

## 7. Security

We use industry-standard practices:
- TLS 1.2+ for all data in transit
- AES-256 encryption at rest for OAuth tokens (Supabase Vault)
- Row-Level Security (RLS) policies in Postgres to enforce tenant
  isolation
- Hashed passwords (bcrypt via Supabase Auth)
- Audit logging of security-relevant actions

No system is 100% secure. If we become aware of a data breach affecting
you, we will notify you and the relevant authorities as required by
law.

## 8. Children's privacy

Sepio is not directed at children under 16. We do not knowingly
collect data from children.

## 9. International transfers

Data is stored on AWS infrastructure in the United States via Supabase.
By using the service you consent to this transfer.

## 10. Changes to this policy

We will post any changes to this policy on this page and update the
"Effective date" above. Material changes will be announced via email.

## 11. Contact

**Operator:** WOW SOLUCIONES (Panamá) · Aviso de Operación N° E-8-234290-2025-292016
**Email:** greg@sepio.app
**GitHub:** [github.com/wow-solutions/Sepio](https://github.com/wow-solutions/Sepio)
