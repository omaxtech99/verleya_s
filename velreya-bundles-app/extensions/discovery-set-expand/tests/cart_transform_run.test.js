import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cartTransformRun, parseComponents } from '../src/cart_transform_run.js';

const G = (n) => `gid://shopify/ProductVariant/${n}`;
const ALLOWED = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112].map(G);

function cart(components, opts = {}) {
  return {
    cart: {
      lines: [
        {
          id: 'gid://shopify/CartLine/1',
          quantity: opts.quantity ?? 1,
          components: components === undefined ? null : { value: components },
          merchandise: {
            __typename: 'ProductVariant',
            id: G(900),
            product: {
              allowed: opts.noAllow ? null : { jsonValue: opts.allowed ?? ALLOWED },
              required: opts.required === undefined ? null : { jsonValue: opts.required }
            }
          }
        },
        {
          id: 'gid://shopify/CartLine/2',
          quantity: 1,
          components: null,
          merchandise: { __typename: 'ProductVariant', id: G(555), product: { allowed: null, required: null } }
        }
      ]
    }
  };
}

test('expands a valid 4-fragrance set into exact components', () => {
  const out = cartTransformRun(cart('101,105,109,112'));
  assert.equal(out.operations.length, 1);
  assert.deepEqual(out.operations[0], {
    lineExpand: {
      cartLineId: 'gid://shopify/CartLine/1',
      expandedCartItems: [G(101), G(105), G(109), G(112)].map((merchandiseId) => ({ merchandiseId, quantity: 1 }))
    }
  });
});

test('leaves ordinary lines untouched', () => {
  const out = cartTransformRun(cart(undefined));
  assert.deepEqual(out, { operations: [] });
});

test('rejects fewer or more than the required count', () => {
  assert.equal(cartTransformRun(cart('101,102,103')).operations.length, 0);
  assert.equal(cartTransformRun(cart('101,102,103,104,105')).operations.length, 0);
});

test('respects a custom required count', () => {
  assert.equal(cartTransformRun(cart('101,102,103', { required: 3 })).operations.length, 1);
});

test('rejects duplicates', () => {
  assert.equal(cartTransformRun(cart('101,101,102,103')).operations.length, 0);
});

test('rejects variants outside the allow-list (e.g. a full-size bottle)', () => {
  assert.equal(cartTransformRun(cart('101,102,103,999')).operations.length, 0);
});

test('rejects malformed input', () => {
  assert.equal(cartTransformRun(cart('101,102,abc,104')).operations.length, 0);
  assert.equal(cartTransformRun(cart('gid://shopify/ProductVariant/101,102,103,104')).operations.length, 0);
  assert.equal(parseComponents(42), null);
  assert.equal(parseComponents('1,'.repeat(300)), null);
});

test('does nothing for products without an allow-list', () => {
  assert.equal(cartTransformRun(cart('101,102,103,104', { noAllow: true })).operations.length, 0);
});

test('never expands a set into itself', () => {
  assert.equal(cartTransformRun(cart('900,101,102,103', { allowed: [...ALLOWED, G(900)] })).operations.length, 0);
});

test('handles empty input safely', () => {
  assert.deepEqual(cartTransformRun({}), { operations: [] });
});
