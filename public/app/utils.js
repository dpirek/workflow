function timeAgo(date) {
  if (!date) return 'unknown';

  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  let interval = Math.floor(seconds / 31536000);

  if (interval > 1) {
    return interval + ' yrs';
  }
  interval = Math.floor(seconds / 2592000);
  if (interval > 1) {
    return interval + ' mths';
  }
  interval = Math.floor(seconds / 86400);
  if (interval > 1) {
    return interval + ' days';
  }
  interval = Math.floor(seconds / 3600);
  if (interval > 1) {
    return interval + ' hrs';
  }
  interval = Math.floor(seconds / 60);
  if (interval > 1) {
    return interval + ' mins';
  }
  return 'secs';
}

function concatenate(string, length) {
  if (!string) return '';
  if (string.length <= length) return string;
  return `<span title="${string}">${(string + '').substring(0, length)}...</span>`;
}

function htmlEncode(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function markdownToHtml(markdown) {
  // Simple markdown to HTML conversion (for demonstration purposes)
  return markdown
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    .replace(/\n/gim, '<br>');
}

function getQueryParams() {
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  const params = {};
  for (const [key, value] of urlParams.entries()) {
    params[key] = value;
  }
  return params;
}

const html = (input) => {
  return String.raw(input);
};

const css = (strings, ...values) => {
  return String.raw({ raw: strings }, ...values.map(htmlEncode));
};

// Markdown template literal tag
const md = (input) => {
  const rawString = String.raw(input);
  return markdownToHtml(rawString);
};

export { timeAgo, concatenate, html, css, md, getQueryParams };
