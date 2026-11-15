import { api } from './api.js';
import { $, $$, confirmDialog, deadlineLabel, display, escapeHtml, formatDate, toast } from './ui.js';
import { ALL_LOCATIONS, togglePreferredLocation } from './preferences.js';

const state = { route: 'all', page: 1, deletedPage: 1, totalPages: 1, deletedPages: 1, jobs: [], deleted: [], selected: new Set(), deletedSelected: new Set(), mode: 'all', preferences: { industries: [], companies: [], roles: [], locations: [], career_level: '신입' }, searchTimer: null, loading: false, requestId: 0 };
const INDUSTRIES = ['금속 제조업','철강 제조업','비철금속 제조업','반도체 제조업','자동차 부품 제조업'];
const ROLES = ['품질관리(QC)','품질보증(QA)','생산관리','생산기술','공정관리'];
const LOCATIONS = ['서울','경기','인천','충청남도','충청북도','대전','세종','강원','부산','울산','대구','경상남도','경상북도','광주','전라남도','전라북도','제주'];
const TITLES = { all: '전체 채용공고', unread: '미확인 공고', favorites: '즐겨찾기', preferences: '맞춤 채용 조건', deleted: '삭제된 공고 관리' };

async function initialize() {
  bindEvents();
  try {
    await api.session();
    $('#login-screen').hidden = true;
    await enterRoute();
  } catch {
    $('#login-screen').hidden = false;
  }
}

