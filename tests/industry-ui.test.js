import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ preferences: vi.fn(), savePreferences: vi.fn() }));
vi.mock('../public/js/api.js', () => ({ api }));
vi.mock('../public/js/ui.js', () => ({
  $: (selector) => document.querySelector(selector),
  $$: () => [],
  confirmDialog: vi.fn(), deadlineLabel: vi.fn(), display: vi.fn(), formatDate: vi.fn(), toast: vi.fn(),
  escapeHtml: (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]),
}));

describe('custom industry preferences', () => {
  let elements;
  let handlers;

  beforeEach(() => {
    vi.resetModules();
    api.preferences.mockReset();
    api.savePreferences.mockReset();
    elements = new Map();
    handlers = new Map();
    vi.stubGlobal('document', {
      querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector, {
          value: '', innerHTML: '', textContent: '', hidden: false,
          addEventListener(type, handler) { handlers.set(`${selector}:${type}`, handler); },
          removeAttribute: vi.fn(),
          classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
        });
        return elements.get(selector);
      },
    });
    const location = { hash: '' };
    vi.stubGlobal('location', location);
    vi.stubGlobal('window', { addEventListener: (type, handler) => handlers.set(`window:${type}`, handler), location });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('adds, saves, reloads and removes a custom industry without duplicating predefined choices', async () => {
    const preferences = { industries: ['금속 제조업'], companies: [], roles: [], locations: [], career_level: '신입' };
    api.preferences.mockResolvedValue(preferences);
    api.savePreferences.mockImplementation(async (value) => structuredClone(value));
    vi.stubGlobal('CSS', { escape: (value) => value });
    window.location.hash = '#preferences';
    await import('../public/js/app.js');
    await Promise.resolve();
    handlers.get('window:hashchange')();
    await vi.waitFor(() => expect(api.preferences).toHaveBeenCalled());
    document.querySelector('#custom-industry').value = '  친환경 에너지  ';
    handlers.get('#add-industry:click')();
    elements.get('#custom-industry').value = '친환경 에너지';
    handlers.get('#add-industry:click')();
    expect(elements.get('#industry-chips').innerHTML).toContain('친환경 에너지');
    expect(elements.get('#industry-chips').innerHTML).toContain('data-remove="industries"');
    expect(elements.get('#industry-chips').innerHTML).not.toContain('금속 제조업');

    await handlers.get('#preferences-form:submit')({ preventDefault() {} });
    expect(api.savePreferences).toHaveBeenCalledWith(expect.objectContaining({ industries: ['금속 제조업', '친환경 에너지'] }));

    api.preferences.mockResolvedValue(structuredClone(api.savePreferences.mock.calls[0][0]));
    elements.get('#industry-chips').innerHTML = '';
    handlers.get('window:hashchange')();
    await vi.waitFor(() => expect(elements.get('#industry-chips').innerHTML).toContain('친환경 에너지'));
    const removeButton = { dataset: { remove: 'industries', value: '친환경 에너지' } };
    handlers.get('#industry-chips:click')({ target: { closest: () => removeButton } });
    expect(elements.get('#industry-chips').innerHTML).not.toContain('친환경 에너지');
    await handlers.get('#preferences-form:submit')({ preventDefault() {} });
    expect(api.savePreferences).toHaveBeenLastCalledWith(expect.objectContaining({ industries: ['금속 제조업'] }));
  });

  it('defines the custom industry container in the application HTML', () => {
    const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
    expect(html).toContain('id="industry-chips"');
  });
});