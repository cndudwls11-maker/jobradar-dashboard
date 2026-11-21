import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('navigation initialization', () => {
  it('removes the board industry filter while retaining industry preferences', () => {
    const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
    const app = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
    expect(html).not.toContain('id="filter-industry"');
    expect(app).not.toContain('filter-industry');
    expect(html).toContain('id="industry-options"');
    expect(html).toContain('id="filter-site"');
    expect(html).toContain('id="filter-career"');
  });
  it('removes manual registration and collection controls from the job board', () => {
    const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
    const app = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
    expect(html).not.toContain('id="manual-job-button"');
    expect(html).not.toContain('id="collect-button"');
    expect(html).not.toContain('id="manual-job-dialog"');
    expect(app).not.toMatch(/manual-job|collect-button|runCollection/);
  });
  it('binds events only to IDs present in the application HTML', () => {
    const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
    const app = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
    const bindings = [...app.matchAll(/\$\('#([^']+)'\)\.addEventListener\(/g)].map((match) => match[1]);

    expect(bindings.length).toBeGreaterThan(0);
    expect(bindings.filter((id) => !ids.has(id))).toEqual([]);
  });

  it('keeps hidden panels hidden even when their classes set display', () => {
    const css = readFileSync(new URL('../public/css/style.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*;?\s*\}/);
  });

  it('retains read and favorite filtering without separate navigation items', () => {
    const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
    const app = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');

    expect(html).toContain('data-route="all"');
    expect(html).not.toMatch(/data-route="(?:unread|favorites)"/);
    expect(html).toContain('id="filter-read"');
    expect(html).toContain('id="filter-favorite"');
    expect(app).toContain("read: $('#filter-read').value");
    expect(app).toContain("favorite: $('#filter-favorite').value");
  });
});