function bindEvents() {
  $('#login-form').addEventListener('submit', onLogin);
  $('#logout-button').addEventListener('click', logout);
  $('#menu-toggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  window.addEventListener('hashchange', enterRoute);
  $('#collect-button').addEventListener('click', runCollection);
  $('#manual-job-button').addEventListener('click', openManualJobDialog);
  $('#manual-job-form').addEventListener('submit', saveManualJob);
  $('#manual-job-cancel').addEventListener('click', () => $('#manual-job-dialog').close());
  $('#manual-job-close').addEventListener('click', () => $('#manual-job-dialog').close());
  $('#retry-load').addEventListener('click', loadJobs);
  $('#search-input').addEventListener('input', () => { clearTimeout(state.searchTimer); state.searchTimer = setTimeout(() => { state.page = 1; loadJobs(); }, 300); });
  $('#search-input').addEventListener('keydown', (event) => { if (event.key === 'Enter') { clearTimeout(state.searchTimer); state.page = 1; loadJobs(); } });
  $('#sort-select').addEventListener('change', () => { state.page = 1; loadJobs(); });
  $('#filter-toggle').addEventListener('click', () => { const panel = $('#filters-panel'); panel.hidden = !panel.hidden; });
  for (const id of ['filter-site','filter-industry','filter-career','filter-location','filter-deadline','filter-read','filter-favorite','include-expired']) {
    const input = $(`#${id}`);
    input.addEventListener(input.tagName === 'INPUT' && input.type === 'text' ? 'input' : 'change', () => {
      if (input.tagName === 'INPUT' && input.type === 'text') {
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(() => { state.page = 1; loadJobs(); }, 300);
      } else { state.page = 1; loadJobs(); }
    });
  }
  $('#reset-filters').addEventListener('click', resetFilters);
  $('#select-all').addEventListener('change', togglePageSelection);
  $('#select-page').addEventListener('click', selectCurrentPage);
  $('#clear-selection').addEventListener('click', clearSelection);
  $('#bulk-delete').addEventListener('click', bulkDelete);
  $('#jobs-body').addEventListener('click', onJobAction);
  $('#jobs-body').addEventListener('change', onJobSelection);
  $('#prev-page').addEventListener('click', () => changePage(-1));
  $('#next-page').addEventListener('click', () => changePage(1));
  $('#preferences-form').addEventListener('submit', savePreferences);
  $('#add-industry').addEventListener('click', () => addCustom('industries','custom-industry'));
  $('#add-company').addEventListener('click', () => addCustom('companies','custom-company'));
  $('#add-role').addEventListener('click', () => addCustom('roles','custom-role'));
  $('#add-location').addEventListener('click', () => addCustom('locations','custom-location'));
  $('#industry-options').addEventListener('click', onPreferenceChip);
  $('#role-options').addEventListener('click', onPreferenceChip);
  $('#location-options').addEventListener('click', onPreferenceChip);
  $('#company-chips').addEventListener('click', onRemoveChip);
  $('#role-chips').addEventListener('click', onRemoveChip);
  $('#location-chips').addEventListener('click', onRemoveChip);
  $('#deleted-body').addEventListener('click', onRestoreClick);
  $('#deleted-body').addEventListener('change', onDeletedSelection);
  $('#deleted-select-all').addEventListener('change', toggleDeletedSelection);
  $('#deleted-restore-selected').addEventListener('click', restoreSelected);
  $('#deleted-prev').addEventListener('click', () => changeDeletedPage(-1));
  $('#deleted-next').addEventListener('click', () => changeDeletedPage(1));
}

async function onLogin(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  $('#login-error').textContent = '';
  try { await api.login(form.get('username'), form.get('password')); $('#login-screen').hidden = true; await enterRoute(); }
  catch (error) { $('#login-error').textContent = error.message; }
}

async function logout() {
  try { await api.logout(); } catch { /* expire local view even if the session already expired */ }
  $('#login-screen').hidden = false;
}

async function enterRoute() {
  const route = (location.hash || '#all').slice(1);
  state.route = TITLES[route] ? route : 'all';
  state.mode = ['unread','favorites'].includes(state.route) ? state.route : 'all';
  for (const view of $$('.view')) view.hidden = true;
  const viewId = state.route === 'unread' || state.route === 'favorites' ? 'all' : state.route;
  $(`#view-${viewId}`)?.removeAttribute('hidden');
  $('#collect-button').hidden = viewId !== 'all';
  if (['all','unread','favorites'].includes(state.route)) $('#site-notice').hidden = false;
  else $('#site-notice').hidden = true;
  $('#page-breadcrumb').textContent = TITLES[state.route];
  if (viewId === 'all') $('#page-title').textContent = TITLES[state.route];
  for (const item of $$('.nav-item')) item.classList.toggle('active', item.dataset.route === state.route);
  $('#sidebar').classList.remove('open');
  try {
    if (viewId === 'all') await loadJobs();
    if (state.route === 'preferences') await loadPreferences();
    if (state.route === 'deleted') await loadDeleted();
  } catch (error) { if (error.status === 401) $('#login-screen').hidden = false; else toast(error.message, 'error'); }
}

async function loadJobs() {
  const requestId = ++state.requestId;
  state.loading = true;
  $('#loading-state').hidden = false; $('#empty-state').hidden = true; $('#error-state').hidden = true;
  try {
    const params = { page: state.page, mode: state.mode, q: $('#search-input').value.trim(), sort: $('#sort-select').value, site: $('#filter-site').value, industry: $('#filter-industry').value.trim(), career: $('#filter-career').value, location: $('#filter-location').value.trim(), deadline: $('#filter-deadline').value, read: $('#filter-read').value, favorite: $('#filter-favorite').value, includeExpired: String($('#include-expired').checked) };
    Object.keys(params).forEach((key) => { if (params[key] === '') delete params[key]; });
    const result = await api.listJobs(params);
    if (requestId !== state.requestId) return;
    state.jobs = result.jobs; state.totalPages = Math.max(1, result.pages); state.selected.clear();
    renderJobs(result);
    $('#loading-state').hidden = true;
    $('#empty-state').hidden = result.jobs.length !== 0;
  } catch (error) {
    if (requestId !== state.requestId) return;
    $('#loading-state').hidden = true; $('#error-state').hidden = false; $('#load-error').textContent = error.message;
    if (error.status === 401) $('#login-screen').hidden = false;
  } finally { if (requestId === state.requestId) state.loading = false; }
}

function renderJobs(result) {
  const body = $('#jobs-body');
  body.replaceChildren();
  for (const job of result.jobs) {
    const deadline = deadlineLabel(job.deadline);
    const row = document.createElement('tr');
    row.innerHTML = `<td><input type="checkbox" class="job-select" data-id="${job.id}" ${state.selected.has(job.id) ? 'checked' : ''} aria-label="공고 선택"></td>
      <td class="company-cell" title="${escapeHtml(job.company_name || 'X')}">${display(job.company_name)}${isNew(job) ? '<span class="new-badge">NEW</span>' : ''}</td>
      <td><a class="title-link" href="${safeHref(job.canonical_url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(job.job_title || '미확인')}">${display(job.job_title)}</a>${job.match_status ? `<span class="sub-text">${escapeHtml(job.match_status)}</span>` : ''}</td>
      <td>${display(job.career_requirement)}<span class="sub-text">${display(job.education_requirement)}</span></td>
      <td>${display(job.employment_type)}</td><td>${display(job.work_location)}</td><td>${display(job.salary)}</td>
      <td><span class="pill ${deadline.className}">${escapeHtml(deadline.label)}</span></td>
      <td><a class="site-link" href="${safeHref(job.canonical_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(job.source_name)}</a></td>
      <td><button class="row-action ${job.is_read ? 'read-on' : ''}" data-action="read" data-id="${job.id}" aria-label="${job.is_read ? '미확인으로 변경' : '확인 완료로 변경'}" title="${job.is_read ? '확인 완료' : '미확인'}">${job.is_read ? '◉' : '○'}</button></td>
      <td><button class="row-action ${job.is_favorite ? 'is-on' : ''}" data-action="favorite" data-id="${job.id}" aria-label="즐겨찾기 ${job.is_favorite ? '해제' : '등록'}">${job.is_favorite ? '★' : '☆'}</button></td>
      <td><button class="row-action delete-action" data-action="delete" data-id="${job.id}" aria-label="공고 삭제" title="삭제">⌫</button></td>`;
    body.append(row);
  }
  $('#results-count').textContent = `${result.total}건`;
  $('#page-indicator').textContent = `${result.page} / ${Math.max(1, result.pages)}`;
  $('#prev-page').disabled = result.page <= 1; $('#next-page').disabled = result.page >= result.pages;
  $('#select-all').checked = result.jobs.length > 0 && result.jobs.every((job) => state.selected.has(job.id));
  renderBulkToolbar();
}

function safeHref(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? escapeHtml(url.href) : '#'; } catch { return '#'; }
}

