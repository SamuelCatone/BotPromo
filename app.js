/**
 * ==========================================================================
 * PAINEL DE CONTROLE DO BOT — CLIENTE JAVASCRIPT (SUPABASE REAL)
 * ==========================================================================
 */

/* --------------------------------------------------------------------------
 * Utilitários gerais
 * ------------------------------------------------------------------------ */
const Utils = {
  formatDateTime(isoString) {
    if (!isoString) return '—';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  },

  splitDateTime(isoString) {
    if (!isoString) return { date: '—', time: '—' };
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return { date: '—', time: '—' };
    return {
      date: date.toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
      time: date.toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
  },

  formatNumber(value) {
    const num = Number(value);
    if (Number.isNaN(num)) return '0';
    return num.toLocaleString('pt-BR');
  },

  timeAgo(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSec < 45) return 'agora mesmo';
    if (diffSec < 90) return 'há 1 minuto';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `há ${diffMin} minutos`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours === 1) return 'há 1 hora';
    if (diffHours < 24) return `há ${diffHours} horas`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'há 1 dia';
    return `há ${diffDays} dias`;
  },

  hostFromUrl(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url || '—';
    }
  },

  escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  getThirtyMinutesBefore(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const match = timeStr.trim().match(/^([01]\d|2[0-3]):([0-5]\d)/);
    if (!match) return null;
    let hh = parseInt(match[1], 10);
    let mm = parseInt(match[2], 10);
    mm -= 30;
    if (mm < 0) {
      mm += 60;
      hh -= 1;
      if (hh < 0) hh += 24;
    }
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hh)}:${pad(mm)}`;
  },

  detectMarketplace(url = '', name = '') {
    const target = (url + ' ' + name).toLowerCase();
    if (
      target.includes('mercadolivre') ||
      target.includes('mercadolivre.com') ||
      target.includes('meli.la') ||
      target.includes('meli') ||
      target.includes('mercado livre')
    ) {
      return { id: 'mercadolivre', name: 'Mercado Livre', tag: 'ML', badgeClass: 'badge-mp--mercadolivre' };
    }
    if (target.includes('shopee') || target.includes('shope.ee') || target.includes('shopee.com')) {
      return { id: 'shopee', name: 'Shopee', tag: 'Shopee', badgeClass: 'badge-mp--shopee' };
    }
    if (target.includes('amazon') || target.includes('amzn.to') || target.includes('amazon.com')) {
      return { id: 'amazon', name: 'Amazon', tag: 'Amazon', badgeClass: 'badge-mp--amazon' };
    }
    if (target.includes('aliexpress') || target.includes('ali.ski') || target.includes('aliexpress.com')) {
      return { id: 'aliexpress', name: 'AliExpress', tag: 'AliExpress', badgeClass: 'badge-mp--aliexpress' };
    }
    if (target.includes('magazineluiza') || target.includes('magalu') || target.includes('magazinevoce')) {
      return { id: 'magalu', name: 'Magalu', tag: 'Magalu', badgeClass: 'badge-mp--magalu' };
    }
    return { id: 'outro', name: 'Parceiro', tag: 'Oferta', badgeClass: 'badge-mp--outro' };
  },
};

/* --------------------------------------------------------------------------
 * Controle de Tema (Dark / Light)
 * ------------------------------------------------------------------------ */
const ThemeController = (function () {
  const STORAGE_KEY = 'painel-bot-theme';
  const root = document.documentElement;

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (_) {}

    const label = document.querySelector('[data-theme-label]');
    if (label) label.textContent = theme === 'dark' ? 'Tema escuro' : 'Tema claro';
  }

  function init() {
    const saved = (() => {
      try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; }
    })();
    const initial = saved || 'dark';
    apply(initial);

    const btn = document.querySelector('[data-theme-toggle]');
    if (btn) {
      btn.addEventListener('click', () => {
        const current = root.getAttribute('data-theme') || 'dark';
        apply(current === 'dark' ? 'light' : 'dark');
      });
    }
  }

  return { init, apply };
})();
window.ThemeController = ThemeController;

/* --------------------------------------------------------------------------
 * Notificações Toast
 * ------------------------------------------------------------------------ */
const Toast = (function () {
  let stack = null;

  const ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  };

  const CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  function ensureStack() {
    if (stack && document.body.contains(stack)) return stack;
    stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    return stack;
  }

  function sanitizeAlertMessage(type, title, desc) {
    if (type === 'error') {
      return {
        title: 'Não foi possível',
        desc: 'Não foi possível realizar esta ação no momento. Por favor, tente novamente mais tarde.',
      };
    }

    const FORBIDDEN_WORDS = [
      'supabase', 'postgres', 'postgresql', 'pg', 'n8n', 'banco', 'database',
      'tabela', 'table', 'relation', 'column', 'sql', 'query', 'syntax',
      'econnrefused', 'enotfound', '500', '404', '400', '403', 'webhook', 'endpoint',
      'n8n_', 'jwt', 'payload', 'schema'
    ];

    let safeTitle = title || '';
    let safeDesc = desc || '';
    const combined = `${safeTitle} ${safeDesc}`.toLowerCase();
    for (const word of FORBIDDEN_WORDS) {
      if (combined.includes(word)) {
        return {
          title: 'Não foi possível',
          desc: 'Não foi possível concluir. Por favor, tente novamente mais tarde.',
        };
      }
    }

    return { title: safeTitle, desc: safeDesc };
  }

  function show({ type = 'info', title = '', desc = '', duration = 4000 }) {
    ensureStack();

    const sanitized = sanitizeAlertMessage(type, title, desc);
    title = sanitized.title;
    desc = sanitized.desc;

    // Remove oldest toast if more than 3 to avoid piling up on the bottom right
    const existing = stack.querySelectorAll('.toast:not(.is-leaving)');
    if (existing.length >= 3) {
      const oldest = existing[0];
      oldest.classList.add('is-leaving');
      setTimeout(() => {
        try { oldest.remove(); } catch (_) {}
      }, 150);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.setAttribute('role', 'status');
    toast.innerHTML = `
      <div class="toast__icon">${ICONS[type] || ICONS.info}</div>
      <div class="toast__body">
        ${title ? `<div class="toast__title">${Utils.escapeHtml(title)}</div>` : ''}
        ${desc ? `<div class="toast__desc">${Utils.escapeHtml(desc)}</div>` : ''}
      </div>
      <button class="toast__close" aria-label="Fechar">${CLOSE_ICON}</button>
      <div class="toast__progress"></div>
    `;
    stack.appendChild(toast);

    // Ensure durations stay within 2.5s - 4.5s
    const actualDuration = Math.max(2500, Math.min(Number(duration) || 4000, 4500));
    const progressEl = toast.querySelector('.toast__progress');

    // Trigger visual countdown bar
    requestAnimationFrame(() => {
      if (progressEl) {
        progressEl.style.transition = `transform ${actualDuration}ms linear`;
        progressEl.style.transform = 'scaleX(0)';
      }
    });

    let isClosed = false;
    let timer = null;

    const remove = () => {
      if (isClosed) return;
      isClosed = true;
      if (timer) clearTimeout(timer);
      toast.classList.add('is-leaving');
      setTimeout(() => {
        try { toast.remove(); } catch (_) {}
      }, 200);
    };

    toast.querySelector('.toast__close').addEventListener('click', (e) => {
      e.stopPropagation();
      remove();
    });

    const startTimer = (ms) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(remove, ms);
    };

    startTimer(actualDuration);

    // If mouse hovers, pause timer; when mouse leaves, dismiss within 1.5s
    toast.addEventListener('mouseenter', () => {
      if (timer) clearTimeout(timer);
    });
    toast.addEventListener('mouseleave', () => {
      if (!isClosed) startTimer(1500);
    });

    // Hard fallback: guaranteed automatic removal after actualDuration + 2000ms max
    setTimeout(() => {
      if (!isClosed) remove();
    }, actualDuration + 2000);
  }

  return { show };
})();
window.Toast = Toast;

/* --------------------------------------------------------------------------
 * Modal de Confirmação Reutilizável
 * ------------------------------------------------------------------------ */
const ConfirmModal = (function () {
  let overlayEl = null;

  function ensureOverlay() {
    if (overlayEl) return overlayEl;
    overlayEl = document.createElement('div');
    overlayEl.className = 'modal-overlay';
    overlayEl.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal__icon"></div>
        <h3 class="modal__title"></h3>
        <div class="modal__desc"></div>
        <div class="modal__confirm-input" hidden>
          <label for="modal-confirm-text"></label>
          <input type="text" id="modal-confirm-text" autocomplete="off" spellcheck="false" />
        </div>
        <div class="modal__actions">
          <button class="btn btn-ghost" data-modal-cancel type="button">Cancelar</button>
          <button class="btn btn-primary" data-modal-confirm type="button">Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlayEl);

    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) close();
    });
    overlayEl.querySelector('[data-modal-cancel]').addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlayEl.classList.contains('is-open')) close();
    });
    return overlayEl;
  }

  function close() {
    if (!overlayEl) return;
    overlayEl.classList.remove('is-open');
  }

  function open(opts) {
    const el = ensureOverlay();
    const modal = el.querySelector('.modal');
    modal.classList.toggle('modal--danger', opts.variant === 'danger');

    el.querySelector('.modal__icon').innerHTML = opts.icon || '';
    el.querySelector('.modal__title').textContent = opts.title || 'Confirmar ação';

    const descEl = el.querySelector('.modal__desc');
    descEl.innerHTML = opts.description || '';
    if (opts.list && opts.list.length) {
      const ul = document.createElement('ul');
      ul.className = 'modal__list';
      opts.list.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        ul.appendChild(li);
      });
      descEl.appendChild(ul);
    }

    const confirmWrap = el.querySelector('.modal__confirm-input');
    const confirmInput = el.querySelector('#modal-confirm-text');
    let confirmBtn = el.querySelector('[data-modal-confirm]');
    confirmBtn.className = `btn ${opts.variant === 'danger' ? 'btn-danger' : 'btn-primary'}`;
    confirmBtn.textContent = opts.confirmLabel || 'Confirmar';
    el.querySelector('[data-modal-cancel]').textContent = opts.cancelLabel || 'Cancelar';

    if (opts.requireTextConfirm) {
      confirmWrap.hidden = false;
      confirmWrap.querySelector('label').textContent = `Digite "${opts.requireTextConfirm}" para confirmar:`;
      confirmInput.value = '';
      confirmInput.placeholder = opts.requireTextConfirm;
      confirmBtn.disabled = true;
    } else {
      confirmWrap.hidden = true;
      confirmBtn.disabled = false;
    }

    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    if (opts.requireTextConfirm) {
      newConfirmBtn.disabled = true;
      confirmInput.oninput = () => {
        newConfirmBtn.disabled = confirmInput.value.trim().toUpperCase() !== opts.requireTextConfirm.toUpperCase();
      };
    }

    newConfirmBtn.addEventListener('click', async () => {
      newConfirmBtn.disabled = true;
      const originalText = newConfirmBtn.textContent;
      newConfirmBtn.textContent = 'Processando…';
      try {
        await opts.onConfirm?.();
        close();
      } catch (err) {
        console.error(err);
        Toast.show({ type: 'error', title: 'Não foi possível', desc: 'Não foi possível realizar esta ação no momento. Por favor, tente novamente mais tarde.' });
      } finally {
        newConfirmBtn.textContent = originalText;
        newConfirmBtn.disabled = false;
      }
    });

    el.classList.add('is-open');
    (opts.requireTextConfirm ? confirmInput : newConfirmBtn).focus();
  }

  return { open, close };
})();
window.ConfirmModal = ConfirmModal;

/* --------------------------------------------------------------------------
 * Modal Informativo de Configurações
 * ------------------------------------------------------------------------ */
const SettingsInfoModal = (function () {
  let overlayEl = null;

  function ensureOverlay() {
    if (overlayEl) return overlayEl;
    overlayEl = document.createElement('div');
    overlayEl.className = 'modal-overlay';
    overlayEl.innerHTML = `
      <div class="modal modal--info" role="dialog" aria-modal="true">
        <div class="modal__header">
          <div class="modal__icon-wrap"></div>
          <div style="min-width:0; flex:1;">
            <h3 class="modal__title" style="margin:0; font-size:16px; font-weight:800;"></h3>
            <div class="modal__subtitle"></div>
          </div>
          <button class="modal__close-btn" data-modal-info-close type="button" aria-label="Fechar">&times;</button>
        </div>
        <div class="modal__content"></div>
        <div class="modal__actions" style="margin-top:20px;">
          <button class="btn btn-primary btn-block" data-modal-info-ok type="button">Entendi</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlayEl);

    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) close();
    });
    overlayEl.querySelector('[data-modal-info-close]').addEventListener('click', close);
    overlayEl.querySelector('[data-modal-info-ok]').addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlayEl.classList.contains('is-open')) close();
    });
    return overlayEl;
  }

  function close() {
    if (!overlayEl) return;
    overlayEl.classList.remove('is-open');
  }

  function open(opts) {
    const el = ensureOverlay();
    el.querySelector('.modal__title').textContent = opts.title || 'Informação';
    el.querySelector('.modal__subtitle').textContent = opts.subtitle || '';
    el.querySelector('.modal__icon-wrap').innerHTML = opts.icon || `
      <div class="settings-icon settings-icon--accent" style="width:36px; height:36px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      </div>
    `;

    let html = `<p class="modal__text">${opts.description || ''}</p>`;
    if (Array.isArray(opts.points) && opts.points.length > 0) {
      html += `<div class="modal__points-list">` +
        opts.points.map((p) => `
          <div class="modal__point-item">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" class="modal__point-icon"><polyline points="20 6 9 17 4 12"/></svg>
            <div>
              <strong>${Utils.escapeHtml(p.title)}:</strong> ${Utils.escapeHtml(p.desc)}
            </div>
          </div>
        `).join('') +
        `</div>`;
    }
    el.querySelector('.modal__content').innerHTML = html;
    el.classList.add('is-open');
  }

  return { open, close };
})();
window.SettingsInfoModal = SettingsInfoModal;

/* --------------------------------------------------------------------------
 * Componente de Dropdown Customizado & Responsivo (Sem select nativo)
 * ------------------------------------------------------------------------ */
