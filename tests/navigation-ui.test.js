import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('navigation initialization', () => {
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