function isNew(job) { return Date.now() - new Date(job.created_at).getTime() < 3 * 86400000; }

async function onJobAction(event) {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const id = Number(button.dataset.id); const job = state.jobs.find((item) => item.id === id); if (!job) return;
  try {
    if (button.dataset.action === 'read') await api.read(id, !job.is_read);
    else if (button.dataset.action === 'favorite') await api.favorite(id, !job.is_favorite);
    else if (button.dataset.action === 'delete') {
      const ok = await confirmDialog('채용공고 삭제', `${job.company_name || '회사명 X'} — ${job.job_title || '공고 제목 X'} 공고를 삭제할까요?`, '삭제 확인');
      if (!ok) return;
      await api.delete(id); toast('공고를 삭제했습니다. 삭제된 공고 관리에서 복구할 수 있습니다.');
    }
    await loadJobs();
  } catch (error) { toast(error.message, 'error'); }
}

function onJobSelection(event) {
  const input = event.target.closest('.job-select'); if (!input) return;
  const id = Number(input.dataset.id); if (input.checked) state.selected.add(id); else state.selected.delete(id);
  $('#select-all').checked = state.jobs.length > 0 && state.jobs.every((job) => state.selected.has(job.id)); renderBulkToolbar();
}

function togglePageSelection(event) {
  for (const job of state.jobs) event.target.checked ? state.selected.add(job.id) : state.selected.delete(job.id);
  renderJobs({ jobs: state.jobs, total: Number($('#results-count').textContent.replace(/\D/g,'')) || 0, page: state.page, pages: state.totalPages });
}
function selectCurrentPage() { state.jobs.forEach((job) => state.selected.add(job.id)); renderJobs({ jobs: state.jobs, total: Number($('#results-count').textContent.replace(/\D/g,'')) || 0, page: state.page, pages: state.totalPages }); }
function clearSelection() { state.selected.clear(); $('#select-all').checked = false; renderJobs({ jobs: state.jobs, total: Number($('#results-count').textContent.replace(/\D/g,'')) || 0, page: state.page, pages: state.totalPages }); }
function renderBulkToolbar() { $('#bulk-toolbar').hidden = state.selected.size === 0; $('#selected-count').textContent = `${state.selected.size}개 선택됨`; }

async function bulkDelete() {
  if (!state.selected.size) return;
  const ids = [...state.selected];
  if (!await confirmDialog('선택 공고 일괄 삭제', `선택한 ${ids.length}개 공고를 삭제할까요?`, '선택 삭제')) return;
  try { const result = await api.bulkDelete(ids); toast(`${result.changed}건의 공고를 삭제했습니다.`); state.selected.clear(); await loadJobs(); }
  catch (error) { toast(error.message, 'error'); }
}

function resetFilters() {
  $('#search-input').value = ''; $('#sort-select').value = 'published';
  for (const id of ['filter-site','filter-industry','filter-career','filter-location','filter-deadline','filter-read','filter-favorite']) $(`#${id}`).value = '';
  $('#include-expired').checked = false; state.page = 1; loadJobs();
}
function changePage(delta) { state.page = Math.min(state.totalPages, Math.max(1, state.page + delta)); loadJobs(); }