const CustomDropdown = (function () {
  const instances = new Map();

  function getTimeIcon(isEnd) {
    if (isEnd) {
      return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" style="color:var(--danger); flex-shrink:0; display:inline-block; vertical-align:-1px;"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;
    }
    return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" style="color:var(--success); flex-shrink:0; display:inline-block; vertical-align:-1px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  }

  function enhance(selectEl, opts = {}) {
    if (!selectEl) return null;
    if (instances.has(selectEl)) {
      const existing = instances.get(selectEl);
      existing.sync();
      return existing;
    }

    const isTime = opts.type === 'time' || selectEl.classList.contains('timer-select') || selectEl.hasAttribute('data-timer-start-select') || selectEl.hasAttribute('data-timer-end-select');
    const isEndTimer = selectEl.hasAttribute('data-timer-end-select');
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select-wrapper custom-select-wrapper--hidden-native';
    if (isTime) wrapper.setAttribute('data-type', 'time');

    // Insert wrapper in place
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);

    // Trigger button
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = `
      <div class="custom-select-trigger__content">
        <span class="custom-select-trigger__icon"></span>
        <span class="custom-select-trigger__label"></span>
      </div>
      <svg class="custom-select-trigger__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    `;
    wrapper.appendChild(trigger);

    // Menu popup
    const menu = document.createElement('div');
    menu.className = 'custom-select-menu';
    menu.setAttribute('role', 'listbox');

    // Search bar for dropdowns with many items (> 6)
    const searchBox = document.createElement('div');
    searchBox.className = 'custom-select-search-box';
    searchBox.innerHTML = `
      <svg class="custom-select-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" class="custom-select-search" placeholder="${isTime ? 'Buscar horário (ex: 14:00, 18)...' : 'Filtrar opções...'}" autocomplete="off" />
    `;
    menu.appendChild(searchBox);

    const listContainer = document.createElement('div');
    listContainer.className = 'custom-select-list';
    menu.appendChild(listContainer);

    wrapper.appendChild(menu);

    const searchInput = searchBox.querySelector('.custom-select-search');
    const iconEl = trigger.querySelector('.custom-select-trigger__icon');
    const labelEl = trigger.querySelector('.custom-select-trigger__label');

    function renderOptions(filterQuery = '') {
      const options = Array.from(selectEl.options);
      searchBox.style.display = options.length > 6 ? 'block' : 'none';

      const q = filterQuery.trim().toLowerCase();
      const filtered = options.filter((opt) => {
        if (!q) return true;
        const text = (opt.textContent || '').toLowerCase();
        const val = (opt.value || '').toLowerCase();
        return text.includes(q) || val.includes(q);
      });

      if (filtered.length === 0) {
        listContainer.innerHTML = `<div class="custom-select-empty">Nenhum resultado encontrado</div>`;
        return;
      }

      listContainer.innerHTML = filtered.map((opt) => {
        const val = opt.value;
        const text = opt.textContent;
        const isSelected = opt.selected || selectEl.value === val;
        return `
          <div class="custom-select-option ${isSelected ? 'is-selected' : ''}" data-val="${Utils.escapeHtml(val)}" role="option" aria-selected="${isSelected}">
            <div class="custom-select-option__left">
              ${isTime ? `<span class="custom-select-option__icon">${getTimeIcon(isEndTimer)}</span>` : ''}
              <span class="custom-select-option__text">${Utils.escapeHtml(text)}</span>
            </div>
            <svg class="custom-select-option__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        `;
      }).join('');

      listContainer.querySelectorAll('.custom-select-option').forEach((optEl) => {
        optEl.addEventListener('click', (e) => {
          e.stopPropagation();
          const chosenVal = optEl.getAttribute('data-val');
          setValue(chosenVal);
          close();
        });
      });
    }

    function updateTriggerDisplay() {
      const selectedOpt = selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
      const text = selectedOpt ? selectedOpt.textContent : 'Selecione...';

      labelEl.textContent = text;
      if (isTime) {
        iconEl.innerHTML = getTimeIcon(isEndTimer);
      } else {
        iconEl.innerHTML = '';
      }
    }

    function setValue(val) {
      if (selectEl.value !== val) {
        selectEl.value = val;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        selectEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
      updateTriggerDisplay();
      renderOptions();
    }

    function open() {
      // Close any other open dropdowns first
      document.querySelectorAll('.custom-select-wrapper.is-open').forEach((w) => {
        if (w !== wrapper) {
          w.classList.remove('is-open');
          const trig = w.querySelector('.custom-select-trigger');
          if (trig) trig.setAttribute('aria-expanded', 'false');
        }
      });

      renderOptions(searchInput?.value || '');
      wrapper.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');

      // Smart positioning: flip upwards if near bottom of screen
      const rect = wrapper.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 260 && rect.top > 260) {
        wrapper.classList.add('is-upwards');
      } else {
        wrapper.classList.remove('is-upwards');
      }

      if (selectEl.options.length > 6 && searchInput) {
        setTimeout(() => searchInput.focus(), 60);
      }

      const selectedItem = listContainer.querySelector('.is-selected');
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
      }
    }

    function close() {
      wrapper.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      if (searchInput) searchInput.value = '';
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (wrapper.classList.contains('is-open')) {
        close();
      } else {
        open();
      }
    });

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        renderOptions(searchInput.value);
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          close();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const firstOpt = listContainer.querySelector('.custom-select-option');
          if (firstOpt) {
            setValue(firstOpt.getAttribute('data-val'));
            close();
          }
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && wrapper.classList.contains('is-open')) {
        close();
      }
    });

    selectEl.addEventListener('change', () => {
      updateTriggerDisplay();
      renderOptions();
    });

    // Initial render
    updateTriggerDisplay();
    renderOptions();

    const instanceObj = {
      wrapper,
      trigger,
      sync: () => {
        updateTriggerDisplay();
        renderOptions();
      },
      setValue,
      open,
      close,
    };

    instances.set(selectEl, instanceObj);
    return instanceObj;
  }

  function sync(selectEl) {
    if (!selectEl) return;
    const inst = instances.get(selectEl);
    if (inst) {
      inst.sync();
    } else {
      enhance(selectEl);
    }
  }

  function initAll() {
    document.querySelectorAll('select').forEach((sel) => {
      enhance(sel);
    });
  }

  // Global click outside listener
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-select-wrapper')) {
      document.querySelectorAll('.custom-select-wrapper.is-open').forEach((w) => {
        w.classList.remove('is-open');
        const trig = w.querySelector('.custom-select-trigger');
        if (trig) trig.setAttribute('aria-expanded', 'false');
      });
    }
  });

  return { enhance, sync, initAll };
})();
window.CustomDropdown = CustomDropdown;

/* --------------------------------------------------------------------------
 * Autenticação e Sessão Estrita com Supabase
 * ------------------------------------------------------------------------ */
let authSession = null;

