// @ts-check
/**
 * VELREYA discovery set — Cart Transform (lineExpand).
 *
 * The theme adds ONE line: the discovery set parent variant, with a hidden line
 * attribute `_components` = "<variantId>,<variantId>,..." (numeric IDs of the chosen 12ml variants).
 *
 * This function validates that selection against the parent product's allow-list metafield
 * (velreya.discovery_components, list.variant_reference) and the required count
 * (velreya.discovery_count, integer, default 4), then expands the line into those exact variants.
 *
 * Price: no price adjustment is set, so the bundle keeps the parent variant's price and Shopify
 * allocates it across the components. Inventory is decremented on the component variants.
 *
 * Anything invalid (tampered IDs, duplicates, wrong count, not in the allow-list) is left
 * unexpanded — the function never trusts the browser.
 */

const GID_PREFIX = 'gid://shopify/ProductVariant/';
export const DEFAULT_COUNT = 4;
const NO_CHANGES = { operations: [] };

/** @param {unknown} raw */
export function parseComponents(raw) {
  if (typeof raw !== 'string' || raw.length > 400) return null;
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.every((p) => /^\d{1,20}$/.test(p))) return null;
  return parts.map((p) => `${GID_PREFIX}${p}`);
}

/** @param {unknown} json */
function toAllowSet(json) {
  if (!Array.isArray(json)) return null;
  return new Set(json.filter((v) => typeof v === 'string' && v.startsWith(GID_PREFIX)));
}

/** @param {unknown} json */
function toCount(json) {
  const n = typeof json === 'number' ? json : parseInt(String(json ?? ''), 10);
  return Number.isInteger(n) && n > 0 && n <= 12 ? n : DEFAULT_COUNT;
}

/**
 * @param {any} input
 * @returns {{ operations: Array<{ lineExpand: { cartLineId: string, expandedCartItems: Array<{ merchandiseId: string, quantity: number }> } }> }}
 */
export function cartTransformRun(input) {
  const lines = input?.cart?.lines ?? [];
  const operations = [];

  for (const line of lines) {
    const merch = line?.merchandise;
    if (!merch || merch.__typename !== 'ProductVariant') continue;

    const allowed = toAllowSet(merch.product?.allowed?.jsonValue);
    if (!allowed || allowed.size === 0) continue; // not a discovery set product

    const ids = parseComponents(line.components?.value);
    if (!ids) continue;

    const required = toCount(merch.product?.required?.jsonValue);
    const unique = new Set(ids);
    if (ids.length !== required || unique.size !== ids.length) continue;
    if (!ids.every((id) => allowed.has(id))) continue;
    if (ids.includes(merch.id)) continue;

    operations.push({
      lineExpand: {
        cartLineId: line.id,
        expandedCartItems: ids.map((merchandiseId) => ({ merchandiseId, quantity: 1 }))
      }
    });
  }

  return operations.length ? { operations } : NO_CHANGES;
}