async function runCollection() {
  const button = $('#collect-button'); const label = $('#collect-label');
  if (button.disabled) return;
  button.disabled = true; label.textContent = '공고 수집 중...';
  try {
    const preferences = await api.preferences();
    const queryTerms = [...preferences.industries, ...preferences.companies, ...preferences.roles, ...preferences.locations]
      .map((item) => item.trim()).filter(Boolean);
    const query = queryTerms.join(' ');
    if (!query) {
      label.textContent = '공고 수집';
      toast('맞춤 채용 조건에 산업·기업·직무·선호지역 중 검색할 항목을 먼저 입력해주세요.', 'error');
      return;
    }
    const opened = openSearchTabs(query);
    label.textContent = '검색 페이지 열림';
    window.alert(`저장된 조건으로 채용 사이트 검색 페이지를 열었습니다.\n검색어: ${query}\n\n브라우저에서 공고 상세와 접수 상태를 직접 확인해주세요. 실제 접수 중이고 조건에 맞는 공고는 ‘브라우저 확인 공고 등록’에서 직접 입력해 D1에 저장할 수 있습니다.\n\n열린 검색 탭: ${opened}개\n자동 페이지 판독이나 수집은 하지 않습니다.`);
    toast('새 탭의 공고를 직접 확인하세요. 확인된 항목은 브라우저 확인 공고 등록에서 저장할 수 있습니다.');
  } catch (error) {
    label.textContent = '공고 수집'; toast(`수집 오류: ${error.message}`, 'error');
  } finally {
    window.setTimeout(() => { button.disabled = false; label.textContent = '공고 수집'; }, 2500);
  }
}

function openSearchTabs(query) {
  const encoded = encodeURIComponent(query);
  const urls = [
    `https://www.saramin.co.kr/zf_user/search/recruit?searchword=${encoded}`,
    `https://www.jobkorea.co.kr/Search/?stext=${encoded}`,
    `https://search.incruit.com/list/search.asp?col=job&kw=${encoded}`,
    'https://jasoseol.com/recruit',
  ];
  let opened = 0;
  for (const url of urls) {
    const tab = window.open(url, '_blank', 'noopener,noreferrer');
    if (tab) opened += 1;
  }
  if (opened === 0) throw new Error('브라우저에서 새 탭 열기가 차단되었습니다. 팝업을 허용한 뒤 다시 눌러주세요.');
  return opened;
}

function openManualJobDialog() {
  $('#manual-job-form').reset();
  $('#manual-job-error').textContent = '';
  $('#manual-job-dialog').showModal();
}

async function saveManualJob(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const payload = {
    ...values,
    source_job_id: null,
    published_at: null,
    collected_at: new Date().toISOString(),
    deadline: values.deadline || null,
  };
  const submit = $('#manual-job-submit');
  const error = $('#manual-job-error');
  submit.disabled = true;
  error.textContent = '';
  try {
    await api.createManualJob(payload);
    $('#manual-job-dialog').close();
    toast('브라우저에서 확인한 공고를 게시판에 등록했습니다.');
    state.page = 1;
    await loadJobs();
  } catch (failure) {
    error.textContent = failure.message;
  } finally {
    submit.disabled = false;
  }
}

