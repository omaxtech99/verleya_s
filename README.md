# VELREYA — Shopify storefront

This folder holds the VELREYA luxury fragrance store. It is separate from the OmaxTech website in `frontend/` and `backend/`, which is untouched.

| Path | What it is |
| --- | --- |
| `velreya-theme/` | Shopify Online Store 2.0 theme (Liquid, JSON templates, sections, vanilla JS, no build step) |
| `velreya-bundles-app/` | Custom Shopify app with a **Cart Transform Function** that makes the 4 × 12ml discovery set a real bundle |
| `data/fragrances-template.csv` | A blank sheet for the official data of the twelve fragrances (names, notes, colors, story) |

> **Status: this has not been tested end-to-end against a live store.** Theme Check passes with 0 errors. The function's unit tests pass. Every page was rendered with mock data in a local Liquid harness, and the desktop and mobile screenshots were reviewed. The real checkout, bundle expansion and inventory still need to be verified on a development store. Follow the checklist at the end.

---

## 1. Install the theme (unpublished preview)

```bash
npm install -g @shopify/cli
cd shopify/velreya-theme
shopify theme push --unpublished --store YOUR-STORE.myshopify.com
```

Or zip the *contents* of `velreya-theme/` and upload it via **Online Store → Themes → Add theme → Upload zip file**. Preview it before publishing.

For local development against your store, use `shopify theme dev --store YOUR-STORE.myshopify.com`.

## 2. Product data model

### 2.1 Metafield definitions

Create these under **Settings → Custom data → Products**. Use namespace `velreya`.

| Key | Type | Used for |
| --- | --- | --- |
| `velreya.character` | Single line text | Short scent character ("Warm amber, softly smoky") on cards, the atelier, the spotlight and the PDP |
| `velreya.top_notes` | List of single line text | Top notes |
| `velreya.heart_notes` | List of single line text | Heart notes |
| `velreya.base_notes` | List of single line text | Base notes |
| `velreya.atmosphere` | Color | The fragrance's atmospheric light: glows, the PDP, the spotlight and Explore |
| `velreya.atmosphere_secondary` | Color | Second atmospheric color (optional) |
| `velreya.story` | Multi-line text | Fragrance story (PDP, spotlight, Explore) |
| `velreya.mini_image` | File (image) | Photograph of the **12ml** bottle (discovery atelier). Falls back to the 12ml variant image. |
| `velreya.campaign_video` | File (video) | Optional per-fragrance clip for the Explore page |
| `velreya.family` | Single line text | Optional. The proposed scent family, used to build automated collections |
| `velreya.discovery_components` | List of product variant references | **Discovery set product only.** The allow-list of the 12ml variants |
| `velreya.discovery_count` | Integer | **Discovery set product only.** Fragrances per set (default 4) |

**Use the official notes exactly as supplied.** The theme only displays what is in these metafields. It never invents notes. The original brief was cut off before the official list of twelve fragrances, so no fragrance names or notes are hard-coded anywhere. Fill in `data/fragrances-template.csv`, then enter the values in admin, or import them with a metafield-capable CSV app such as Matrixify.

### 2.2 Products and variants

- **12 fragrance products.** Each has a `Size` option whose values include `12ml`, plus your full sizes (for example `50ml`). Prices are always Shopify prices. Nothing is hard-coded.
- If the miniature option value is not exactly `12ml`, change **Theme settings → Discovery set → Miniature size option value**.
- Put all twelve in one collection (for example `fragrances`) and select it in the theme sections and in **Theme settings → Discovery set**.

### 2.3 Discovery set product

1. Create a product, **"VELREYA Discovery Set"**, with a single variant. **Its price is the price of the set.**
2. Inventory: set it to *not track quantity*. Stock is held by the component 12ml variants.
3. Set `velreya.discovery_components` to the twelve **12ml variants**. Set `velreya.discovery_count` to `4`.
4. Assign it the theme template **`product.discovery-set`**. This turns its page into the full atelier builder.
5. Select it in **Theme settings → Discovery set → Discovery set product**.


## Fragrance catalogue (official data, included)

The twelve official fragrances are built into **Theme settings → Fragrance catalog**: Nova, Azure, Solara, Blanc, Rouge, Ember, Cuir, Terra, Velour, Ambre, Lumi and Aura. Each one has its tagline, character, accent and atmosphere colours, and top, heart and base notes. There's one fragrance per line:

```
handle | Name | Tagline | Character | Accent | Atmosphere | Top notes | Heart notes | Base notes
```

- **Create each Shopify product with the matching handle**: `nova`, `azure`, … `aura`. The theme then pulls in the product's real price, sizes, stock, 12ml variant and photos.
- Until a product exists, its fragrance still appears in the design (atelier, discovery, carousel, Explore) without a price. The discovery set can't be added to the bag until all four chosen fragrances exist as products.
- Product metafields (`velreya.top_notes` etc.) override the catalogue notes for that product if you set them.
- **Default bottle**: `assets/velreya-bottle.webp` is a transparent cut-out of the VELREYA Velour bottle, used wherever a product has no photo yet. Upload a different one in **Theme settings → Fragrance catalog → Default bottle photograph**. Note: the source image carries a small Gemini ✦ AI-generation mark in the lower-right corner, which is left intact. Replace it with final photography before launch.
- **Logo**: `assets/velreya-logo.png` (VR monogram, transparent) is used until a logo is uploaded in Theme settings → Brand.