async function initAuth() {
  const authGate = document.querySelector('[data-auth-gate]');
  const appShell = document.querySelector('[data-app-shell]');
  const userLabel = document.querySelector('[data-auth-user]');
  const signoutBtn = document.querySelector('[data-auth-signout]');
  const msgEl = document.querySelector('[data-auth-message]');
  const errEl = document.querySelector('[data-auth-error]');

  function setFeedback(message = '', isError = false) {
    if (msgEl) {
      msgEl.hidden = !message || isError;
      msgEl.textContent = !isError ? message : '';
    }
    if (errEl) {
      errEl.hidden = !message || !isError;
      errEl.textContent = isError ? message : '';
    }
  }

  function setAuthView(name) {
    document.querySelectorAll('[data-auth-view]').forEach((el) => {
      el.hidden = el.getAttribute('data-auth-view') !== name;
    });
    setFeedback('');
  }

  function showApp(user) {
    if (authGate) authGate.hidden = true;
    if (appShell) appShell.hidden = false;
    if (userLabel) userLabel.textContent = user?.email || 'Usuário Autenticado';
    if (typeof window.refreshDashboard === 'function') {
      window.refreshDashboard({ silent: false });
    }
    if (typeof window.carregarHistoricoCompleto === 'function') {
      window.carregarHistoricoCompleto();
    }
  }

  function showGate() {
    if (authGate) authGate.hidden = false;
    if (appShell) appShell.hidden = true;
    setAuthView('signin');
  }

  onSessionExpiredCallback = showGate;

  // View switches
  document.querySelectorAll('[data-auth-view-link]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-auth-view-link');
      setAuthView(target);
    });
  });

  if (signoutBtn) {
    signoutBtn.addEventListener('click', () => {
      try { localStorage.removeItem('botpromo_token'); } catch (_) {}
      authSession = null;
      showGate();
      Toast.show({ type: 'info', title: 'Sessão encerrada com sucesso.' });
    });
  }

  // Check saved token on page load
  const savedToken = (() => {
    try { return localStorage.getItem('botpromo_token'); } catch (_) { return null; }
  })();

  if (savedToken) {
    authSession = { access_token: savedToken };
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${savedToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        authSession.user = data.user;
        showApp(data.user);
      } else {
        localStorage.removeItem('botpromo_token');
        authSession = null;
        showGate();
      }
    } catch (_) {
      showGate();
    }
  } else {
    showGate();
  }

  function formatAuthError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('fetch failed') || msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('timeout')) {
      return 'Não foi possível conectar no momento. Por favor, tente novamente mais tarde.';
    }
    if (msg.includes('senha') || msg.includes('password') || msg.includes('incorret') || msg.includes('invalid login')) {
      return 'E-mail ou senha incorretos.';
    }
    if (msg.includes('já está cadastrado') || msg.includes('already exists')) {
      return 'Este e-mail já está cadastrado. Tente fazer login.';
    }
    return 'Não foi possível realizar o acesso no momento. Por favor, tente novamente mais tarde.';
  }

  // Form: Sign In
  const signinForm = document.querySelector('[data-auth-signin-form]');
  signinForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = signinForm.querySelector('[name="email"]')?.value?.trim();
    const password = signinForm.querySelector('[name="password"]')?.value;
    const submitBtn = signinForm.querySelector('button[type="submit"]');

    if (!email || !password) return;
    if (submitBtn) submitBtn.disabled = true;
    setFeedback('');

    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.status === 404) {
        throw new Error('O servidor backend (/api) não existe nesta hospedagem estática (Netlify). Acesse o painel pelo endereço da sua VM (ex: http://SEU_IP:5001) onde o Node.js está ativo, ou configure a regra de proxy no Netlify.');
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'E-mail ou senha incorretos.');

      authSession = {
        access_token: data.access_token,
        user: data.user,
      };
      try { localStorage.setItem('botpromo_token', data.access_token); } catch (_) {}

      showApp(data.user);
      Toast.show({ type: 'success', title: 'Login realizado com sucesso!' });
    } catch (err) {
      setFeedback(formatAuthError(err), true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // Form: Sign Up
  const signupForm = document.querySelector('[data-auth-signup-form]');
  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = signupForm.querySelector('[name="email"]')?.value?.trim();
    const password = signupForm.querySelector('[name="password"]')?.value;
    const confirmPassword = signupForm.querySelector('[name="confirmPassword"]')?.value;
    const submitBtn = signupForm.querySelector('button[type="submit"]');

    if (password !== confirmPassword) {
      setFeedback('As senhas digitadas não coincidem.', true);
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    setFeedback('');

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.status === 404) {
        throw new Error('O servidor backend (/api) não existe nesta hospedagem estática. Acesse pela VM na porta 5001.');
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Erro ao registrar usuário.');

      if (data.access_token) {
        authSession = { access_token: data.access_token, user: data.user };
        try { localStorage.setItem('botpromo_token', data.access_token); } catch (_) {}
        showApp(data.user);
        Toast.show({ type: 'success', title: 'Conta criada com sucesso!' });
      } else {
        setFeedback('Cadastro realizado! Verifique seu e-mail para confirmar a conta se necessário.');
        Toast.show({ type: 'success', title: 'Conta criada com sucesso!' });
      }
    } catch (err) {
      setFeedback(formatAuthError(err), true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // Form: Password Recovery
  const recoveryForm = document.querySelector('[data-auth-recovery-form]');
  recoveryForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = recoveryForm.querySelector('[name="email"]')?.value?.trim();
    const submitBtn = recoveryForm.querySelector('button[type="submit"]');

    if (submitBtn) submitBtn.disabled = true;
    setFeedback('');

    try {
      const res = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Erro ao solicitar recuperação.');
      setFeedback('Link de recuperação enviado. Verifique sua caixa de entrada.');
    } catch (err) {
      setFeedback(formatAuthError(err), true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

/* --------------------------------------------------------------------------
 * Inspeção e Diagnóstico de Tokens JWT e Autenticação
 * ------------------------------------------------------------------------ */
function inspectJwtToken(token) {
  if (!token) {
    return {
      status: 'missing',
      category: 'Token Ausente',
      isExpired: false,
      message: 'Nenhum token Authorization Bearer foi fornecido na requisição.',
      details: {},
    };
  }

  if (typeof token !== 'string') {
    return {
      status: 'malformed',
      category: 'Token Malformado (Tipo Inválido)',
      isExpired: false,
      message: `Tipo de token inesperado: esperado string, recebido ${typeof token}.`,
      details: {},
    };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return {
      status: 'malformed',
      category: 'Token Malformado (Estrutura Inválida)',
      isExpired: false,
      message: `Estrutura JWT inválida: possui ${parts.length} partes em vez do padrão de 3 partes (header.payload.signature).`,
      details: { tokenPreview: token.slice(0, 15) + '...' },
    };
  }

  try {
    const base64Url = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64Url)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonPayload);

    const nowSec = Math.floor(Date.now() / 1000);
    const exp = typeof payload.exp === 'number' ? payload.exp : null;
    const isExpired = exp !== null && exp < nowSec;
    const diffSec = exp !== null ? Math.abs(nowSec - exp) : null;
    const diffMin = diffSec !== null ? Math.round(diffSec / 60) : null;

    let category = 'Estrutura Válida no Cliente';
    let message = '';

    if (isExpired) {
      category = 'Token Expirado';
      message = `O token JWT expirou há aproximadamente ${diffMin} minuto(s) (expiração: ${new Date(exp * 1000).toLocaleString()}).`;
    } else if (exp !== null) {
      message = `Token JWT estruturalmente válido no cliente (expira em ~${diffMin} min, às ${new Date(exp * 1000).toLocaleTimeString()}).`;
    } else {
      message = 'Token JWT não possui campo "exp" de expiração definido.';
    }

    return {
      status: isExpired ? 'expired' : 'valid_structure',
      category,
      isExpired,
      userId: payload.sub || payload.id || 'N/A',
      email: payload.email || 'N/A',
      issuer: payload.iss || 'N/A',
      role: payload.role || 'N/A',
      issuedAt: payload.iat ? new Date(payload.iat * 1000).toLocaleString() : 'N/A',
      expiresAt: exp ? new Date(exp * 1000).toLocaleString() : 'Sem expiração',
      remainingMinutes: !isExpired && diffMin !== null ? diffMin : 0,
      expiredMinutesAgo: isExpired && diffMin !== null ? diffMin : 0,
      message,
      payload,
    };
  } catch (err) {
    return {
      status: 'malformed',
      category: 'Token Malformado (Falha de Decodificação)',
      isExpired: false,
      message: `Erro ao decodificar payload JWT: ${err.message}`,
      details: {},
    };
  }
}

let onSessionExpiredCallback = null;

/* --------------------------------------------------------------------------
 * Cliente de Dados (API do Backend com Tratamento Robusto de 401)
 * ------------------------------------------------------------------------ */
async function requestApi(path, options = {}) {
  // If not logged in and accessing protected endpoint, skip request safely
  if (!authSession?.access_token && !path.startsWith('/api/auth/') && path !== '/api/config') {
    return null;
  }

  const token = authSession?.access_token || '';
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const method = (options.method || 'GET').toUpperCase();

  try {
    const response = await fetch(path, { ...options, headers });
    if (!response) return null;

    // Robust 401 Unauthorized Diagnostic & Handling
    if (response.status === 401) {
      const errorBody = await response.json().catch(() => ({}));
      const tokenAnalysis = inspectJwtToken(token);

      // Determine precise cause
      let rootCause = 'Erro no Servidor de Autenticação';
      if (tokenAnalysis.status === 'missing') {
        rootCause = 'Token não enviado (Cabeçalho Authorization ausente)';
      } else if (tokenAnalysis.status === 'malformed') {
        rootCause = 'Token enviado está malformado ou corrompido';
      } else if (tokenAnalysis.isExpired) {
        rootCause = `Token expirado no cliente (${tokenAnalysis.expiredMinutesAgo} min atrás)`;
      } else {
        rootCause = 'Token rejeitado pelo endpoint/servidor (assinatura inválida, usuário revogado ou projeto reinicializado)';
      }

      // Detailed Structured Console Log
      console.groupCollapsed(
        `%c🔴 [401 Unauthorized] ${method} ${path} — ${rootCause}`,
        'color: #ef4444; font-weight: bold; font-size: 11px;'
      );
      console.warn('📋 Resumo do Diagnóstico:', {
        endpoint: path,
        method,
        causaPrincipal: rootCause,
        mensagemDiagnostico: tokenAnalysis.message,
        respostaServidor: errorBody?.error || 'Nenhuma mensagem de erro detalhada retornada.',
      });

      console.table({
        'Parâmetro': ['Endpoint', 'Método HTTP', 'Status HTTP', 'Diagnóstico Token', 'ID Usuário (sub)', 'E-mail', 'Emitido em', 'Expira em', 'Erro do Servidor'],
        'Valor': [
          path,
          method,
          401,
          tokenAnalysis.category,
          tokenAnalysis.userId || 'N/A',
          tokenAnalysis.email || 'N/A',
          tokenAnalysis.issuedAt || 'N/A',
          tokenAnalysis.expiresAt || 'N/A',
          errorBody?.error || 'Não informado',
        ],
      });

      if (tokenAnalysis.payload) {
        console.log('🔍 Payload Decodificado do Token:', tokenAnalysis.payload);
      }
      console.groupEnd();

      // Handle session expiration for logged-in users gracefully
      if (authSession?.access_token && !path.startsWith('/api/auth/')) {
        Toast.show({
          type: 'error',
          title: 'Sessão expirada',
          message: 'Sua autenticação expirou ou é inválida. Por favor, entre novamente.',
        });
        try { localStorage.removeItem('botpromo_token'); } catch (_) {}
        authSession = null;
        if (typeof onSessionExpiredCallback === 'function') {
          onSessionExpiredCallback();
        }
      }

      return null;
    }

    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    return data;
  } catch (err) {
    console.warn(`[Network Error] Falha na requisição para ${path}:`, err.message);
    return null;
  }
}

const DataClient = {
  async getLinkAtual() {
    return requestApi('/api/link-atual');
  },

  async getHistoricoLinks() {
    const data = await requestApi('/api/historico-links');
    return Array.isArray(data) ? data : [];
  },

  async salvarNovoLink(link, tag = '') {
    return requestApi('/api/historico-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link, tag }),
    });
  },

  async excluirLink(id) {
    return requestApi(`/api/historico-links?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async restaurarLink(linkOrId, tag = '') {
    const base = typeof linkOrId === 'object' ? { id: linkOrId.id } : { link: linkOrId, tag };
    const body = { ...base, id_usuario: authSession?.user?.id || null };
    return requestApi('/api/bot/restaurar-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },

  async testarBot(payload = {}) {
    const res = await requestApi('/api/bot/testar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res || { ok: false, status: 500, latencyMs: 0, response: 'Sem resposta do servidor' };
  },

  async getTimers() {
    const res = await requestApi('/api/bot/timers');
    return res || { ok: false, timers: [] };
  },

  async salvarTimer(timer, end_timer = null, nome_timer = '') {
    return requestApi('/api/bot/timers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timer, end_timer, nome_timer }),
    });
  },

  async testStopTimer() {
    return requestApi('/api/bot/timers/test-stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  async excluirTimer(id) {
    return requestApi(`/api/bot/timers?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async dispararWebhook({ webhookUrl = null, timerInfo = null } = {}) {
    return requestApi('/api/bot/disparar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl, timerInfo }),
    });
  },

  async dispararProdutosWebhook({ webhookUrl = null } = {}) {
    return requestApi('/api/produtos/disparar-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl }),
    });
  },

  async salvarWebhookUrl(webhookUrl) {
    return requestApi('/api/bot/webhook-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl }),
    });
  },

  async getBotStatus() {
    return requestApi('/api/bot/status');
  },
  async getProdutosGeral({ search = '', marketplace = 'todos', limit } = {}) {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (search) params.set('search', search);
    if (marketplace && marketplace !== 'todos') params.set('marketplace', marketplace);
    const data = await requestApi(`/api/produtos/geral?${params.toString()}`);
    return Array.isArray(data) ? data : [];
  },

  async deleteProdutoGeral(id) {
    return requestApi(`/api/produtos/geral?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async clearProdutosGeral() {
    return requestApi('/api/produtos/geral?all=true', {
      method: 'DELETE',
    });
  },
  async getCategorias() {
    const data = await requestApi('/api/categorias');
    return Array.isArray(data) ? data : [];
  },
  async getCategoriasAtivas() {
    return requestApi('/api/produtos/categorias-ativas');
  },
  async removeCategoriaAtiva(id) {
    return requestApi(`/api/produtos/categorias-ativas?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  async clearCategoriasAtivas() {
    return requestApi('/api/produtos/categorias-ativas?all=true', {
      method: 'DELETE',
    });
  },
  async aplicarCategorias({ categoria_ids = [], quantidades = {}, quantidade_padrao = null, substituir = true } = {}) {
    return requestApi('/api/produtos/aplicar-categorias', {
      method: 'POST',
      body: JSON.stringify({
        categoria_ids,
        quantidades,
        quantidade_padrao,
        substituir,
        id_usuario: authSession?.user?.id || null,
      }),
    });
  },
  async getSegurancaStatus() {
    return requestApi('/api/bot/seguranca');
  },
  async setSegurancaConfig({ enabled = true, resetRetries = false } = {}) {
    return requestApi('/api/bot/seguranca', {
      method: 'POST',
      body: JSON.stringify({ enabled, resetRetries }),
    });
  },

  async countProdutosEnviados() {
    const data = await requestApi('/api/produtos/enviados/count');
    return data?.count ?? 0;
  },

  async countProdutosGeral() {
    const data = await requestApi('/api/produtos/geral/count');
    return data?.count ?? 0;
  },

  async getUltimosEnviados({ limit = 10, search = '', marketplace = 'todos' } = {}) {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (search) params.set('search', search);
    if (marketplace && marketplace !== 'todos') params.set('marketplace', marketplace);
    const data = await requestApi(`/api/produtos/enviados?${params.toString()}`);
    return Array.isArray(data) ? data : [];
  },

  async getResumo(dias = 1) {
    const data = await requestApi(`/api/resumo?dias=${encodeURIComponent(dias)}`);
    return data || { items: [], analytics: {} };
  },

  async pararBot() {
    return requestApi('/api/bot', { method: 'DELETE' });
  },

  async reiniciarBot() {
    return requestApi('/api/bot/reiniciar', { method: 'POST' });
  },
};
window.DataClient = DataClient;

/* --------------------------------------------------------------------------
 * Roteador de Views & Sidebar
 * ------------------------------------------------------------------------ */
(function () {
  const VIEWS = {
    dashboard: { title: 'Painel de Controle', subtitle: 'Monitoramento do bot em tempo real' },
    produtos: { title: 'Produtos', subtitle: 'Produtos capturados no link atual aguardando envio pelo robô' },
    resumo: { title: 'Resumo de Atividades', subtitle: 'Desempenho consolidado e distribuição de envio' },
    historico: { title: 'Histórico de Links', subtitle: 'Cadastre, ative e gerencie links e campanhas de monitoramento' },
    configuracoes: { title: 'Configurações Operacionais', subtitle: 'Controle operacional do bot, pausas e testes de webhook' },
  };

  function setActiveView(name) {
    if (!VIEWS[name]) name = 'dashboard';

    document.querySelectorAll('[data-view]').forEach((section) => {
      section.hidden = section.getAttribute('data-view') !== name;
    });

    document.querySelectorAll('.nav-item[data-page-link]').forEach((item) => {
      const isActive = item.getAttribute('data-page-link') === name;
      item.classList.toggle('is-active', isActive);
      if (isActive) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });

    const titleEl = document.querySelector('[data-topbar-title]');
    const subtitleEl = document.querySelector('[data-topbar-subtitle]');
    if (titleEl) titleEl.textContent = VIEWS[name].title;
    if (subtitleEl) subtitleEl.textContent = VIEWS[name].subtitle;

    document.title = `${VIEWS[name].title} · BotPromo`;

    if (name === 'produtos' && typeof window.carregarProdutosGeral === 'function') {
      window.carregarProdutosGeral();
    }
    if (name === 'resumo' && typeof window.carregarResumo === 'function') {
      window.carregarResumo();
    }
    if (name === 'historico' && typeof window.carregarHistoricoCompleto === 'function') {
      window.carregarHistoricoCompleto();
    }
    if (name === 'configuracoes') {
      if (window.BotNotifier && typeof window.BotNotifier.updateUI === 'function') {
        window.BotNotifier.updateUI();
      }
      if (typeof window.carregarTimersConfig === 'function') {
        window.carregarTimersConfig();
      }
    }
  }

  function currentViewFromHash() {
    const hash = window.location.hash.replace('#', '');
    return VIEWS[hash] ? hash : 'dashboard';
  }

  function initSidebar() {
    const shell = document.querySelector('.app-shell');
    const collapseBtn = document.querySelector('[data-sidebar-collapse]');
    const menuBtn = document.querySelector('[data-menu-open]');
    const overlay = document.querySelector('[data-sidebar-overlay]');

    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => shell?.classList.toggle('is-collapsed'));
    }
    if (menuBtn) {
      menuBtn.addEventListener('click', () => document.body.classList.add('sidebar-open'));
    }
    if (overlay) {
      overlay.addEventListener('click', () => document.body.classList.remove('sidebar-open'));
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    setActiveView(currentViewFromHash());
    window.addEventListener('hashchange', () => {
      setActiveView(currentViewFromHash());
      document.body.classList.remove('sidebar-open');
    });
    initSidebar();
  });
})();

/* --------------------------------------------------------------------------
 * Dashboard Controller
 * ------------------------------------------------------------------------ */
(function () {
  let recentLimit = '10';
  let searchTerm = '';
  let selectedMarketplace = 'todos';
  let autoRefreshInterval = 30; // seconds
  let autoRefreshTimer = null;
  let searchDebounceTimer = null;

  const els = {};

  function cacheEls() {
    els.linkCardBody = document.querySelector('[data-link-card-body]');
    els.statusPill = document.querySelector('[data-status-pill]');
    els.statEnviados = document.querySelector('[data-stat-enviados]');
    els.statDisponiveis = document.querySelector('[data-stat-disponiveis]');
    els.statUltimoEnvio = document.querySelector('[data-stat-ultimo-envio]');
    els.statUltimoEnvioMeta = document.querySelector('[data-stat-ultimo-envio-meta]');
    els.statTempoAtivo = document.querySelector('[data-stat-tempo-ativo]');
    els.tableBody = document.querySelector('[data-recent-table-body]');
    els.tableWrap = document.querySelector('[data-recent-table-wrap]');
    els.emptyState = document.querySelector('[data-recent-empty]');
    els.errorState = document.querySelector('[data-dashboard-error]');
    els.dashboardContent = document.querySelector('[data-dashboard-content]');
    els.refreshBtn = document.querySelector('[data-refresh-dashboard]');
    els.retryBtn = document.querySelector('[data-retry-dashboard]');
    els.searchInput = document.querySelector('[data-product-search]');
    els.marketplaceFilter = document.querySelector('[data-marketplace-filter]');
    els.limitSelect = document.querySelector('[data-recent-limit]');
    els.exportCsvBtn = document.querySelector('[data-export-csv]');
    els.autoRefreshSelect = document.querySelector('[data-auto-refresh-select]');
  }

  function setSkeletons(on) {
    document.querySelectorAll('[data-skel]').forEach((el) => (el.style.display = on ? '' : 'none'));
    document.querySelectorAll('[data-real]').forEach((el) => (el.style.display = on ? 'none' : ''));
  }

  let previousBotActive = null;

  const BotNotifier = {
    init() {},
    updateUI() {},
    notifyBotOffline() {},
    notifyBotOnline() {},
  };
  window.BotNotifier = BotNotifier;

  function setBotStatus(isActive) {
    if (!els.statusPill) return;
    els.statusPill.classList.toggle('is-online', isActive);
    els.statusPill.classList.toggle('is-offline', !isActive);
    els.statusPill.querySelector('[data-status-text]').textContent = isActive ? 'Bot ativo' : 'Bot pausado';

    // Status transition detection: Online (true) -> Offline (false)
    if (previousBotActive === true && isActive === false) {
      BotNotifier.notifyBotOffline();
    } else if (previousBotActive === false && isActive === true) {
      BotNotifier.notifyBotOnline();
    }
    previousBotActive = isActive;
  }

  function renderLinkCard(link) {
    if (!link || !link.link) {
      els.linkCardBody.innerHTML = `
        <div class="link-card__box">
          <span class="link-card__empty">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
            Nenhum link ativo configurado no momento.
          </span>
        </div>`;
      setBotStatus(false);
      return;
    }

    const mp = Utils.detectMarketplace(link.link, link.tag);
    els.linkCardBody.innerHTML = `
      <div class="link-card__box">
        <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
          <span class="badge-mp ${mp.badgeClass}">${mp.tag}</span>
          <a class="link-card__url" href="${Utils.escapeHtml(link.link)}" target="_blank" rel="noopener noreferrer" title="${Utils.escapeHtml(link.link)}">${Utils.escapeHtml(link.tag || link.link)}</a>
        </div>
        <button class="icon-btn" data-copy-active-link title="Copiar link ativo" aria-label="Copiar link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <a class="icon-btn" href="${Utils.escapeHtml(link.link)}" target="_blank" rel="noopener noreferrer" title="Abrir em nova aba" aria-label="Abrir link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/></svg>
        </a>
      </div>
      <div class="stat-card__meta">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
        Configurado em ${Utils.formatDateTime(link.created_at)}
      </div>
    `;

    const copyBtn = els.linkCardBody.querySelector('[data-copy-active-link]');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        await navigator.clipboard.writeText(link.link);
        Toast.show({ type: 'success', title: 'Link copiado!', desc: 'O link da promoção ativa foi copiado.' });
      });
    }
  }

  function renderRecentTable(items) {
    if (!items || items.length === 0) {
      els.tableWrap.hidden = true;
      els.emptyState.hidden = false;
      return;
    }
    els.tableWrap.hidden = false;
    els.emptyState.hidden = true;

    els.tableBody.innerHTML = items
      .map((item) => {
        const { date, time } = Utils.splitDateTime(item.created_at);
        const url = item.url_produto || item.link || '';
        const name = item.nome_produto || item.title || Utils.hostFromUrl(url);
        const mp = Utils.detectMarketplace(url, name);

        const thumbHtml = item.url_imagem
          ? `<img src="${Utils.escapeHtml(item.url_imagem)}" alt="" class="product-cell__img" style="width:38px; height:38px; object-fit:cover; border-radius:6px; border:1px solid var(--border-subtle);" onerror="this.style.display='none'">`
          : `<div class="product-cell__thumb"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.91 8.84 8.56 21.19a2 2 0 0 1-2.83 0l-3.92-3.92a2 2 0 0 1 0-2.83L14.16 2.09a2 2 0 0 1 1.42-.59H21a1 1 0 0 1 1 1v5.42a2 2 0 0 1-.59 1.42Z"/><path d="M17.5 8.5h.01"/></svg></div>`;

        const priceHtml = item.valor_promocional
          ? `<span style="font-size:11.5px; color:var(--success); font-weight:700; margin-left:6px;">${Utils.escapeHtml(item.valor_promocional)}</span>`
          : '';

        return `
        <tr>
          <td data-label="Marketplace">
            <span class="badge-mp ${mp.badgeClass}">${mp.name}</span>
          </td>
          <td data-label="Produto">
            <div class="product-cell">
              ${thumbHtml}
              <div style="min-width:0; flex:1;">
                <div class="product-cell__name" title="${Utils.escapeHtml(name)}">${Utils.escapeHtml(name)} ${priceHtml}</div>
                ${url ? `<a class="product-cell__link" href="${Utils.escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${Utils.escapeHtml(url)}</a>` : ''}
              </div>
            </div>
          </td>
          <td data-label="Data" class="cell-muted">${date}</td>
          <td data-label="Horário" class="cell-mono">${time}</td>
          <td data-label="Status">
            <span class="badge badge-success">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>
              Enviado
            </span>
          </td>
          <td data-label="Ações" style="text-align:right;">
            <div class="table-actions" style="justify-content:flex-end;">
              ${url ? `
                <button class="btn-action-icon" data-copy-item-url="${Utils.escapeHtml(url)}" title="Copiar link" aria-label="Copiar link">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <a class="btn-action-icon" href="${Utils.escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="Abrir produto" aria-label="Abrir produto">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/></svg>
                </a>
              ` : '—'}
            </div>
          </td>
        </tr>`;
      })
      .join('');

    // Attach copy listeners
    els.tableBody.querySelectorAll('[data-copy-item-url]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const url = btn.getAttribute('data-copy-item-url');
        await navigator.clipboard.writeText(url);
        Toast.show({ type: 'success', title: 'Link copiado!' });
      });
    });
  }

  async function refreshDashboard({ silent = false } = {}) {
    if (!silent) setSkeletons(true);
    if (els.errorState) els.errorState.hidden = true;
    if (els.refreshBtn) els.refreshBtn.classList.add('is-spinning');

    try {
      const [link, totalEnviados, totalDisponiveis, ultimosEnviados, resumoData, botStatus] = await Promise.all([
        DataClient.getLinkAtual(),
        DataClient.countProdutosEnviados(),
        DataClient.countProdutosGeral(),
        DataClient.getUltimosEnviados({
          limit: recentLimit,
          search: searchTerm,
          marketplace: selectedMarketplace,
        }),
        DataClient.getResumo(1),
        DataClient.getBotStatus().catch(() => null),
      ]);

      renderLinkCard(link);
      if (botStatus) setBotStatus(botStatus);
      if (els.statEnviados) els.statEnviados.textContent = Utils.formatNumber(totalEnviados);
      if (els.statDisponiveis) els.statDisponiveis.textContent = Utils.formatNumber(totalDisponiveis);
      const queueBadge = document.querySelector('[data-badge-produtos-count]');
      if (queueBadge) queueBadge.textContent = Utils.formatNumber(totalDisponiveis);

      if (ultimosEnviados && ultimosEnviados.length > 0) {
        const last = ultimosEnviados[0];
        const { time } = Utils.splitDateTime(last.created_at);
        if (els.statUltimoEnvio) els.statUltimoEnvio.textContent = time;
        if (els.statUltimoEnvioMeta) els.statUltimoEnvioMeta.textContent = Utils.timeAgo(last.created_at);
      } else {
        if (els.statUltimoEnvio) els.statUltimoEnvio.textContent = 'Nenhum envio';
        if (els.statUltimoEnvioMeta) els.statUltimoEnvioMeta.textContent = 'Aguardando primeiro envio de hoje';
      }

      const activeTimeStr = resumoData?.analytics?.tempoFormatado || '0h 0m';
      if (els.statTempoAtivo) els.statTempoAtivo.textContent = activeTimeStr;

      renderRecentTable(ultimosEnviados);
      setSkeletons(false);
    } catch (err) {
      console.error('Erro ao atualizar dashboard:', err);
      setSkeletons(false);
      setBotStatus(false);
      if (els.errorState) els.errorState.hidden = false;
    } finally {
      if (els.refreshBtn) els.refreshBtn.classList.remove('is-spinning');
    }
  }

  function setupAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    if (autoRefreshInterval > 0) {
      autoRefreshTimer = setInterval(() => {
        const currentHash = window.location.hash || '#dashboard';
        if (currentHash === '#dashboard') refreshDashboard({ silent: true });
      }, autoRefreshInterval * 1000);
    }
  }

  function init() {
    cacheEls();

    els.refreshBtn?.addEventListener('click', () => refreshDashboard());
    els.retryBtn?.addEventListener('click', () => refreshDashboard());

    // Search filter with debounce
    els.searchInput?.addEventListener('input', (e) => {
      searchTerm = e.target.value.trim();
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => refreshDashboard({ silent: true }), 300);
    });

    // Marketplace dropdown filter
    els.marketplaceFilter?.addEventListener('change', (e) => {
      selectedMarketplace = e.target.value;
      refreshDashboard({ silent: true });
    });

    // Limit selector
    els.limitSelect?.addEventListener('change', (e) => {
      recentLimit = e.target.value;
      refreshDashboard({ silent: true });
    });

    // Export CSV
    els.exportCsvBtn?.addEventListener('click', () => {
      window.open('/api/produtos/enviados?format=csv', '_blank');
      Toast.show({ type: 'success', title: 'Exportação iniciada', desc: 'Gerando arquivo CSV com os produtos cadastrados.' });
    });

    // Auto-refresh interval
    els.autoRefreshSelect?.addEventListener('change', (e) => {
      autoRefreshInterval = Number(e.target.value);
      setupAutoRefresh();
      Toast.show({
        type: 'info',
        title: 'Atualização automática',
        desc: autoRefreshInterval > 0 ? `Atualizando a cada ${autoRefreshInterval}s` : 'Atualização automática pausada',
      });
    });

    // Global keyboard shortcut
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        refreshDashboard();
      }
      if (e.key === '/') {
        e.preventDefault();
        els.searchInput?.focus();
      }
    });

    BotNotifier.init();
    refreshDashboard();
    setupAutoRefresh();
    window.refreshDashboard = refreshDashboard;
  }

  document.addEventListener('DOMContentLoaded', init);
})();

/* --------------------------------------------------------------------------
 * Resumo Analítico & Gráficos SVG (Supabase Real)
 * ------------------------------------------------------------------------ */
(function () {
  const filtroEl = document.querySelector('[data-resumo-filtro]');
  const enviadosEl = document.querySelector('[data-resumo-enviados]');
  const tempoEl = document.querySelector('[data-resumo-tempo]');
  const ritmoEl = document.querySelector('[data-resumo-ritmo]');
  const picoEl = document.querySelector('[data-resumo-pico]');
  const chartSvg = document.querySelector('[data-resumo-chart]');
  const shareList = document.querySelector('[data-resumo-share-list]');

  // Elementos da Seção de Estabilidade & Sentinela
  const sentinelaCountEl = document.querySelector('[data-resumo-sentinela-count]');
  const sentinelaBadgeEl = document.querySelector('[data-resumo-sentinela-badge]');
  const sentinelaMetaEl = document.querySelector('[data-resumo-sentinela-meta]');

  const inatividadeValEl = document.querySelector('[data-resumo-inatividade-valor]');
  const janelaBadgeEl = document.querySelector('[data-resumo-janela-badge]');
  const inatividadeMetaEl = document.querySelector('[data-resumo-inatividade-meta]');

  const pausasValEl = document.querySelector('[data-resumo-pausas-valor]');
  const pausasBadgeEl = document.querySelector('[data-resumo-pausas-badge]');
  const pausasMetaEl = document.querySelector('[data-resumo-pausas-meta]');

  const statusGeralChip = document.querySelector('[data-resumo-status-geral-chip]');
  const statusGeralText = document.querySelector('[data-resumo-status-geral-text]');

  const MARKET_COLORS = {
    'Mercado Livre': '#FFE600',
    Shopee: '#EE4D2D',
    Amazon: '#FF9900',
    AliExpress: '#FF4747',
    Magalu: '#0086FF',
    'Loja Parceira': '#3B6BFF',
    Outro: '#6577A8',
  };

  function renderSvgChart(hourlyBuckets = []) {
    if (!chartSvg) return;

    const maxVal = Math.max(...hourlyBuckets, 1);
    const width = 600;
    const height = 180;
    const paddingBottom = 25;
    const availableHeight = height - paddingBottom;
    const barWidth = 18;
    const step = width / 24;

    let svgHtml = '';

    // Horizontal grid lines
    [0.25, 0.5, 0.75, 1.0].forEach((ratio) => {
      const y = availableHeight - availableHeight * ratio;
      svgHtml += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="rgba(120,150,220,0.12)" stroke-dasharray="3,3" />`;
    });

    // Bars
    hourlyBuckets.forEach((count, h) => {
      const x = h * step + (step - barWidth) / 2;
      const barHeight = Math.max(count > 0 ? (count / maxVal) * (availableHeight - 10) : 4, 3);
      const y = availableHeight - barHeight;
      const isPeak = count === maxVal && count > 0;
      const color = isPeak ? '#3B6BFF' : (count > 0 ? '#5B8FFF' : 'rgba(120,150,220,0.2)');

      svgHtml += `
        <g class="chart-bar-group">
          <title>${String(h).padStart(2, '0')}:00h - ${count} produto(s)</title>
          <rect class="chart-bar-rect" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="${color}" />
          ${h % 3 === 0 ? `<text x="${x + barWidth / 2}" y="${height - 4}" fill="var(--text-tertiary)" font-size="11" text-anchor="middle" font-family="var(--font-mono)">${String(h).padStart(2, '0')}h</text>` : ''}
        </g>
      `;
    });

    chartSvg.innerHTML = svgHtml;
  }

  function renderMarketShare(marketplaces = {}, total = 0) {
    if (!shareList) return;
    const entries = Object.entries(marketplaces).sort((a, b) => b[1] - a[1]);

    if (!entries.length || total === 0) {
      shareList.innerHTML = '<div class="link-history-empty">Nenhum envio de produto registrado no período.</div>';
      return;
    }

    shareList.innerHTML = entries
      .map(([name, count]) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const color = MARKET_COLORS[name] || '#3B6BFF';
        return `
        <div class="market-share-item">
          <div class="market-share-label">
            <span style="color:var(--text-primary);">${Utils.escapeHtml(name)}</span>
            <span style="color:var(--text-secondary); font-family:var(--font-mono);">${count} (${pct}%)</span>
          </div>
          <div class="market-share-bar">
            <div class="market-share-fill" style="width:${pct}%; background:${color};"></div>
          </div>
        </div>
      `;
      })
      .join('');
  }

  async function carregarResumo() {
    if (!filtroEl) return;
    const dias = filtroEl.value || 1;

    if (enviadosEl) enviadosEl.textContent = '...';
    if (tempoEl) tempoEl.textContent = '...';
    if (ritmoEl) ritmoEl.textContent = '...';
    if (picoEl) picoEl.textContent = '...';

    try {
      const response = await DataClient.getResumo(dias);
      const a = response.analytics || {};

      if (enviadosEl) enviadosEl.textContent = Utils.formatNumber(a.total || 0);
      if (tempoEl) tempoEl.textContent = a.tempoFormatado || '0h 0m';
      if (ritmoEl) ritmoEl.textContent = `${a.mediaPorHora || '0.0'} /h`;
      if (picoEl) picoEl.textContent = a.horarioPico || '—';

      // 1. Sentinela de Segurança
      const sCount = Number(a.sentinelaCount) || 0;
      if (sentinelaCountEl) sentinelaCountEl.textContent = String(sCount);
      if (sentinelaBadgeEl) {
        if (sCount === 0) {
          sentinelaBadgeEl.textContent = 'Estável · 0 intervenções';
          sentinelaBadgeEl.className = 'tag-chip tag-chip--sm tag-chip--success';
        } else {
          sentinelaBadgeEl.textContent = `${sCount} ${sCount === 1 ? 'intervenção' : 'intervenções'}`;
          sentinelaBadgeEl.className = 'tag-chip tag-chip--sm tag-chip--warning';
        }
      }
      if (sentinelaMetaEl) {
        if (sCount === 0) {
          sentinelaMetaEl.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
            <span>Nenhum travamento detectado no período</span>
          `;
        } else {
          const ocorridoText = a.ultimoSentinela?.ocorrido || 'Tentativa de reativar o bot';
          const ultimoHora = a.ultimoSentinela?.brasiliaTime ? ` (${a.ultimoSentinela.brasiliaTime})` : '';
          sentinelaMetaEl.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/></svg>
            <span>${Utils.escapeHtml(ocorridoText)}${ultimoHora}</span>
          `;
        }
      }

      // 2. Maior Tempo Sem Envio (na grade programada)
      if (inatividadeValEl) inatividadeValEl.textContent = a.maiorTempoSemEnvioFormatado || '0 min';
      if (janelaBadgeEl) {
        janelaBadgeEl.textContent = `Grade: ${a.janelaProgramadaFormatada || '08:00 às 22:00'}`;
      }
      if (inatividadeMetaEl) {
        inatividadeMetaEl.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>${Utils.escapeHtml(a.maiorTempoSemEnvioIntervalo || 'Intervalo máximo observado')}</span>
        `;
      }

      // 3. Pausas do Robô
      const pCount = Number(a.pausasCount) || 0;
      if (pausasValEl) pausasValEl.textContent = String(pCount);
      if (pausasBadgeEl) {
        pausasBadgeEl.textContent = `${pCount} ${pCount === 1 ? 'pausa' : 'pausas'}`;
        pausasBadgeEl.className = pCount === 0 ? 'tag-chip tag-chip--sm tag-chip--neutral' : 'tag-chip tag-chip--sm tag-chip--amber';
      }
      if (pausasMetaEl) {
        if (pCount === 0) {
          pausasMetaEl.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
            <span>Nenhuma pausa registrada no período</span>
          `;
        } else {
          const ocorridoText = a.ultimaPausa?.ocorrido || a.ultimaPausa?.reason || 'bot pausado manualmente';
          const ultimoHora = a.ultimaPausa?.brasiliaTime ? ` (${a.ultimaPausa.brasiliaTime})` : '';
          pausasMetaEl.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></svg>
            <span>${Utils.escapeHtml(ocorridoText)}${ultimoHora}</span>
          `;
        }
      }

      // Status Geral Chip
      if (statusGeralText) {
        statusGeralText.textContent = sCount === 0 ? 'Operação Estável' : `${sCount} Intervenção(ões)`;
      }

      renderSvgChart(a.hourlyBuckets || Array(24).fill(0));
      renderMarketShare(a.marketplaces || {}, a.total || 0);
    } catch (err) {
      console.error('Erro ao carregar resumo:', err);
      Toast.show({ type: 'error', title: 'Erro no Resumo', desc: err.message });
    }
  }

  window.carregarResumo = carregarResumo;

  document.addEventListener('DOMContentLoaded', () => {
    filtroEl?.addEventListener('change', carregarResumo);
  });
})();

/* --------------------------------------------------------------------------
 * Histórico de Links & Controle Operacional (Supabase Real)
 * ------------------------------------------------------------------------ */
(function () {
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v18l15-9L5 3z"/></svg>';
  const ICON_DANGER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>';

  function updateStatusButton(isActive) {
    const stopBtn = document.querySelector('[data-action-stop]');
    if (!stopBtn) return;
    stopBtn.innerHTML = `${isActive ? ICON_PAUSE : ICON_PLAY} ${isActive ? 'Parar Bot' : 'Ativar Bot'}`;
    stopBtn.className = `btn ${isActive ? 'btn-ghost' : 'btn-primary'} btn-block`;
  }

  function renderHistoryList(container, items, activeLinkUrl = '') {
    if (!container) return;
    if (!items || !items.length) {
      container.innerHTML = '<div class="link-history-empty">Nenhum link cadastrado ainda. Cadastre um link acima para iniciar o monitoramento.</div>';
      return;
    }

    container.innerHTML = items
      .map((item) => {
        const mp = item.marketplace || Utils.detectMarketplace(item.link, item.tag);
        const tagLabel = item.tag ? Utils.escapeHtml(item.tag) : mp.name;
        const isActive = activeLinkUrl && item.link === activeLinkUrl;

        return `
        <div class="link-history-item ${isActive ? 'is-active-link' : ''}" style="${isActive ? 'border-color: var(--success); background: var(--success-bg);' : ''}">
          <div class="link-history-item__content">
            <div class="link-history-item__top">
              <span class="badge-mp ${mp.badgeClass}">${mp.tag}</span>
              <span class="link-history-item__tag">${tagLabel}</span>
              ${isActive ? '<span class="badge badge-success" style="font-size:11px; padding:3px 8px; font-weight:700;"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg> Ativo Agora</span>' : ''}
              <span>${Utils.formatDateTime(item.created_at)}</span>
            </div>
            <a href="${Utils.escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" title="${Utils.escapeHtml(item.link)}">${Utils.escapeHtml(item.link)}</a>
          </div>
          <div class="link-history-item__actions">
            ${isActive ? `
              <button class="btn btn-ghost link-history-item__button" disabled style="opacity:0.85; color:var(--success); border-color:var(--success-border);" type="button">Monitorando</button>
            ` : `
              <button class="btn btn-primary link-history-item__button" data-use-link="${Utils.escapeHtml(String(item.id))}" type="button">Ativar</button>
            `}
            <button class="btn-action-icon" data-copy-link-url="${Utils.escapeHtml(item.link)}" title="Copiar link" aria-label="Copiar link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button class="btn-action-icon" data-delete-link="${Utils.escapeHtml(String(item.id))}" title="Excluir do histórico" aria-label="Excluir do histórico" style="color:var(--danger);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>`;
      })
      .join('');

    // Bind item actions
    container.querySelectorAll('[data-use-link]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-use-link');
        try {
          await DataClient.restaurarLink({ id });
          Toast.show({ type: 'success', title: 'Link ativado!', desc: 'O bot agora está monitorando este link.' });
          updateStatusButton(true);
          loadLinks();
          if (typeof window.refreshDashboard === 'function') window.refreshDashboard({ silent: true });
        } catch (err) {
          Toast.show({ type: 'error', title: 'Erro ao ativar', desc: err.message });
        }
      });
    });

    container.querySelectorAll('[data-copy-link-url]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const url = btn.getAttribute('data-copy-link-url');
        await navigator.clipboard.writeText(url);
        Toast.show({ type: 'success', title: 'Link copiado!' });
      });
    });

    container.querySelectorAll('[data-delete-link]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-delete-link');
        try {
          await DataClient.excluirLink(id);
          Toast.show({ type: 'info', title: 'Link removido com sucesso.' });
          loadLinks();
        } catch (err) {
          Toast.show({ type: 'error', title: 'Erro ao excluir', desc: err.message });
        }
      });
    });
  }

  async function loadLinks() {
    const fullListEl = document.querySelector('[data-historico-completo-list]');

    try {
      const [items, activeLink] = await Promise.all([
        DataClient.getHistoricoLinks(),
        DataClient.getLinkAtual(),
      ]);
      const activeUrl = activeLink?.link || '';
      if (fullListEl) renderHistoryList(fullListEl, items, activeUrl);
    } catch (err) {
      console.error('Erro ao carregar histórico:', err);
    }
  }

  window.carregarHistoricoCompleto = loadLinks;

  function init() {
    const linkForm = document.querySelector('[data-link-form]');
    const linkInput = document.querySelector('[data-link-input]');
    const tagInput = document.querySelector('[data-link-tag-input]');
    const stopBtn = document.querySelector('[data-action-stop]');
    const restartBtn = document.querySelector('[data-action-restart]');
    const testBtn = document.querySelector('[data-action-test]');
    const fullSearchInput = document.querySelector('[data-history-search]');

    // Link form submission (in Historico view)
    linkForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = linkInput?.value?.trim();
      const tag = tagInput?.value?.trim();
      if (!url) return;

      const submitBtn = linkForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        await DataClient.salvarNovoLink(url, tag);
        await DataClient.restaurarLink(url, tag);
        if (linkInput) linkInput.value = '';
        if (tagInput) tagInput.value = '';
        Toast.show({ type: 'success', title: 'Novo link ativado!', desc: 'O bot iniciou o monitoramento da URL informada.' });
        updateStatusButton(true);
        loadLinks();
        if (typeof window.refreshDashboard === 'function') window.refreshDashboard({ silent: true });
      } catch (err) {
        Toast.show({ type: 'error', title: 'Erro ao salvar link', desc: err.message });
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    // ==================== AGENDADOR DE DISPAROS PROGRAMADOS ====================
    const timerForm = document.querySelector('[data-timer-form]');
    const timerStartSelect = document.querySelector('[data-timer-start-select]');
    const timerEndSelect = document.querySelector('[data-timer-end-select]');
    const timerTimeInput = document.querySelector('[data-timer-time-input]');
    const timerNameInput = document.querySelector('[data-timer-name-input]');
    const timerListEl = document.querySelector('[data-timers-list]');
    const timerCountEl = document.querySelector('[data-timers-count]');
    const timersRefreshBtn = document.querySelector('[data-timers-refresh-btn]');
    const webhookUrlDisplay = document.querySelector('[data-webhook-url-display]');
    const webhookModeChip = document.querySelector('[data-webhook-mode-chip]');
    const liveClockEl = document.querySelector('[data-live-brasilia-clock]');

    function populateTimeDropdowns() {
      const intervals = [];
      for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 30) {
          const hh = String(h).padStart(2, '0');
          const mm = String(m).padStart(2, '0');
          intervals.push(`${hh}:${mm}:00`);
        }
      }

      if (timerStartSelect) {
        timerStartSelect.innerHTML = intervals
          .map((t) => `<option value="${t}" ${t === '17:00:00' ? 'selected' : ''}>${t}</option>`)
          .join('');
        CustomDropdown.enhance(timerStartSelect, { type: 'time' });
      }

      if (timerEndSelect) {
        const endOptions = [`<option value="" selected>Sem parada automática (manter)</option>`]
          .concat(intervals.map((t) => `<option value="${t}">${t}</option>`))
          .join('');
        timerEndSelect.innerHTML = endOptions;
        CustomDropdown.enhance(timerEndSelect, { type: 'time' });
      }
    }
    populateTimeDropdowns();

    function updateLiveBrasiliaClock() {
      if (!liveClockEl) return;
      try {
        const timeStr = new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(new Date());
        liveClockEl.textContent = timeStr;
      } catch (_) {
        const d = new Date();
        liveClockEl.textContent = d.toTimeString().slice(0, 8);
      }
    }
    setInterval(updateLiveBrasiliaClock, 1000);
    updateLiveBrasiliaClock();

    async function loadTimers() {
      if (!timerListEl) return;
      try {
        const data = await DataClient.getTimers();
        const timers = Array.isArray(data?.timers) ? data.timers : [];
        if (timerCountEl) timerCountEl.textContent = String(timers.length);

        if (data?.webhookUrl && webhookUrlDisplay) {
          webhookUrlDisplay.textContent = data.webhookUrl;
          if (webhookModeChip) {
            const isTest = data.webhookUrl.includes('/webhook-test/');
            webhookModeChip.textContent = isTest ? 'Modo Teste' : 'Pronto';
            webhookModeChip.style.color = isTest ? 'var(--warning)' : 'var(--success)';
            webhookModeChip.style.borderColor = isTest ? 'var(--warning-border)' : 'var(--success-border)';
          }
        }

        if (timers.length === 0) {
          timerListEl.innerHTML = `
            <div class="timer-empty">
              Nenhum horário cadastrado ainda. Use os seletores acima para definir o horário de início e término das ofertas.
            </div>
          `;
          return;
        }

        timerListEl.innerHTML = timers
          .map((t) => {
            const timerVal = Utils.escapeHtml(t.timer || '--:--:--');
            const endVal = t.end_timer ? Utils.escapeHtml(t.end_timer) : null;
            const nomeVal = Utils.escapeHtml(t.nome_timer || `Disparo das ${timerVal}`);
            const preTime = Utils.getThirtyMinutesBefore(t.timer);
            return `
              <div class="timer-item" data-timer-item-id="${t.id}">
                <div class="timer-item__left">
                  <div class="timer-item__times-group">
                    <div class="timer-item__time-badge" title="Horário de Início">▶ ${timerVal}</div>
                    ${endVal ? `
                      <span class="timer-item__arrow" title="Até o término">➔</span>
                      <div class="timer-item__stop-badge" title="Horário de Término e Limpeza de Fila">⏹ ${endVal}</div>
                    ` : ''}
                  </div>
                  <div class="timer-item__info">
                    <div class="timer-item__name">${nomeVal}</div>
                    <div class="timer-item__meta">
                      <span class="tag-chip" style="font-size:10.5px; padding:2px 7px; color:var(--success); border-color:var(--success-border);">Programado</span>
                      ${preTime ? `<span class="tag-chip" style="font-size:10.5px; padding:2px 7px; color:var(--accent-400); border-color:var(--border-default);">📦 Coleta às ${preTime} (30m antes)</span>` : ''}
                      ${endVal ? `<span class="tag-chip" style="font-size:10.5px; padding:2px 7px; color:var(--danger); border-color:var(--danger-border);">🛑 Parada às ${endVal}</span>` : '<span class="tag-chip" style="font-size:10.5px; padding:2px 7px;">Sem parada automática</span>'}
                      <span>Horário de Brasília</span>
                    </div>
                  </div>
                </div>
                <div class="timer-item__actions">
                  <button class="btn btn-primary btn-sm" data-timer-use-id="${t.id}" title="Carregar este agendamento no formulário para usar ou editar" type="button" style="font-size:12px; padding:5px 10px;">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                    Usar no Painel
                  </button>
                  <button class="btn btn-ghost btn-sm" data-timer-test-id="${t.id}" title="Testar disparo de início agora" type="button" style="font-size:12px; padding:5px 9px;">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    Disparo
                  </button>
                  ${endVal ? `
                  <button class="btn btn-ghost btn-sm" data-timer-test-stop-id="${t.id}" title="Testar parada do robô (limpeza da fila) agora" type="button" style="font-size:12px; padding:5px 9px; color:var(--warning);">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                    Parar
                  </button>
                  ` : ''}
                  <button class="btn btn-ghost btn-sm text-danger" data-timer-delete-id="${t.id}" title="Excluir este agendamento" type="button" style="font-size:12px; color:var(--danger); padding:5px 9px;">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    Excluir
                  </button>
                </div>
              </div>
            `;
          })
          .join('');

        // Attach quick-use button
        timerListEl.querySelectorAll('[data-timer-use-id]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-timer-use-id');
            const targetTimer = timers.find((item) => String(item.id) === String(id));
            if (!targetTimer) return;
            if (timerStartSelect) {
              timerStartSelect.value = targetTimer.timer || '17:00:00';
              CustomDropdown.sync(timerStartSelect);
            }
            if (timerEndSelect) {
              timerEndSelect.value = targetTimer.end_timer || '';
              CustomDropdown.sync(timerEndSelect);
            }
            if (timerTimeInput) timerTimeInput.value = targetTimer.timer || '';
            if (timerNameInput) timerNameInput.value = targetTimer.nome_timer || '';
            timerForm?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            Toast.show({
              type: 'success',
              title: 'Horários carregados no formulário!',
              desc: `Início: ${targetTimer.timer || '--'}${targetTimer.end_timer ? ' · Parada: ' + targetTimer.end_timer : ''}`,
            });
          });
        });

        // Attach listeners to delete button
        timerListEl.querySelectorAll('[data-timer-delete-id]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-timer-delete-id');
            const targetTimer = timers.find((item) => String(item.id) === String(id));
            ConfirmModal.open({
              variant: 'danger',
              title: `Excluir agendamento das ${targetTimer?.timer || ''}?`,
              description: 'Este agendamento será desativado e o robô não executará mais este disparo diário.',
              confirmLabel: 'Excluir Agendamento',
              cancelLabel: 'Cancelar',
              onConfirm: async () => {
                try {
                  await DataClient.excluirTimer(id);
                  Toast.show({ type: 'success', title: 'Agendamento removido com sucesso' });
                  loadTimers();
                } catch (err) {
                  Toast.show({ type: 'error', title: 'Erro ao excluir agendamento', desc: err.message });
                }
              },
            });
          });
        });

        // Attach test start trigger
        timerListEl.querySelectorAll('[data-timer-test-id]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-timer-test-id');
            const targetTimer = timers.find((item) => String(item.id) === String(id));
            btn.disabled = true;
            const originalHtml = btn.innerHTML;
            btn.innerHTML = 'Disparando...';

            try {
              const res = await DataClient.dispararWebhook({ timerInfo: targetTimer });
              if (res.ok) {
                Toast.show({
                  type: 'success',
                  title: 'Disparo Realizado!',
                  desc: `Status: ${res.status} (${res.latencyMs}ms). Comando executado com sucesso.`,
                });
              } else if (res.status === 404) {
                Toast.show({
                  type: 'warning',
                  title: 'Serviço em preparação (404)',
                  desc: res.hint || 'Serviço de envio em inicialização. Tente novamente em instantes.',
                });
              } else {
                Toast.show({
                  type: 'error',
                  title: `Falha no Disparo (${res.status || 'Erro'})`,
                  desc: res.response || res.hint || 'Não foi possível acionar o disparo.',
                });
              }
            } catch (err) {
              Toast.show({ type: 'error', title: 'Erro no disparo', desc: err.message });
            } finally {
              btn.innerHTML = originalHtml;
              btn.disabled = false;
            }
          });
        });

        // Attach test stop trigger
        timerListEl.querySelectorAll('[data-timer-test-stop-id]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            const originalHtml = btn.innerHTML;
            btn.innerHTML = 'Parando...';

            try {
              const res = await DataClient.testStopTimer();
              if (res.ok) {
                Toast.show({
                  type: 'success',
                  title: 'Fila limpa com sucesso!',
                  desc: 'Parada automática testada. A fila de produtos foi limpa para pausar o robô.',
                });
                if (typeof window.refreshDashboard === 'function') window.refreshDashboard({ silent: true });
                if (typeof window.carregarProdutosGeral === 'function') window.carregarProdutosGeral();
              } else {
                Toast.show({
                  type: 'error',
                  title: 'Falha ao testar parada',
                  desc: res.message || 'Erro ao limpar fila de produtos.',
                });
              }
            } catch (err) {
              Toast.show({ type: 'error', title: 'Erro ao testar parada', desc: err.message });
            } finally {
              btn.innerHTML = originalHtml;
              btn.disabled = false;
            }
          });
        });
      } catch (err) {
        console.error('Erro ao carregar timers:', err);
        timerListEl.innerHTML = `<div class="timer-empty" style="color:var(--danger);">Erro ao carregar horários: ${Utils.escapeHtml(err.message)}</div>`;
      }
    }
    window.carregarTimersConfig = loadTimers;

    // Submit new timer form
    timerForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      let rawStart = timerStartSelect?.value?.trim() || timerTimeInput?.value?.trim() || '';
      let rawEnd = timerEndSelect?.value?.trim() || '';
      const rawName = timerNameInput?.value?.trim() || '';

      if (!rawStart) {
        Toast.show({ type: 'warning', title: 'Selecione o horário de início', desc: 'Escolha o horário para iniciar os envios.' });
        return;
      }

      // Auto-format HH:MM into HH:MM:00
      if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(rawStart)) {
        rawStart += ':00';
      }
      if (rawEnd && /^([01]\d|2[0-3]):([0-5]\d)$/.test(rawEnd)) {
        rawEnd += ':00';
      }

      const submitBtn = timerForm.querySelector('[data-timer-submit-btn]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await DataClient.salvarTimer(rawStart, rawEnd || null, rawName);
        if (res?.error) {
          throw new Error(res.error);
        }
        Toast.show({
          type: 'success',
          title: 'Programação salva com sucesso!',
          desc: `Início às ${rawStart}${rawEnd ? ' · Parada às ' + rawEnd : ''}.`,
        });
        if (timerNameInput) timerNameInput.value = '';
        loadTimers();
      } catch (err) {
        Toast.show({ type: 'error', title: 'Erro ao agendar horário', desc: err.message });
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    timersRefreshBtn?.addEventListener('click', () => {
      loadTimers();
      Toast.show({ type: 'info', title: 'Horários atualizados' });
    });

    // Test webhook (manual trigger)
    testBtn?.addEventListener('click', async () => {
      testBtn.disabled = true;
      const originalText = testBtn.innerHTML;
      testBtn.innerHTML = 'Enviando sinal...';

      try {
        const res = await DataClient.dispararWebhook();
        if (res.ok) {
          Toast.show({
            type: 'success',
            title: 'Disparo Realizado!',
            desc: `Status: ${res.status} · Latência: ${res.latencyMs}ms. ${res.response || 'Fluxo de envio acionado com sucesso!'}`,
          });
        } else if (res.status === 404) {
          Toast.show({
            type: 'warning',
            title: 'Serviço não registrado (404)',
            desc: res.hint || 'O serviço de envio ainda não foi inicializado. Tente novamente em instantes.',
          });
        } else {
          Toast.show({
            type: 'error',
            title: `Falha no Disparo (${res.status || 'Erro'})`,
            desc: `Latência: ${res.latencyMs}ms. ${res.response || res.hint || ''}`,
          });
        }
      } catch (err) {
        Toast.show({ type: 'error', title: 'Erro ao executar disparo', desc: err.message });
      } finally {
        testBtn.innerHTML = originalText;
        testBtn.disabled = false;
      }
    });

    // ==================== MODAL DE AGENDAMENTO DE HORÁRIOS ====================
    const schedulerModalEl = document.querySelector('[data-scheduler-modal]');
    const schedulerCloseBtn = document.querySelector('[data-scheduler-close]');

    function openSchedulerModal() {
      if (!schedulerModalEl) return;
      schedulerModalEl.classList.add('is-open');
      loadTimers();
      if (timerStartSelect) CustomDropdown.sync(timerStartSelect);
      if (timerEndSelect) CustomDropdown.sync(timerEndSelect);
    }

    function closeSchedulerModal() {
      if (!schedulerModalEl) return;
      schedulerModalEl.classList.remove('is-open');
    }

    document.querySelectorAll('[data-open-scheduler-btn], [data-open-scheduler-row]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openSchedulerModal();
      });
    });

    schedulerCloseBtn?.addEventListener('click', closeSchedulerModal);
    schedulerModalEl?.addEventListener('click', (e) => {
      if (e.target === schedulerModalEl) closeSchedulerModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && schedulerModalEl?.classList.contains('is-open')) {
        closeSchedulerModal();
      }
    });

    // Initial load of timers
    loadTimers();

    // Stop / Pause bot
    stopBtn?.addEventListener('click', async () => {
      const link = await DataClient.getLinkAtual();
      if (!link?.link) {
        window.location.hash = '#historico';
        Toast.show({ type: 'info', title: 'Cadastre ou selecione um link para ativar o bot.' });
        return;
      }

      ConfirmModal.open({
        variant: 'warning',
        icon: ICON_PAUSE,
        title: 'Pausar o funcionamento do bot?',
        description: 'O monitoramento será pausado temporariamente. O robô ficará em espera até que um novo link seja ativado no Histórico.',
        confirmLabel: 'Confirmar e Pausar',
        cancelLabel: 'Cancelar',
        onConfirm: async () => {
          await DataClient.pararBot();
          updateStatusButton(false);
          loadLinks();
          if (typeof window.refreshDashboard === 'function') window.refreshDashboard({ silent: true });
          Toast.show({ type: 'success', title: 'Robô pausado com sucesso' });
        },
      });
    });

    // Restart data
    restartBtn?.addEventListener('click', () => {
      ConfirmModal.open({
        variant: 'danger',
        icon: ICON_DANGER,
        title: 'Reiniciar Dados',
        description: 'Esta ação apagará <strong>todos os produtos enviados e a fila de processamento</strong>. O link promocional atual e o histórico de URLs serão mantidos.',
        list: [
          'Todos os produtos enviados serão reiniciados.',
          'A fila de produtos em processamento será limpa.',
          'O link e histórico de URLs NÃO serão apagados.',
        ],
        confirmLabel: 'Confirmar Reinicialização',
        cancelLabel: 'Cancelar',
        requireTextConfirm: 'REINICIAR',
        onConfirm: async () => {
          await DataClient.reiniciarBot();
          if (typeof window.refreshDashboard === 'function') window.refreshDashboard({ silent: true });
          Toast.show({ type: 'success', title: 'Dados reiniciados com sucesso.' });
        },
      });
    });

    // ==================== MODAIS EXPLICATIVOS DAS CONFIGURAÇÕES ====================
    const INFO_MODALS_CONFIG = {
      agendador: {
        title: 'Disparos Automáticos Programados',
        subtitle: 'Envios automáticos diários com preparação e parada inteligente',
        description: 'Esta funcionalidade programa os horários do dia em que o robô inicia e finaliza os envios de ofertas.',
        points: [
          { title: 'Horário de Início', desc: 'O robô inicia o fluxo de disparo pontualmente no horário escolhido (no horário oficial de Brasília).' },
          { title: 'Pré-coleta Automática (30m antes)', desc: 'Exatamente 30 minutos antes do início, o sistema busca e prepara todos os produtos da fila.' },
          { title: 'Horário de Parada (Limpar Fila)', desc: 'No horário de parada definido, o sistema limpa a fila de produtos. Sem produtos pendentes, o robô encerra o envio e pausa automaticamente.' },
          { title: 'Reutilização em 1 Clique', desc: 'O disparo e a finalização ficam salvos juntos. Basta clicar no botão "Usar no Painel" em qualquer horário anterior para recarregar ou reaproveitar a configuração.' },
        ],
      },
      disparo: {
        title: 'Disparo Imediato de Ofertas',
        subtitle: 'Envio manual instantâneo sem aguardar o relógio',
        description: 'Ativa instantaneamente a rotina de envio de produtos para os canais de divulgação, sem precisar esperar o próximo horário da agenda.',
        points: [
          { title: 'Uso Prático', desc: 'Perfeito para promoções relâmpago, validação de funcionamento ou disparos extraordinários fora do cronograma diário.' },
          { title: 'Medição em Tempo Real', desc: 'Calcula e valida a latência da conexão em milissegundos para garantir respostas ultrarrápidas.' },
          { title: 'Sem Interferência', desc: 'O disparo imediato não cancela nem altera os horários programados da sua agenda diária regular.' },
        ],
      },
      pausar: {
        title: 'Pausar Operação do Robô',
        subtitle: 'Interrupção temporária e segura dos envios',
        description: 'Interrompe temporariamente todas as rotinas ativas de envio e coloca o monitoramento em modo de espera.',
        points: [
          { title: 'Modo de Espera', desc: 'Nenhum novo produto será extraído ou enviado para os canais enquanto o robô estiver em pausa.' },
          { title: 'Totalmente Reversível', desc: 'Para religar o robô a qualquer instante, basta acessar a aba Histórico de Links e ativar uma URL.' },
          { title: 'Preservação de Dados', desc: 'Seus dados históricos, relatórios de envio e horários programados continuam totalmente preservados e salvos.' },
        ],
      },
      limpar: {
        title: 'Limpeza da Fila de Envios',
        subtitle: 'Renovação e limpeza do catálogo de produtos',
        description: 'Zera permanentemente a fila de produtos já enviados e produtos pendentes, permitindo preparar uma lista de produtos totalmente nova.',
        points: [
          { title: 'Quando Utilizar', desc: 'Recomendado após encerramento de campanhas promocionais ou quando você deseja renovar o catálogo de ofertas do zero.' },
          { title: 'Links Preservados', desc: 'O link ativo de monitoramento e todo o seu histórico de links cadastrados continuam seguros e NÃO serão apagados.' },
          { title: 'Ação Protegida', desc: 'Exige digitação de palavra de confirmação para prevenir qualquer limpeza acidental.' },
        ],
      },
      sentinela: {
        title: 'Sentinela de Segurança (Anti-Travamento)',
        subtitle: 'Auto-recuperação inteligente em caso de inatividade',
        description: 'Mecanismo de proteção que monitora continuamente o envio de produtos. Caso existam itens na fila e passem mais de 10 minutos sem nenhum envio pelo robô, o sistema aciona automaticamente o Disparo Imediato.',
        points: [
          { title: 'Janela de Inatividade de 10 Minutos', desc: 'Monitora se o robô parou de despachar produtos por mais de 10 minutos com itens aguardando na fila.' },
          { title: 'Intervalo de 10 Minutos Entre Tentativas', desc: 'Após cada disparo de segurança, aguarda 10 minutos pela resposta do robô antes de tentar o próximo envio.' },
          { title: 'Limite Máximo de 5 Disparos', desc: 'Realiza até 5 tentativas automáticas de recuperação para garantir a segurança da sua infraestrutura.' },
          { title: 'Chave de Manutenção', desc: 'Pode ser ativada ou desativada a qualquer momento nas Configurações para pausas técnicas ou manutenções.' },
        ],
      },
    };

    // ==================== CONTROLE DA SENTINELA DE SEGURANÇA ====================
    const watchdogToggle = document.querySelector('[data-watchdog-toggle]');
    const watchdogStatusChip = document.querySelector('[data-watchdog-status-chip]');
    const watchdogToggleLabel = document.querySelector('[data-watchdog-toggle-label]');

    async function updateWatchdogUI() {
      if (!watchdogToggle) return;
      try {
        const res = await DataClient.getSegurancaStatus();
        if (!res?.ok) return;

        watchdogToggle.checked = res.enabled !== false;
        if (watchdogToggleLabel) {
          watchdogToggleLabel.textContent = res.enabled ? 'Ativado' : 'Desativado (Manutenção)';
          watchdogToggleLabel.style.color = res.enabled ? 'var(--text-primary)' : 'var(--text-muted)';
        }

        if (watchdogStatusChip) {
          if (!res.enabled) {
            watchdogStatusChip.textContent = 'Pausado (Manutenção)';
            watchdogStatusChip.style.color = 'var(--text-muted)';
            watchdogStatusChip.style.borderColor = 'var(--border-default)';
          } else if (res.status === 'retrying') {
            watchdogStatusChip.textContent = `Tentativa ${res.currentRetries}/${res.maxRetries} (Aguardando)`;
            watchdogStatusChip.style.color = 'var(--warning)';
            watchdogStatusChip.style.borderColor = 'var(--warning-border)';
          } else if (res.status === 'limit_reached') {
            watchdogStatusChip.textContent = `Limite 5/5 atingido`;
            watchdogStatusChip.style.color = 'var(--danger)';
            watchdogStatusChip.style.borderColor = 'var(--danger-border)';
          } else {
            watchdogStatusChip.textContent = 'Monitorando (10 min)';
            watchdogStatusChip.style.color = 'var(--success)';
            watchdogStatusChip.style.borderColor = 'var(--success-border)';
          }
        }
      } catch (err) {
        console.warn('Erro ao atualizar status da sentinela:', err.message);
      }
    }

    watchdogToggle?.addEventListener('change', async () => {
      const isEnabled = watchdogToggle.checked;
      watchdogToggle.disabled = true;

      try {
        const res = await DataClient.setSegurancaConfig({ enabled: isEnabled });
        if (res?.ok) {
          Toast.show({
            type: isEnabled ? 'success' : 'warning',
            title: isEnabled ? 'Sentinela de Segurança Ativada!' : 'Sentinela Desativada (Manutenção)',
            desc: isEnabled
              ? 'Se o robô passar mais de 10 min sem enviar produtos, acionará o disparo de segurança a cada 10 min (até 5x).'
              : 'Disparo de segurança temporariamente desativado para você realizar manutenções.',
          });
        }
      } catch (err) {
        Toast.show({ type: 'error', title: 'Erro ao alterar configuração', desc: err.message });
        watchdogToggle.checked = !isEnabled;
      } finally {
        watchdogToggle.disabled = false;
        updateWatchdogUI();
      }
    });

    updateWatchdogUI();
    setInterval(updateWatchdogUI, 15000);

    document.querySelectorAll('[data-info-trigger]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = btn.getAttribute('data-info-trigger');
        const config = INFO_MODALS_CONFIG[key];
        if (config) SettingsInfoModal.open(config);
      });
    });

    // Search filter in history view
    fullSearchInput?.addEventListener('input', async (e) => {
      const term = e.target.value.trim().toLowerCase();
      const [all, activeLink] = await Promise.all([
        DataClient.getHistoricoLinks(),
        DataClient.getLinkAtual(),
      ]);
      const filtered = all.filter((item) => {
        const text = `${item.link} ${item.tag || ''} ${item.marketplace?.name || ''}`.toLowerCase();
        return text.includes(term);
      });
      const fullListEl = document.querySelector('[data-historico-completo-list]');
      if (fullListEl) renderHistoryList(fullListEl, filtered, activeLink?.link || '');
    });

    if (authSession?.access_token) {
      loadLinks();
      DataClient.getLinkAtual().then((link) => updateStatusButton(!!link?.link));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();

/* --------------------------------------------------------------------------
 * Controle de Produtos Aguardando Disparo
 * ------------------------------------------------------------------------ */
(function () {
  let searchTerm = '';
  let selectedMarketplace = 'todos';
  let debounceTimer = null;

  const searchInput = document.querySelector('[data-produtos-search]');
  const mpFilter = document.querySelector('[data-produtos-marketplace-filter]');
  const gridEl = document.querySelector('[data-produtos-grid]');
  const skelEl = document.querySelector('[data-produtos-skel]');
  const emptyEl = document.querySelector('[data-produtos-empty]');
  const totalBadgeEl = document.querySelector('[data-produtos-total-badge]');
  const refreshBtn = document.querySelector('[data-refresh-produtos]');
  const clearBtn = document.querySelector('[data-clear-produtos]');

  function setSkeletons(on) {
    if (skelEl) skelEl.style.display = on ? 'grid' : 'none';
    if (gridEl) gridEl.style.display = on ? 'none' : 'grid';
  }

  function calculateDiscount(origStr, promoStr) {
    if (!origStr || !promoStr) return null;
    const orig = Number.parseFloat(origStr.replace(/[^\d.,]/g, '').replace(',', '.'));
    const promo = Number.parseFloat(promoStr.replace(/[^\d.,]/g, '').replace(',', '.'));
    if (!orig || !promo || orig <= promo) return null;
    const pct = Math.round(((orig - promo) / orig) * 100);
    return pct > 0 ? `-${pct}% OFF` : null;
  }

  function isFreteGratis(formaEntrega = '') {
    const text = (formaEntrega || '').toLowerCase();
    return text.includes('grátis') || text.includes('gratis') || text.includes('free');
  }

  function renderGrid(items) {
    if (!gridEl) return;
    if (!items || items.length === 0) {
      gridEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      if (totalBadgeEl) totalBadgeEl.textContent = '0 produtos';
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    if (totalBadgeEl) totalBadgeEl.textContent = `${items.length} ${items.length === 1 ? 'produto' : 'produtos'}`;

    gridEl.innerHTML = items
      .map((item) => {
        const url = item.url_produto || '';
        const name = item.nome_produto || Utils.hostFromUrl(url);
        const mp = item.marketplace || Utils.detectMarketplace(url, name);
        const img = item.url_imagem;
        const origPrice = item.valor_original;
        const promoPrice = item.valor_promocional || origPrice || 'Consulte o link';
        const discountTag = origPrice && origPrice !== promoPrice ? calculateDiscount(origPrice, promoPrice) : null;
        const freteGratis = isFreteGratis(item.forma_entrega);
        const catBadge = item.nome_categoria
          ? `<span class="product-card__badge-cat" title="Categoria #${item.id_categoria}">🏷️ ${Utils.escapeHtml(item.nome_categoria)}</span>`
          : (item.id_categoria ? `<span class="product-card__badge-cat" title="Categoria #${item.id_categoria}">🏷️ Cat #${item.id_categoria}</span>` : '');
        const imgHtml = img
          ? `<img src="${Utils.escapeHtml(img)}" alt="${Utils.escapeHtml(name)}" class="product-card__img" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'product-card__img-fallback\\'><svg width=\\'32\\' height=\\'32\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.5\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\'/><circle cx=\\'8.5\\' cy=\\'8.5\\' r=\\'1.5\\'/><path d=\\'m21 15-5-5L5 21\\'/></svg><span>Sem imagem</span></div>'">`
          : `<div class="product-card__img-fallback"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.91 8.84 8.56 21.19a2 2 0 0 1-2.83 0l-3.92-3.92a2 2 0 0 1 0-2.83L14.16 2.09a2 2 0 0 1 1.42-.59H21a1 1 0 0 1 1 1v5.42a2 2 0 0 1-.59 1.42Z"/><path d="M17.5 8.5h.01"/></svg><span>Produto sem foto</span></div>`;

        return `
        <article class="product-card" data-product-id="${Utils.escapeHtml(String(item.id))}">
          <div class="product-card__thumb-wrap">
            <div class="product-card__badges-top">
              <span class="badge-mp ${mp.badgeClass}">${mp.tag}</span>
              ${catBadge}
              ${freteGratis ? `
                <span class="product-card__badge-frete">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="1" y="3" width="15" height="13" rx="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                  Frete Grátis
                </span>
              ` : ''}
            </div>
            ${imgHtml}
          </div>

          <div class="product-card__body">
            <h3 class="product-card__title" title="${Utils.escapeHtml(name)}">${Utils.escapeHtml(name)}</h3>
            
            <div class="product-card__price-box">
              <span class="product-card__price-promo">${Utils.escapeHtml(promoPrice)}</span>
              ${origPrice && origPrice !== promoPrice ? `<span class="product-card__price-orig">${Utils.escapeHtml(origPrice)}</span>` : ''}
              ${discountTag ? `<span class="product-card__discount-tag">${discountTag}</span>` : ''}
            </div>

            <div class="product-card__delivery">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13" rx="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
              <span>${Utils.escapeHtml(item.forma_entrega || 'Entrega padrão')}</span>
            </div>
          </div>

          <div class="product-card__footer">
            <button class="product-card__delete-btn" data-delete-product="${Utils.escapeHtml(String(item.id))}" type="button" title="Apagar da fila">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Apagar
            </button>
            <div style="display:flex; align-items:center; gap:6px;">
              ${url ? `
                <button class="btn-action-icon" data-copy-url="${Utils.escapeHtml(url)}" title="Copiar link" aria-label="Copiar link">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <a class="btn-action-icon" href="${Utils.escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="Abrir produto" aria-label="Abrir produto">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/></svg>
                </a>
              ` : ''}
            </div>
          </div>
        </article>
        `;
      })
      .join('');

    // Attach Action Listeners
    gridEl.querySelectorAll('[data-delete-product]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-delete-product');
        const card = btn.closest('.product-card');
        btn.disabled = true;
        btn.textContent = 'Apagando…';
        try {
          await DataClient.deleteProdutoGeral(id);
          card?.remove();
          Toast.show({ type: 'success', title: 'Produto removido', desc: 'O produto foi excluído da fila de envio.' });
          
          // Update counts
          const remaining = gridEl.querySelectorAll('.product-card').length;
          if (totalBadgeEl) totalBadgeEl.textContent = `${remaining} ${remaining === 1 ? 'produto' : 'produtos'}`;
          const sideBadge = document.querySelector('[data-badge-produtos-count]');
          if (sideBadge) sideBadge.textContent = Utils.formatNumber(remaining);
          if (remaining === 0 && emptyEl) emptyEl.hidden = false;
        } catch (err) {
          Toast.show({ type: 'error', title: 'Erro ao apagar', desc: err.message });
          btn.disabled = false;
          btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Apagar`;
        }
      });
    });

    gridEl.querySelectorAll('[data-copy-url]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const url = btn.getAttribute('data-copy-url');
        await navigator.clipboard.writeText(url);
        Toast.show({ type: 'success', title: 'Link copiado!' });
      });
    });
  }

  async function carregarProdutosGeral() {
    setSkeletons(true);
    try {
      const items = await DataClient.getProdutosGeral({
        search: searchTerm,
        marketplace: selectedMarketplace,
      });
      renderGrid(items);
      const sideBadge = document.querySelector('[data-badge-produtos-count]');
      if (sideBadge) sideBadge.textContent = Utils.formatNumber(items.length);
    } catch (err) {
      console.error('Erro ao carregar produtos geral:', err);
      Toast.show({ type: 'error', title: 'Erro ao carregar produtos', desc: err.message });
    } finally {
      setSkeletons(false);
    }
  }

  window.carregarProdutosGeral = carregarProdutosGeral;

  document.addEventListener('DOMContentLoaded', () => {
    searchInput?.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        searchTerm = e.target.value.trim();
        carregarProdutosGeral();
      }, 250);
    });

    mpFilter?.addEventListener('change', (e) => {
      selectedMarketplace = e.target.value;
      carregarProdutosGeral();
    });

    refreshBtn?.addEventListener('click', () => {
      carregarProdutosGeral();
      carregarCategoriasProdutos();
      Toast.show({ type: 'info', title: 'Fila e categorias atualizadas' });
    });

    clearBtn?.addEventListener('click', () => {
      ConfirmModal.open({
        title: 'Limpar todos os produtos da fila?',
        desc: 'Esta ação apagará todos os produtos aguardando disparo na fila de processamento.',
        confirmLabel: 'Sim, limpar fila',
        variant: 'danger',
        onConfirm: async () => {
          await DataClient.clearProdutosGeral();
          Toast.show({ type: 'success', title: 'Fila limpa com sucesso!' });
          carregarProdutosGeral();
        },
      });
    });

    document.querySelectorAll('[data-trigger-produtos-webhook]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `
          <svg style="animation: spin 1s linear infinite;" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
          Disparando Coleta...
        `;
        try {
          const res = await DataClient.dispararProdutosWebhook();
          if (res?.ok) {
            Toast.show({
              type: 'success',
              title: 'Coleta de Produtos Iniciada!',
              desc: `Status: ${res.status} · Latência: ${res.latencyMs}ms. ${res.response || 'Extração de produtos acionada com sucesso.'}`,
            });
            setTimeout(() => {
              if (typeof carregarProdutosGeral === 'function') carregarProdutosGeral();
            }, 1800);
          } else if (res?.status === 404) {
            Toast.show({
              type: 'warning',
              title: 'Serviço em preparação (404)',
              desc: res.hint || 'Serviço de coleta em inicialização. Tente novamente em instantes.',
            });
          } else {
            Toast.show({
              type: 'error',
              title: `Falha na Coleta de Produtos (${res?.status || 'Erro'})`,
              desc: `${res?.response || res?.hint || 'Não foi possível conectar ao serviço de coleta.'}`,
            });
          }
        } catch (err) {
          Toast.show({ type: 'error', title: 'Erro ao disparar coleta de produtos', desc: err.message });
        } finally {
          btn.innerHTML = originalHtml;
          btn.disabled = false;
        }
      });
    });

    /* =========================================================================
     * GESTÃO DE CATEGORIAS DE OFERTAS & MODAL RESPONSIVO (COM ESCOLHA DE QUANTIDADE)
     * ========================================================================= */
    let availableCategories = [];
    const selectedCategoryIds = new Set();
    const categoryQuantities = {}; // { [catId]: number }
    let activeCategories = [];

    const categoryModalEl = document.querySelector('[data-category-modal]');
    const categoryCloseBtns = document.querySelectorAll('[data-category-close]');
    const activeChipsContainer = document.querySelector('[data-active-categories-chips]');
    const activeCountEl = document.querySelector('[data-active-categories-count]');
    const totalAvailableCatsEl = document.querySelector('[data-total-available-categories]');
    const categoryChipsContainer = document.querySelector('[data-category-chips-container]');
    const selectAllCatsBtn = document.querySelector('[data-select-all-cats]');
    const clearAllCatsBtn = document.querySelector('[data-clear-all-cats]');
    const replaceQueueCheckbox = document.querySelector('[data-replace-queue-checkbox]');
    const applyCategoriesBtn = document.querySelector('[data-apply-categories-btn]');
    const categoryFeedbackEl = document.querySelector('[data-category-feedback]');
    const categorySummaryLiveEl = document.querySelector('[data-category-summary-count]');
    const presetButtons = document.querySelectorAll('[data-preset-qty]');

// Categorias ativas carregadas com sucesso

    function getCategoryQty(catId) {
      const idStr = String(catId);
      const val = Number(categoryQuantities[idStr]);
      if (Number.isFinite(val) && val > 0) {
        return val;
      }
      // Buscar em activeCategories caso exista lá
      const activeCat = activeCategories.find((c) => String(c.id) === idStr);
      if (activeCat) {
        const q = Number(activeCat.quantidade || activeCat.quantidade_produtos);
        if (Number.isFinite(q) && q > 0) {
          categoryQuantities[idStr] = q;
          return q;
        }
      }
      return 5; // padrão 5 produtos por categoria
    }

    function openCategoryModal() {
      if (!categoryModalEl) return;
      categoryModalEl.classList.add('is-open');
      carregarCategoriasProdutos();
    }

    function closeCategoryModal() {
      if (!categoryModalEl) return;
      categoryModalEl.classList.remove('is-open');
    }

    categoryCloseBtns.forEach((btn) => {
      btn.addEventListener('click', closeCategoryModal);
    });

    categoryModalEl?.addEventListener('click', (e) => {
      if (e.target === categoryModalEl) {
        closeCategoryModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && categoryModalEl?.classList.contains('is-open')) {
        closeCategoryModal();
      }
    });

    document.querySelectorAll('[data-open-category-modal]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openCategoryModal();
      });
    });

    function renderActiveCategories(cats) {
      if (!activeChipsContainer) return;
      if (Array.isArray(cats) && cats.length > 0) {
        activeChipsContainer.innerHTML = cats
          .map((c) => {
            const name = c.nome_categoria || 'Categoria';
            const qty = c.quantidade || categoryQuantities[String(c.id)] || null;
            const qtyLabel = qty ? `<span class="active-cat-pill__count">(${qty} un.)</span>` : '';
            return `
              <div class="active-cat-pill" data-cat-id="${c.id}">
                <span class="active-cat-pill__dot"></span>
                <span>🏷️ ${Utils.escapeHtml(name)}</span>
                ${qtyLabel}
                <button type="button" class="active-cat-pill__remove-btn" data-remove-cat-btn="${c.id}" title="Remover ${Utils.escapeHtml(name)} das categorias salvas" aria-label="Remover categoria">&times;</button>
              </div>
            `;
          })
          .join('');
        if (activeCountEl) {
          activeCountEl.textContent = `${cats.length} ${cats.length === 1 ? 'categoria ativa salva' : 'categorias ativas salvas'}`;
        }
      } else {
        activeChipsContainer.innerHTML = `
          <span class="active-category-empty">
            Nenhuma categoria salva no momento. Clique em &quot;Selecionar Categorias&quot; para escolher as categorias que abastecerão o bot automaticamente todos os dias.
          </span>
        `;
        if (activeCountEl) activeCountEl.textContent = '0 selecionadas';
      }
    }

    function updateLiveSummary() {
      const selectedCount = selectedCategoryIds.size;
      let totalProducts = 0;

      selectedCategoryIds.forEach((idNum) => {
        const cat = availableCategories.find((c) => Number(c.id) === idNum);
        const available = typeof cat?.total_produtos === 'number' ? cat.total_produtos : 999;
        const chosen = getCategoryQty(idNum);
        const effective = available > 0 ? Math.min(chosen, available) : chosen;
        totalProducts += effective;
      });

      if (categorySummaryLiveEl) {
        categorySummaryLiveEl.textContent = `${totalProducts} produto(s) selecionado(s) em ${selectedCount} ${selectedCount === 1 ? 'categoria' : 'categorias'}`;
      }

      if (applyCategoriesBtn) {
        const labelSpan = applyCategoriesBtn.querySelector('span');
        if (labelSpan) {
          labelSpan.textContent = selectedCount > 0
            ? `Aplicar (${totalProducts} produtos em ${selectedCount} ${selectedCount === 1 ? 'categoria' : 'categorias'}) e Atualizar Fila`
            : 'Aplicar e Atualizar Fila';
        }
      }
    }

    function renderCategorySelector() {
      if (!categoryChipsContainer) return;

      if (!availableCategories || availableCategories.length === 0) {
        categoryChipsContainer.innerHTML = `
          <div style="grid-column: 1 / -1; padding: 20px; color: var(--text-secondary); font-size: 13px; text-align: center;">
            Nenhuma categoria disponível no momento.
          </div>
        `;
        updateLiveSummary();
        return;
      }

      categoryChipsContainer.innerHTML = availableCategories
        .map((cat) => {
          const idNum = Number(cat.id);
          const isSelected = selectedCategoryIds.has(idNum);
          const count = typeof cat.total_produtos === 'number' ? cat.total_produtos : 0;
          const currentQty = getCategoryQty(idNum);
          const isAll = count > 0 && currentQty >= count;

          return `
            <div class="category-chip ${isSelected ? 'is-selected' : ''}" data-cat-id="${cat.id}">
              <div class="category-chip__main">
                <input type="checkbox" class="category-chip__input" ${isSelected ? 'checked' : ''} aria-label="Selecionar categoria ${Utils.escapeHtml(cat.nome_categoria)}">
                <div class="category-chip__content">
                  <div class="category-chip__name" title="${Utils.escapeHtml(cat.nome_categoria)}">
                    ${Utils.escapeHtml(cat.nome_categoria)}
                  </div>
                  <div class="category-chip__meta">
                    <span class="category-chip__count">${count} produto(s) disponíveis</span>
                  </div>
                </div>
              </div>
              <div class="category-qty-control" onclick="event.stopPropagation();">
                <span class="category-qty-sublabel">Qtd:</span>
                <div class="category-stepper">
                  <button type="button" class="category-stepper__btn" data-stepper-dec title="Diminuir quantidade">−</button>
                  <input type="number" class="category-stepper__input" min="1" max="${count > 0 ? count : 999}" value="${currentQty}" data-stepper-input aria-label="Quantidade de produtos para ${Utils.escapeHtml(cat.nome_categoria)}">
                  <button type="button" class="category-stepper__btn" data-stepper-inc title="Aumentar quantidade">+</button>
                </div>
                <button type="button" class="category-stepper__all-btn ${isAll ? 'is-active' : ''}" data-stepper-all title="Selecionar todos os produtos desta categoria (${count})">Todos</button>
              </div>
            </div>
          `;
        })
        .join('');

      // Adicionar listeners para cada chip
      categoryChipsContainer.querySelectorAll('.category-chip').forEach((chip) => {
        const idNum = Number(chip.getAttribute('data-cat-id'));
        const cat = availableCategories.find((c) => Number(c.id) === idNum);
        const maxAvailable = typeof cat?.total_produtos === 'number' && cat.total_produtos > 0 ? cat.total_produtos : 999;

        const chk = chip.querySelector('.category-chip__input');
        const qtyInput = chip.querySelector('[data-stepper-input]');
        const btnDec = chip.querySelector('[data-stepper-dec]');
        const btnInc = chip.querySelector('[data-stepper-inc]');
        const btnAll = chip.querySelector('[data-stepper-all]');

        function ensureSelected() {
          if (!selectedCategoryIds.has(idNum)) {
            selectedCategoryIds.add(idNum);
            chip.classList.add('is-selected');
            if (chk) chk.checked = true;
          }
        }

        // Toggle ao clicar no card ou checkbox
        chip.addEventListener('click', (e) => {
          if (e.target.closest('.category-qty-control')) return;

          if (selectedCategoryIds.has(idNum)) {
            selectedCategoryIds.delete(idNum);
            chip.classList.remove('is-selected');
            if (chk) chk.checked = false;
          } else {
            selectedCategoryIds.add(idNum);
            chip.classList.add('is-selected');
            if (chk) chk.checked = true;
          }
          updateLiveSummary();
        });

        // Botão diminuir (-)
        btnDec?.addEventListener('click', (e) => {
          e.stopPropagation();
          ensureSelected();
          let cur = Number(qtyInput.value) || 1;
          cur = Math.max(1, cur - 1);
          qtyInput.value = cur;
          categoryQuantities[String(idNum)] = cur;
          if (btnAll) btnAll.classList.toggle('is-active', cur >= maxAvailable);
          updateLiveSummary();
        });

        // Botão aumentar (+)
        btnInc?.addEventListener('click', (e) => {
          e.stopPropagation();
          ensureSelected();
          let cur = Number(qtyInput.value) || 1;
          cur = Math.min(maxAvailable, cur + 1);
          qtyInput.value = cur;
          categoryQuantities[String(idNum)] = cur;
          if (btnAll) btnAll.classList.toggle('is-active', cur >= maxAvailable);
          updateLiveSummary();
        });

        // Digitação direta no input
        qtyInput?.addEventListener('input', (e) => {
          e.stopPropagation();
          ensureSelected();
          let cur = Number(qtyInput.value);
          if (!Number.isFinite(cur) || cur < 1) cur = 1;
          if (cur > maxAvailable) cur = maxAvailable;
          categoryQuantities[String(idNum)] = cur;
          if (btnAll) btnAll.classList.toggle('is-active', cur >= maxAvailable);
          updateLiveSummary();
        });

        // Botão "Todos"
        btnAll?.addEventListener('click', (e) => {
          e.stopPropagation();
          ensureSelected();
          const targetQty = maxAvailable > 0 ? maxAvailable : 20;
          qtyInput.value = targetQty;
          categoryQuantities[String(idNum)] = targetQty;
          btnAll.classList.add('is-active');
          updateLiveSummary();
        });
      });

      updateLiveSummary();
    }

    // Botões de Presets Rápidos de Quantidade (2, 5, 10, 20, Todos)
    presetButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        presetButtons.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const preset = btn.getAttribute('data-preset-qty');

        // Se nenhuma categoria estiver selecionada, marca todas para facilitar
        if (selectedCategoryIds.size === 0) {
          availableCategories.forEach((c) => selectedCategoryIds.add(Number(c.id)));
        }

        selectedCategoryIds.forEach((idNum) => {
          const cat = availableCategories.find((c) => Number(c.id) === idNum);
          const maxAvailable = typeof cat?.total_produtos === 'number' && cat.total_produtos > 0 ? cat.total_produtos : 999;

          let targetVal = 5;
          if (preset === 'all') {
            targetVal = maxAvailable;
          } else {
            const num = Number(preset);
            targetVal = Math.min(maxAvailable, Number.isFinite(num) && num > 0 ? num : 5);
          }
          categoryQuantities[String(idNum)] = targetVal;
        });

        renderCategorySelector();
      });
    });

    async function carregarCategoriasProdutos() {
      try {
        const [cats, activeRes] = await Promise.all([
          DataClient.getCategorias().catch(() => []),
          DataClient.getCategoriasAtivas().catch(() => ({ activeIds: [], activeCategories: [], quantidades: {} })),
        ]);

        availableCategories = Array.isArray(cats) ? cats : [];

        if (totalAvailableCatsEl) {
          totalAvailableCatsEl.textContent = `${availableCategories.length} ${availableCategories.length === 1 ? 'disponível' : 'disponíveis'}`;
        }

        // Restaurar quantidades ativas do backend se disponíveis
        if (activeRes?.quantidades && typeof activeRes.quantidades === 'object') {
          Object.assign(categoryQuantities, activeRes.quantidades);
        }

        // Restaurar categorias ativas
        let initialActive = Array.isArray(activeRes?.activeCategories) ? activeRes.activeCategories : [];
        if (initialActive.length === 0 && Array.isArray(activeRes?.activeIds) && activeRes.activeIds.length > 0) {
          const ids = activeRes.activeIds.map((n) => Number(n));
          initialActive = availableCategories.filter((c) => ids.includes(Number(c.id)));
        }

        activeCategories = initialActive;
        renderActiveCategories(activeCategories);

        if (selectedCategoryIds.size === 0 && activeCategories.length > 0) {
          activeCategories.forEach((c) => selectedCategoryIds.add(Number(c.id)));
        }

        renderCategorySelector();
      } catch (err) {
        console.warn('Erro ao carregar categorias:', err);
      }
    }

    window.carregarCategoriasProdutos = carregarCategoriasProdutos;

    async function aplicarCategoriasEscolhidas() {
      if (selectedCategoryIds.size === 0) {
        Toast.show({
          type: 'warning',
          title: 'Nenhuma categoria selecionada',
          desc: 'Selecione pelo menos uma categoria para atualizar a fila.',
        });
        return;
      }

      if (!applyCategoriesBtn) return;
      applyCategoriesBtn.disabled = true;
      const originalHtml = applyCategoriesBtn.innerHTML;
      applyCategoriesBtn.innerHTML = `
        <svg style="animation: spin 1s linear infinite;" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
        <span>Atualizando fila de disparo...</span>
      `;

      const idsToApply = Array.from(selectedCategoryIds);
      const substituir = replaceQueueCheckbox ? replaceQueueCheckbox.checked : true;

      // Montar mapa de quantidades exatas escolhidas para cada categoria selecionada
      const quantidadesToApply = {};
      idsToApply.forEach((id) => {
        const qty = getCategoryQty(id);
        quantidadesToApply[String(id)] = qty;
        categoryQuantities[String(id)] = qty; // Persistir no estado global
      });

      try {
        const res = await DataClient.aplicarCategorias({
          categoria_ids: idsToApply,
          quantidades: quantidadesToApply,
          substituir,
        });

        if (res?.ok) {
          // Garantir que activeCategories receba as quantidades exatas salvas
          const updatedActive = Array.isArray(res.categorias) && res.categorias.length > 0
            ? res.categorias
            : availableCategories.filter((c) => idsToApply.includes(Number(c.id)));

          activeCategories = updatedActive.map((c) => {
            const cidStr = String(c.id);
            const savedQty = Number(quantidadesToApply[cidStr]) || Number(c.quantidade) || 5;
            categoryQuantities[cidStr] = savedQty;
            return {
              ...c,
              quantidade: savedQty,
              quantidade_produtos: savedQty,
            };
          });

          renderActiveCategories(activeCategories);



          if (categoryFeedbackEl) {
            categoryFeedbackEl.hidden = false;
            categoryFeedbackEl.className = 'category-feedback-msg category-feedback-msg--success';
            categoryFeedbackEl.textContent = res.message;
          }

          Toast.show({
            type: 'success',
            title: 'Fila Atualizada!',
            desc: res.message,
          });

          // Atualizar produtos
          await carregarProdutosGeral();

          // Fechar modal suavemente
          setTimeout(() => {
            closeCategoryModal();
            if (categoryFeedbackEl) categoryFeedbackEl.hidden = true;
          }, 900);
        } else {
          throw new Error(res?.error || 'Não foi possível aplicar as categorias.');
        }
      } catch (err) {
        if (categoryFeedbackEl) {
          categoryFeedbackEl.hidden = false;
          categoryFeedbackEl.className = 'category-feedback-msg category-feedback-msg--error';
          categoryFeedbackEl.textContent = 'Não foi possível aplicar as categorias no momento. Por favor, tente novamente mais tarde.';
        }
        Toast.show({
          type: 'error',
          title: 'Não foi possível',
          desc: 'Não foi possível realizar esta ação no momento. Por favor, tente novamente mais tarde.',
        });
      } finally {
        applyCategoriesBtn.disabled = false;
        applyCategoriesBtn.innerHTML = originalHtml;
        updateLiveSummary();
      }
    }

    selectAllCatsBtn?.addEventListener('click', () => {
      availableCategories.forEach((c) => selectedCategoryIds.add(Number(c.id)));
      renderCategorySelector();
    });

    clearAllCatsBtn?.addEventListener('click', () => {
      selectedCategoryIds.clear();
      renderCategorySelector();
    });

    applyCategoriesBtn?.addEventListener('click', aplicarCategoriasEscolhidas);

    // Carregar categorias inicialmente
    carregarCategoriasProdutos();

    // Initialize all custom dropdowns on the page
    CustomDropdown.initAll();
  });
})();

// Start Authentication
initAuth();
