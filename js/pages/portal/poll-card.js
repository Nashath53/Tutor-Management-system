/**
 * "Will you join the next class?" poll.
 * Shows only within poll.hours_before (default 24h) of a scheduled class and disappears when the class starts.
 * Answers are temporary: the server deletes them once the class has started (no history is kept).
 */
import { api } from '../../services/api.js';
import { t, loc } from '../../i18n/language.js';
import { esc } from '../../utils/dom.js';
import { toastError, showToast } from '../../components/toast.js';

const when = (iso) => {
  const d = new Date(iso); const today = new Date(); const tm = new Date(); tm.setDate(today.getDate() + 1);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `${t('common.today')} · ${time}`;
  if (d.toDateString() === tm.toDateString()) return `${t('common.tomorrow')} · ${time}`;
  return d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
};

export async function mountPolls(el) {
  if (!el) return;
  let polls = [];
  try { polls = await api.rpc('get_my_polls'); } catch (e) { console.warn(e); }
  const timers = [];
  const draw = () => {
    polls = polls.filter((p) => Date.parse(p.starts_at) > Date.now());
    el.hidden = !polls.length;
    el.innerHTML = polls.map((p) => `<div class="poll-card" data-poll="${esc(p.class_id)}">
      <div class="d-flex gap-3 align-items-start"><span class="poll-ico"><i class="bi bi-hand-index-thumb" aria-hidden="true"></i></span>
        <div class="flex-grow-1 min-w-0"><div class="eyebrow">${esc(t('poll.eyebrow'))}</div><b class="d-block">${esc(t('poll.q', { cls: loc(p, 'title') }))}</b><span class="small opacity-75">${esc(when(p.starts_at))}</span></div></div>
      <div class="poll-btns" role="group" aria-label="${esc(t('poll.q', { cls: loc(p, 'title') }))}">
        <button type="button" class="${p.my_answer === true ? 'on yes' : ''}" data-ans="yes" aria-pressed="${p.my_answer === true}"><i class="bi bi-check-circle" aria-hidden="true"></i>${esc(t('poll.yes'))}</button>
        <button type="button" class="${p.my_answer === false ? 'on no' : ''}" data-ans="no" aria-pressed="${p.my_answer === false}"><i class="bi bi-x-circle" aria-hidden="true"></i>${esc(t('poll.no'))}</button>
      </div>
      <div class="small opacity-75 mt-2">${esc(p.my_answer == null ? t('poll.hint') : t('poll.saved'))}</div></div>`).join('');
  };
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ans]'); if (!b) return;
    const card = b.closest('[data-poll]'); const p = polls.find((x) => x.class_id === card.dataset.poll);
    const ans = b.dataset.ans === 'yes';
    try { await api.rpc('answer_class_poll', { p_class_id: p.class_id, p_answer: ans }); p.my_answer = ans; draw(); showToast(t('poll.thanks'), 'success'); } catch (err) { toastError(err); }
  });
  draw();
  // Auto-hide exactly when each class starts.
  polls.forEach((p) => { const ms = Date.parse(p.starts_at) - Date.now(); if (ms > 0 && ms < 2 ** 31 - 1) timers.push(setTimeout(draw, ms + 500)); });
}
