const MAX_VISIBLE_STEPS = 8;

export function normalizeRequestProgress(progress = {}) {
  const completed = nonNegativeInteger(progress.completed);
  const remaining = nonNegativeInteger(progress.remaining);
  return { completed, remaining, total: completed + remaining };
}

export function requestProgressGraphic(progress) {
  const { completed, remaining, total } = normalizeRequestProgress(progress);
  const visible = Math.min(total, MAX_VISIBLE_STEPS);
  const hidden = Math.max(total - visible, 0);
  const completedVisible = Math.min(completed, visible);
  const markers = Array.from(
    { length: visible },
    (_, index) =>
      `<span class="request-step-dot${index < completedVisible ? ' completed' : ''}"></span>`,
  ).join('');
  const label = `${completed} ${word(completed, 'step')} completed, ${remaining} to go`;

  return `<div class="request-progress" role="img" aria-label="${label}" title="${label}"><div class="request-progress-track" aria-hidden="true">${markers}${hidden ? `<span class="request-step-more">+${hidden}</span>` : ''}</div><span class="request-progress-label"><strong>${completed}</strong> completed <i>·</i> <strong>${remaining}</strong> to go</span></div>`;
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(Math.round(number), 0) : 0;
}

function word(count, singular) {
  return count === 1 ? singular : `${singular}s`;
}