## 3. How the 4 × 12ml discovery set works

```
Customer picks 4 different, in-stock 12ml fragrances in the atelier (max 4, no duplicates)
        │
        ▼  POST /cart/add.js
One cart line: Discovery Set variant (its Shopify price)
  properties: Fragrance 1..4 (visible names), _components = "id,id,id,id" (hidden)
        │
        ▼  Cart Transform Function (velreya-bundles-app, lineExpand)
Validates: exact count · no duplicates · every ID in the product's allow-list
Expands the line into the exact four 12ml variants
        │
        ▼
Checkout and order show the bundle with its components.
Inventory is decremented on each 12ml variant. The price stays the bundle price.
```

The browser is never trusted. A tampered request, such as a 100ml variant ID, a duplicate or the wrong count, **is not expanded**.

This approach was chosen over the alternatives for these reasons:

- **Line-item properties alone** would not decrement inventory and would not give real component lines. The brief ruled this out.
- **Shopify Bundles app (fixed bundles)** cannot handle a customer's free choice of 4 from 12 without creating 495 fixed combinations.
- **A Cart Transform Function** is Shopify's supported mechanism for customized bundles.

### 3.1 Deploy the function

You need a Shopify Partner account (free).

```bash
cd shopify/velreya-bundles-app
npm install
shopify app config link        # create or connect the "Velreya Bundles" app
shopify app deploy
```

Install the app on the store. Then register the transform once with the Admin GraphQL API (the GraphiQL app or `shopify app execute` both work):

```graphql
query { shopifyFunctions(first: 10) { nodes { id title apiType } } }

mutation {
  cartTransformCreate(functionId: "<ID of 'Velreya discovery set'>", blockOnFailure: false) {
    cartTransform { id }
    userErrors { field message }
  }
}
```

Run the tests: `cd velreya-bundles-app/extensions/discovery-set-expand && npm test`.

**Before the function is active**, the set still checks out at the correct bundle price, and the four chosen names appear on the order as properties. The 12ml stock is **not** decremented, and the order has no component lines. Do not launch until the function is active and verified.

> Cart Transform Functions require a plan that supports them. Check Shopify's current plan requirements for custom apps with Functions.

## 4. Pages, navigation and policies

Create these pages in **Online Store → Pages** and assign the templates:

| Page | Handle | Template |
| --- | --- | --- |
| Our Story | `our-story` | `page.story` |
| Explore | `explore` | `page.explore` (select the fragrance collection in the section) |
| Contact | `contact` | `page.contact` (uses Shopify's contact form; messages go to the store email) |
| FAQ | `faq` | `page.faq` (edit questions in the theme editor) |
| Discovery Set | `discovery` | `page.discovery` (optional; the dialog is the main entry point) |

**Main menu (`main-menu`)**: Fragrances → `/collections/fragrances`, Discovery Set → the discovery product, Explore → `/pages/explore`, Our Story → `/pages/our-story`.
**Footer menu (`footer`)**: shop links and FAQ / Contact. The policy links (shipping, refund, privacy, terms) are added automatically from **Settings → Policies**. Only policies that exist are shown.

**Find your scent**: create one collection per family. For example, an automated collection where `velreya.family` equals `Woody`, or one based on a tag. Select each collection in its tile. The families are proposed merchandising groups, not manufacturer classifications. Rename or remove them freely.

**Customer accounts**: account links appear only when accounts are enabled in **Settings → Customer accounts**. Classic-account templates are included. New customer accounts are handled by Shopify.

## 5. What the merchant still must supply

- The official VELREYA logo (Theme settings → Brand). Until then a typographic wordmark is shown.
- Real campaign photography: the hero, the four-bottle arrangement, the editorial images and the product photos. Until uploaded, neutral bottle silhouettes (`snippets/bottle-placeholder.liquid`) and labelled placeholders are shown.
- The official notes and stories for the twelve fragrances (section 2.1).
- Truthful reassurance copy (the Customer confidence section) and real contact details.

## 6. Go-live checklist (on a development store)

- [ ] Theme preview loads with no console errors. Run Lighthouse on the home page and a PDP.
- [ ] Each of the 12 PDPs shows the correct price per size, the notes, and a working Add to bag.
- [ ] Atelier: you can't pick a 5th fragrance, sold-out 12ml variants are disabled, and Remove works on desktop and mobile.
- [ ] A discovery set in the cart → checkout shows the bundle with **its four components** at the bundle price.
- [ ] After a test order, the inventory of each of the four 12ml variants drops by 1.
- [ ] Filters and sorting on the collection page; predictive search; the 404 page.
- [ ] Contact form and newsletter submissions arrive (**Customers** and the store email).
- [ ] Every footer and policy link resolves.
- [ ] Keyboard-only pass: menu, search, cart drawer, atelier dialog (Esc closes, focus returns).

---

`preview-screenshots/` shows the theme rendered locally with **mock data**. The bottles are placeholder outlines and "Sample 01…" are stand-in products, not real VELREYA products or notes.
