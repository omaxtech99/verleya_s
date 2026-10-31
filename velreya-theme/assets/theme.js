/* VELREYA theme — vanilla JS, no dependencies.
   All commerce calls use Shopify's Ajax Cart API and Section Rendering API. */
(() => {
  'use strict';

  const V = window.Velreya || { routes: {}, strings: {} };
  const R = V.routes;
  const S = V.strings;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const conn = navigator.connection || {};
  const lowData = conn.saveData || /(^|-)2g|3g/.test(conn.effectiveType || '');
  const rootPath = (R.root || '/').replace(/\/$/, '');

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const el = $('[data-toast]');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  /* ---------- Focus trap for modal surfaces ---------- */
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
  function trapFocus(container, e) {
    if (e.key !== 'Tab') return;
    const items = $$(FOCUSABLE, container).filter((n) => n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------- Generic slide-in drawer ---------- */
  class Drawer extends HTMLElement {
    connectedCallback() {
      this.panel = this.querySelector('[role="dialog"]');
      this.addEventListener('click', (e) => { if (e.target.closest('[data-drawer-close],[data-menu-close]')) this.close(); });
      this.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); else trapFocus(this.panel, e); });
    }
    open(trigger) {
      this.trigger = trigger || document.activeElement;
      this.hidden = false;
      document.body.classList.add('is-locked');
      requestAnimationFrame(() => requestAnimationFrame(() => this.classList.add('is-open')));
      if (this.trigger && this.trigger.setAttribute) this.trigger.setAttribute('aria-expanded', 'true');
      setTimeout(() => this.panel.focus(), 50);
    }
    close() {
      this.classList.remove('is-open');
      document.body.classList.remove('is-locked');
      if (this.trigger && this.trigger.setAttribute) this.trigger.setAttribute('aria-expanded', 'false');
      setTimeout(() => { this.hidden = true; if (this.trigger && this.trigger.focus) this.trigger.focus(); }, 500);
    }
  }
  customElements.define('menu-drawer', class extends Drawer {});

  /* ---------- Cart ---------- */
  const SECTIONS = 'cart-drawer,cart-count';

  function updateCartUI(sections, itemCount) {
    if (sections && sections['cart-drawer']) {
      const fresh = $('[data-cart-contents]', parse(sections['cart-drawer']));
      const body = $('[data-cart-drawer-body]');
      if (fresh && body) body.replaceChildren(fresh);
    }
    let count = itemCount;
    if (count === undefined && sections && sections['cart-count']) {
      const n = $('[data-cart-count]', parse(sections['cart-count']));
      count = n ? parseInt(n.textContent, 10) : undefined;
    }
    if (count !== undefined) {
      $$('.header__count[data-cart-count]').forEach((el) => { el.textContent = count; el.hidden = count === 0; });
      $$('[data-cart-count-label]').forEach((el) => { el.textContent = `(${count})`; });
    }
  }

  async function refreshCartPage() {
    const target = $('[data-cart-page]');
    if (!target) return;
    const res = await fetch(window.location.pathname, { credentials: 'same-origin' });
    const fresh = $('[data-cart-page]', parse(await res.text()));
    if (fresh) target.replaceChildren(...fresh.childNodes);
  }

  async function cartChange(line, quantity, lineEl) {
    if (lineEl) lineEl.classList.add('is-loading');
    try {
      const res = await fetch(`${R.cartChange}.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ line, quantity, sections: SECTIONS, sections_url: window.location.pathname })
      });
      const data = await res.json();
      if (!res.ok || data.status) throw new Error(data.description || data.message || S.cartError);
      updateCartUI(data.sections, data.item_count);
      await refreshCartPage();
    } catch (err) {
      toast(err.message || S.cartError);
      if (lineEl) lineEl.classList.remove('is-loading');
    }
  }

  async function cartAdd(items) {
    const res = await fetch(`${R.cartAdd}.js`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items, sections: SECTIONS, sections_url: window.location.pathname })
    });
    const data = await res.json();
    if (!res.ok || data.status) throw new Error(data.description || data.message || S.cartError);
    updateCartUI(data.sections);
    return data;
  }

  function openCart() {
    const drawer = $('cart-drawer');
    if (V.cartType === 'drawer' && drawer) drawer.open();
    else window.location.href = R.cart;
  }

  class CartDrawer extends Drawer {}
  customElements.define('cart-drawer', CartDrawer);

  // Cart interactions (drawer and page share the same markup)
  document.addEventListener('click', (e) => {
    const remove = e.target.closest('[data-line-remove]');
    if (remove) {
      e.preventDefault();
      cartChange(parseInt(remove.dataset.lineRemove, 10), 0, remove.closest('.cart-line'));
      return;
    }
    const step = e.target.closest('[data-qty-change]');
    if (step) {
      const input = $('input', step.closest('[data-qty]'));
      const min = parseInt(input.min || '0', 10);
      const max = input.max ? parseInt(input.max, 10) : Infinity;
      const next = Math.min(max, Math.max(min, (parseInt(input.value, 10) || 0) + parseInt(step.dataset.qtyChange, 10)));
      if (next === parseInt(input.value, 10)) return;
      input.value = next;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const cartOpen = e.target.closest('[data-cart-open]');
    if (cartOpen && V.cartType === 'drawer' && $('cart-drawer')) {
      e.preventDefault();
      $('cart-drawer').open(cartOpen);
    }
  });
  document.addEventListener('change', (e) => {
    const input = e.target.closest('.cart-line .qty__input');
    if (input) cartChange(parseInt(input.dataset.lineIndex, 10), Math.max(0, parseInt(input.value, 10) || 0), input.closest('.cart-line'));
  });
  document.addEventListener('input', debounce((e) => {
    if (!e.target.matches('[data-cart-note]')) return;
    fetch(`${R.cartUpdate}.js`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: e.target.value }) });
  }, 600));

  /* ---------- Header ---------- */
  customElements.define('site-header', class extends HTMLElement {
    connectedCallback() {
      let last = window.scrollY;
      const onScroll = () => {
        const y = window.scrollY;
        this.classList.toggle('is-scrolled', y > 40);
        this.classList.toggle('is-hidden', y > 400 && y > last && !document.body.classList.contains('is-locked'));
        last = y;
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
      // Close desktop dropdowns when clicking elsewhere
      document.addEventListener('click', (e) => {
        $$('.nav__details[open]', this).forEach((d) => { if (!d.contains(e.target)) d.removeAttribute('open'); });
      });
    }
  });
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-menu-open]');
    if (trigger) $('menu-drawer').open(trigger);
  });

  /* ---------- Search overlay + predictive search ---------- */
  customElements.define('search-overlay', class extends HTMLElement {
    connectedCallback() {
      this.input = $('[data-search-input]', this);
      this.results = $('[data-search-results]', this);
      this.panel = $('[role="dialog"]', this);
      this.input.addEventListener('input', debounce(() => this.query(), 280));
      this.addEventListener('click', (e) => { if (e.target.closest('[data-search-close]') || e.target === this) this.close(); });
      this.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') return this.move(e);
        if (e.key === 'Enter') {
          const sel = $('[aria-selected="true"] a', this.results);
          if (sel) { e.preventDefault(); window.location.href = sel.href; }
        }
        trapFocus(this.panel, e);
      });
    }
    open(trigger) {
      this.trigger = trigger;
      this.hidden = false;
      document.body.classList.add('is-locked');
      this.input.focus();
      this.onDocKey = (e) => { if (e.key === 'Escape' && !this.hidden) this.close(); };
      document.addEventListener('keydown', this.onDocKey);
    }
    close() {
      this.hidden = true;
      document.body.classList.remove('is-locked');
      document.removeEventListener('keydown', this.onDocKey);
      if (this.trigger) this.trigger.focus();
    }
    move(e) {
      const opts = $$('[role="option"]', this.results);
      if (!opts.length) return;
      e.preventDefault();
      let i = opts.findIndex((o) => o.getAttribute('aria-selected') === 'true');
      opts.forEach((o) => o.setAttribute('aria-selected', 'false'));
      i = e.key === 'ArrowDown' ? (i + 1) % opts.length : (i - 1 + opts.length) % opts.length;
      opts[i].setAttribute('aria-selected', 'true');
      this.input.setAttribute('aria-activedescendant', opts[i].id);
      opts[i].scrollIntoView({ block: 'nearest' });
    }
    async query() {
      const q = this.input.value.trim();
      if (!V.predictive || q.length < 2) { this.results.innerHTML = ''; this.input.setAttribute('aria-expanded', 'false'); return; }
      this.abort && this.abort.abort();
      this.abort = new AbortController();
      try {
        const url = `${R.predictiveSearch}?q=${encodeURIComponent(q)}&resources[type]=product,collection,page&resources[limit]=6&section_id=predictive-search`;
        const res = await fetch(url, { signal: this.abort.signal });
        if (!res.ok) throw new Error();
        const fresh = $('[data-predictive]', parse(await res.text()));
        this.results.replaceChildren(...(fresh ? [fresh] : []));
        this.input.setAttribute('aria-expanded', fresh ? 'true' : 'false');
      } catch (err) {
        if (err.name !== 'AbortError') this.results.innerHTML = '';
      }
    }
  });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-search-open]');
    if (t) { e.preventDefault(); $('search-overlay').open(t); }
  });

  /* ---------- Product form + variant selection ---------- */
  customElements.define('product-form', class extends HTMLElement {
    connectedCallback() {
      this.form = $('form', this);
      this.idInput = $('[data-variant-input]', this);
      this.button = $('[data-add-button]', this);
      this.label = $('[data-add-label]', this);
      this.error = $('[data-form-error]', this);
      const json = $('[data-variants]', this);
      this.variants = json ? JSON.parse(json.textContent) : [];
      this.addEventListener('change', (e) => { if (e.target.matches('[data-option-input]')) this.onOptionChange(); });
      this.form.addEventListener('submit', (e) => this.onSubmit(e));
      this.markUnavailable();
    }
    selectedOptions() {
      return $$('fieldset[data-option-index]', this).map((fs) => { const c = $('input:checked', fs); return c ? c.value : null; });
    }
    markUnavailable() {
      const sel = this.selectedOptions();
      $$('fieldset[data-option-index]', this).forEach((fs, idx) => {
        $$('[data-option-input]', fs).forEach((input) => {
          const test = sel.slice(); test[idx] = input.value;
          const match = this.variants.find((v) => v.options.every((o, i) => o === test[i]));
          const label = input.nextElementSibling;
          if (label) label.classList.toggle('is-unavailable', !match || !match.available);
        });
      });
    }
    onOptionChange() {
      const sel = this.selectedOptions();
      const v = this.variants.find((x) => x.options.every((o, i) => o === sel[i]));
      this.markUnavailable();
      const priceWrap = $('[data-pdp-price]');
      if (!v) {
        this.button.disabled = true;
        this.label.textContent = S.unavailable;
        return;
      }
      this.idInput.value = v.id;
      this.button.disabled = !v.available;
      this.label.textContent = v.available ? S.addToBag : S.soldOut;
      if (priceWrap) {
        const p = $('[data-price]', priceWrap);
        if (p) p.innerHTML = v.price;
        let c = $('[data-compare-price]', priceWrap);
        if (v.compare) {
          if (!c) { c = document.createElement('s'); c.className = 'price__compare'; c.dataset.comparePrice = ''; p.after(c); }
          c.innerHTML = v.compare;
        } else if (c) c.remove();
      }
      const url = new URL(window.location.href);
      url.searchParams.set('variant', v.id);
      window.history.replaceState({}, '', url);
      if (v.mediaId) {
        const media = $(`[data-media-id="${v.mediaId}"]`);
        if (media) media.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'start' });
      }
    }
    async onSubmit(e) {
      if (V.cartType !== 'drawer' || !$('cart-drawer')) return; // native POST to /cart/add
      e.preventDefault();
      if (this.button.disabled) return;
      this.error.hidden = true;
      this.button.setAttribute('aria-busy', 'true');
      this.label.textContent = S.adding;
      try {
        const fd = new FormData(this.form);
        await cartAdd([{ id: Number(fd.get('id')), quantity: Number(fd.get('quantity') || 1) }]);
        openCart();
      } catch (err) {
        this.error.textContent = err.message;
        this.error.hidden = false;
      } finally {
        this.button.removeAttribute('aria-busy');
        this.label.textContent = S.addToBag;
      }
    }
  });

  /* ---------- Discovery set atelier ---------- */
  customElements.define('discovery-builder', class extends HTMLElement {
    connectedCallback() {
      if (this.ready) return;
      this.ready = true;
      this.needed = parseInt(this.dataset.needed, 10) || 4;
      this.variantId = Number(this.dataset.variantId);
      this.bundleAvailable = this.dataset.available === 'true';
      this.selection = []; // [{id, title, media}]
      this.addBtn = $('[data-add-set]', this);
      this.error = $('[data-error]', this);
      const slots = $('[data-slots]', this);
      if (slots) slots.style.setProperty('--needed', this.needed);
      this.addEventListener('click', (e) => {
        const toggle = e.target.closest('[data-scent-toggle]');
        if (toggle) return this.toggle(toggle.closest('[data-scent]'));
        const rm = e.target.closest('[data-slot-remove]');
        if (rm) {
          const idx = $$('[data-slot]', this).indexOf(rm.closest('[data-slot]'));
          if (this.selection[idx]) this.remove(this.selection[idx].id);
          return;
        }
        if (e.target.closest('[data-add-set]')) this.submit();
      });
      this.render();
    }
    toggle(item) {
      if (!item || item.dataset.available !== 'true') return;
      const id = Number(item.dataset.id);
      if (this.selection.some((s) => s.id === id)) return this.remove(id);
      if (this.selection.length >= this.needed) { this.flash(S.limitReached); return; }
      this.selection.push({ id, title: item.dataset.title, media: $('[data-scent-media]', item).innerHTML });
      this.render();
    }
    remove(id) {
      this.selection = this.selection.filter((s) => s.id !== id);
      this.render();
    }
    flash(msg) {
      this.error.textContent = msg;
      this.error.hidden = false;
      clearTimeout(this.flashT);
      this.flashT = setTimeout(() => { this.error.hidden = true; }, 3000);
    }
    render() {
      const n = this.selection.length;
      $$('[data-scent]', this).forEach((el) => {
        const on = this.selection.some((s) => s.id === Number(el.dataset.id));
        el.classList.toggle('is-selected', on);
        const btn = $('[data-scent-toggle]', el);
        if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      $$('[data-slot]', this).forEach((slot, i) => {
        const s = this.selection[i];
        slot.classList.toggle('is-filled', !!s);
        $('[data-slot-media]', slot).innerHTML = s ? s.media : `<span class="slot__empty">${i + 1}</span>`;
        $('[data-slot-name]', slot).textContent = s ? s.title : '—';
        const rm = $('[data-slot-remove]', slot);
        rm.hidden = !s;
        if (s) rm.setAttribute('aria-label', `${S.remove} ${s.title}`);
      });
      const count = $('[data-count]', this);
      if (count) count.textContent = n;
      const bar = $('[data-bar]', this);
      if (bar) bar.style.width = `${(n / this.needed) * 100}%`;
      this.classList.toggle('is-full', n >= this.needed);
      if (this.addBtn) {
        const ready = n === this.needed && this.bundleAvailable;
        this.addBtn.disabled = !ready;
        this.addBtn.textContent = n === this.needed ? S.addSet : S.selectFour;
      }
    }
    async submit() {
      if (this.selection.length !== this.needed || !this.bundleAvailable) return;
      const ids = this.selection.map((s) => s.id);
      if (new Set(ids).size !== ids.length) return this.flash(S.cartError);
      const properties = {};
      this.selection.forEach((s, i) => { properties[`Fragrance ${i + 1}`] = s.title; });
      properties._components = ids.join(',');
      this.addBtn.disabled = true;
      this.addBtn.setAttribute('aria-busy', 'true');
      this.addBtn.textContent = S.adding;
      try {
        await cartAdd([{ id: this.variantId, quantity: 1, properties }]);
        toast(S.added);
        this.selection = [];
        this.render();
        const dialog = this.closest('dialog');
        if (dialog) dialog.close();
        openCart();
      } catch (err) {
        this.flash(err.message);
        this.render();
      } finally {
        this.addBtn.removeAttribute('aria-busy');
      }
    }
  });

  const dialog = $('[data-discovery-dialog]');
  let dialogLoaded = false;
  async function openDiscovery(trigger) {
    if (!dialog || typeof dialog.showModal !== 'function') {
      const fallback = trigger && trigger.dataset.fallback;
      if (fallback) window.location.href = fallback;
      return;
    }
    dialog.showModal();
    document.body.classList.add('is-locked');
    if (dialogLoaded) return;
    try {
      const res = await fetch(`${rootPath}/?section_id=discovery-builder`);
      if (!res.ok) throw new Error();
      const fresh = $('discovery-builder', parse(await res.text()));
      if (!fresh) throw new Error();
      $('[data-discovery-target]', dialog).replaceChildren(fresh);
      dialogLoaded = true;
      const first = $('[data-scent-toggle]:not([disabled])', dialog);
      if (first) first.focus();
    } catch (e) {
      $('[data-discovery-target]', dialog).innerHTML = `<p class="editor-hint" style="margin:6rem auto;max-width:30rem">${S.cartError}</p>`;
    }
  }
  if (dialog) {
    dialog.addEventListener('close', () => document.body.classList.remove('is-locked'));
    dialog.addEventListener('click', (e) => { if (e.target.closest('[data-discovery-close]')) dialog.close(); });
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-discovery-open]');
    if (!t) return;
    e.preventDefault();
    const drawer = t.closest('menu-drawer, cart-drawer');
    if (drawer) drawer.close();
    openDiscovery(t);
  });

  /* ---------- Editorial carousel ---------- */
  customElements.define('editorial-carousel', class extends HTMLElement {
    connectedCallback() {
      this.track = $('[data-carousel-track]', this);
      this.progress = $('[data-carousel-progress]', this);
      const nav = this.closest('section') && $('[data-carousel-nav]', this.closest('section'));
      const step = () => { const item = this.track.firstElementChild; return item ? item.getBoundingClientRect().width + 32 : 400; };
      if (nav) {
        $('[data-carousel-prev]', nav).addEventListener('click', () => this.track.scrollBy({ left: -step(), behavior: reduceMotion ? 'auto' : 'smooth' }));
        $('[data-carousel-next]', nav).addEventListener('click', () => this.track.scrollBy({ left: step(), behavior: reduceMotion ? 'auto' : 'smooth' }));
      }
      this.addEventListener('keydown', (e) => {
        if (e.target !== this) return;
        if (e.key === 'ArrowRight') this.track.scrollBy({ left: step() });
        if (e.key === 'ArrowLeft') this.track.scrollBy({ left: -step() });
      });
      const update = () => {
        const max = this.track.scrollWidth - this.track.clientWidth;
        const ratio = this.track.clientWidth / this.track.scrollWidth;
        if (this.progress) {
          this.progress.style.width = `${Math.max(ratio, .08) * 100}%`;
          this.progress.style.transform = `translateX(${max > 0 ? (this.track.scrollLeft / max) * ((1 / Math.max(ratio, .08)) - 1) * 100 : 0}%)`;
        }
        if (nav) {
          $('[data-carousel-prev]', nav).disabled = this.track.scrollLeft < 4;
          $('[data-carousel-next]', nav).disabled = this.track.scrollLeft > max - 4;
        }
      };
      this.track.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', debounce(update, 150));
      update();
    }
  });

  /* ---------- Product recommendations ---------- */
  customElements.define('product-recommendations', class extends HTMLElement {
    connectedCallback() {
      const io = new IntersectionObserver(async (entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        try {
          const res = await fetch(this.dataset.url);
          const fresh = $('product-recommendations', parse(await res.text()));
          if (fresh && fresh.innerHTML.trim()) { this.innerHTML = fresh.innerHTML; observeReveal(this); }
        } catch (e) { /* recommendations are optional */ }
      }, { rootMargin: '0px 0px 400px 0px' });
      io.observe(this);
    }
  });

  /* ---------- Storefront filtering ---------- */
  document.addEventListener('change', (e) => {
    const input = e.target.closest('[data-facet-input]');
    if (!input) return;
    const form = input.closest('form');
    const params = new URLSearchParams(new FormData(form));
    for (const [k, v] of Array.from(params.entries())) if (v === '') params.delete(k);
    loadResults(`${form.action}?${params.toString()}`);
  });
  async function loadResults(url, push = true) {
    const container = $('[data-results-container]');
    if (!container) { window.location.href = url; return; }
    container.classList.add('is-loading');
    try {
      const res = await fetch(url);
      const fresh = $('[data-results-container]', parse(await res.text()));
      if (!fresh) throw new Error();
      container.replaceChildren(...fresh.childNodes);
      if (push) window.history.pushState({ results: true }, '', url);
      observeReveal(container);
    } catch (err) {
      window.location.href = url;
    } finally {
      container.classList.remove('is-loading');
    }
  }
  window.addEventListener('popstate', () => { if ($('[data-facets]')) loadResults(window.location.href, false); });

  /* ---------- Scroll reveal ---------- */
  const revealIO = ('IntersectionObserver' in window) ? new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); revealIO.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }) : null;
  function observeReveal(ctx = document) {
    $$('[data-reveal]:not(.is-in)', ctx).forEach((el) => { if (revealIO && !reduceMotion) revealIO.observe(el); else el.classList.add('is-in'); });
  }

  /* ---------- Video helpers (never autoload on slow / save-data / reduced motion) ---------- */
  function canAutoplayVideo() { return !reduceMotion && !lowData; }
  function loadVideo(video) {
    if (video.dataset.loaded) return;
    $$('source[data-src]', video).forEach((s) => { s.src = s.dataset.src; });
    video.load();
    video.dataset.loaded = '1';
  }
  function playVideo(video, toggle) {
    loadVideo(video);
    const p = video.play();
    if (p && p.then) p.then(() => { video.classList.add('is-playing'); if (toggle) toggle.hidden = false; }).catch(() => {});
  }
  function bindToggle(video, toggle) {
    if (!toggle) return;
    const sync = () => {
      toggle.setAttribute('aria-pressed', video.paused ? 'true' : 'false');
      toggle.setAttribute('aria-label', video.paused ? S.playVideo : S.pauseVideo);
    };
    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);
    toggle.addEventListener('click', () => {
      if (video.paused) { video.dataset.userPaused = ''; video.play(); }
      else { video.dataset.userPaused = '1'; video.pause(); }
    });
  }

  /* ---------- Hero ---------- */
  function initHero() {
    $$('[data-hero]').forEach((hero) => {
      const img = $('.hero__img', hero);
      const ready = () => requestAnimationFrame(() => hero.classList.add('is-ready'));
      if (!img || img.complete) ready(); else { img.addEventListener('load', ready, { once: true }); setTimeout(ready, 1600); }
      const video = $('[data-hero-video]', hero);
      if (video && canAutoplayVideo() && window.innerWidth >= 750) {
        const start = () => playVideo(video, $('[data-hero-toggle]', hero));
        ('requestIdleCallback' in window) ? requestIdleCallback(start, { timeout: 3000 }) : setTimeout(start, 2000);
        bindToggle(video, $('[data-hero-toggle]', hero));
      }
    });
  }

  function initLazyVideos() {
    if (!canAutoplayVideo()) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const v = en.target;
        if (en.isIntersecting) playVideo(v); else if (!v.paused) v.pause();
      });
    }, { threshold: 0.25 });
    $$('[data-lazy-video]').forEach((v) => io.observe(v));
  }

  /* ---------- Explore experience ---------- */
  customElements.define('explore-experience', class extends HTMLElement {
    connectedCallback() {
      const chapters = $$('[data-explore-chapter]', this);
      const links = $$('[data-explore-link]', this);
      if (!chapters.length) return;
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          const ch = en.target;
          const video = $('[data-chapter-video]', ch);
          const toggle = $('[data-chapter-toggle]', ch);
          if (en.isIntersecting) {
            ch.classList.add('is-in-view');
            links.forEach((l) => l.classList.toggle('is-current', l.dataset.exploreLink === ch.dataset.exploreChapter));
            if (video && canAutoplayVideo() && !video.dataset.userPaused) playVideo(video, toggle);
          } else if (video && !video.paused) {
            video.pause();
          }
        });
      }, { threshold: 0.45 });
      chapters.forEach((c) => {
        io.observe(c);
        const v = $('[data-chapter-video]', c);
        if (v) bindToggle(v, $('[data-chapter-toggle]', c));
      });
      const intro = $('.explore__intro', this);
      const outro = $('.explore__outro', this);
      const visIO = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.target === intro || en.target === outro) this.classList.toggle('is-active', !en.isIntersecting && this.dataset.started === '1'); });
      }, { threshold: 0.3 });
      new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { this.dataset.started = '1'; this.classList.add('is-active'); } }, { threshold: 0.45 }).observe(chapters[0]);
      if (intro) visIO.observe(intro);
      if (outro) visIO.observe(outro);
    }
  });

  /* ---------- PDP gallery dots (mobile) ---------- */
  function initGalleryDots() {
    const list = $('[data-gallery]');
    const dots = $$('.pdp__dots li');
    if (!list || !dots.length) return;
    const set = () => {
      const i = Math.round(list.scrollLeft / list.clientWidth);
      dots.forEach((d, j) => d.classList.toggle('is-active', i === j));
    };
    list.addEventListener('scroll', debounce(set, 60), { passive: true });
    set();
  }

  /* ---------- Login: show recover panel when targeted or after submit ---------- */
  function initRecover() {
    const panel = $('#recover');
    if (!panel) return;
    if ($('.form-success, .form-error', panel)) panel.classList.add('is-visible');
  }

  /* ---------- Theme editor support ---------- */
  document.addEventListener('shopify:section:load', (e) => { observeReveal(e.target); initHero(); });

  function init() {
    observeReveal();
    initHero();
    initLazyVideos();
    initGalleryDots();
    initRecover();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