async function loadPreferences() {
  state.preferences = await api.preferences(); renderPreferenceOptions(); renderCustomChips();
  const radio = $(`input[name="career_level"][value="${CSS.escape(state.preferences.career_level)}"]`); if (radio) radio.checked = true;
}
function renderPreferenceOptions() {
  $('#industry-options').innerHTML = INDUSTRIES.map((name) => `<button type="button" class="choice-chip ${state.preferences.industries.includes(name) ? 'selected' : ''}" data-kind="industries" data-value="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('');
  $('#role-options').innerHTML = ROLES.map((name) => `<button type="button" class="choice-chip ${state.preferences.roles.includes(name) ? 'selected' : ''}" data-kind="roles" data-value="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('');
  const allSelected = state.preferences.locations.length === 0;
  $('#location-options').innerHTML = `<button type="button" class="choice-chip ${allSelected ? 'selected' : ''}" data-kind="locations" data-value="${escapeHtml(ALL_LOCATIONS)}">${escapeHtml(ALL_LOCATIONS)}</button>${LOCATIONS.map((name) => `<button type="button" class="choice-chip ${state.preferences.locations.includes(name) ? 'selected' : ''}" data-kind="locations" data-value="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('')}`;
}
function renderCustomChips() {
  $('#company-chips').innerHTML = state.preferences.companies.map((name) => customChip(name, 'companies')).join('');
  $('#role-chips').innerHTML = state.preferences.roles.filter((name) => !ROLES.includes(name)).map((name) => customChip(name, 'roles')).join('');
  $('#location-chips').innerHTML = state.preferences.locations.filter((name) => !LOCATIONS.includes(name)).map((name) => customChip(name, 'locations')).join('');
}
function customChip(name, kind) { return `<span class="custom-chip">${escapeHtml(name)}<button type="button" data-remove="${kind}" data-value="${escapeHtml(name)}" aria-label="${escapeHtml(name)} 삭제">×</button></span>`; }
function onPreferenceChip(event) {
  const button = event.target.closest('[data-kind]'); if (!button) return;
  const { kind, value } = button.dataset; const list = state.preferences[kind];
  if (kind === 'locations') state.preferences.locations = togglePreferredLocation(list, value);
  else {
    state.preferences[kind] = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }
  renderPreferenceOptions(); renderCustomChips();
}
function onRemoveChip(event) {
  const button = event.target.closest('[data-remove]'); if (!button) return;
  const { remove: kind, value } = button.dataset; state.preferences[kind] = state.preferences[kind].filter((item) => item !== value); renderPreferenceOptions(); renderCustomChips();
}
function addCustom(kind, inputId) {
  const input = $(`#${inputId}`); const value = input.value.trim(); if (!value) return;
  if (!state.preferences[kind].includes(value)) state.preferences[kind].push(value);
  input.value = ''; renderPreferenceOptions(); renderCustomChips();
}
async function savePreferences(event) {
  event.preventDefault(); const status = $('#preferences-status');
  const data = { ...state.preferences, career_level: $('input[name="career_level"]:checked')?.value || '신입' };
  try { state.preferences = await api.savePreferences(data); status.textContent = '저장되었습니다.'; toast('맞춤 채용 조건을 저장했습니다.'); }
  catch (error) { status.textContent = ''; toast(error.message, 'error'); }
}

async function loadDeleted() {
  const result = await api.deletedJobs(state.deletedPage); state.deleted = result.jobs; state.deletedPages = Math.max(1, result.pages); state.deletedSelected.clear();
  $('#deleted-body').innerHTML = result.jobs.map((job) => `<tr><td><input type="checkbox" class="deleted-select" data-id="${job.id}"></td><td><strong>${display(job.company_name)}</strong></td><td><a class="title-link" href="${safeHref(job.canonical_url)}" target="_blank" rel="noopener noreferrer">${display(job.job_title)}</a></td><td>${escapeHtml(job.source_name)}</td><td>${formatDate(job.deleted_at, true)}</td><td><button class="button secondary small" data-restore="${job.id}">복구</button></td></tr>`).join('');
  $('#deleted-empty').hidden = result.jobs.length > 0; $('#deleted-count').textContent = `${result.total}건`;
  $('#deleted-page-indicator').textContent = `${state.deletedPage} / ${state.deletedPages}`; $('#deleted-prev').disabled = state.deletedPage <= 1; $('#deleted-next').disabled = state.deletedPage >= state.deletedPages;
}
async function onRestoreClick(event) {
  const button = event.target.closest('[data-restore]'); if (!button) return;
  const job = state.deleted.find((item) => item.id === Number(button.dataset.restore));
  if (!await confirmDialog('공고 복구', `${job?.company_name || '회사명 X'} — ${job?.job_title || '공고 제목 X'} 공고를 복구할까요?`, '복구 확인')) return;
  try { await api.restore(button.dataset.restore); toast('공고를 복구했습니다.'); await loadDeleted(); } catch (error) { toast(error.message, 'error'); }
}
function onDeletedSelection(event) { const input = event.target.closest('.deleted-select'); if (!input) return; input.checked ? state.deletedSelected.add(Number(input.dataset.id)) : state.deletedSelected.delete(Number(input.dataset.id)); }
function toggleDeletedSelection(event) { state.deletedSelected.clear(); if (event.target.checked) state.deleted.forEach((job) => state.deletedSelected.add(job.id)); $$('.deleted-select').forEach((input) => { input.checked = event.target.checked; }); }
async function restoreSelected() {
  const ids = [...state.deletedSelected]; if (!ids.length) return toast('복구할 공고를 선택해주세요.');
  if (!await confirmDialog('선택 공고 복구', `선택한 ${ids.length}개 공고를 복구할까요?`, '선택 복구')) return;
  try { const result = await api.bulkRestore(ids); toast(`${result.changed}건의 공고를 복구했습니다.`); await loadDeleted(); } catch (error) { toast(error.message, 'error'); }
}
function changeDeletedPage(delta) { state.deletedPage = Math.min(state.deletedPages, Math.max(1, state.deletedPage + delta)); loadDeleted(); }

initialize();