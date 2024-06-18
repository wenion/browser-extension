'use strict';

/**
 * Return the checkbox that toggles whether badge requests are sent.
 */
function badgeCheckbox() {
  return /** @type {HTMLInputElement} */ (document.getElementById('badge'));
}

function modelSelect() {
  return /** @type {HTMLSelectElement} */ (document.getElementById('model'));
}

function tokenInput() {
  return /** @type {HTMLInputElement} */ (document.getElementById('token'));
}

function submitnInput() {
  return /** @type {HTMLInputElement} */ (document.getElementById('submit'));
}

function saveOptions() {
  chrome.storage.sync.set({
    badge: badgeCheckbox().checked,
  });
}

function saveBaseline() {
  chrome.storage.sync.set({
    model: modelSelect().value,
    token: tokenInput().value,
  });
}

function loadOptions() {
  chrome.storage.sync.get(
    {
      badge: true,
      model: '',
      token: '',
    },
    items => {
      badgeCheckbox().checked = items.badge;
      modelSelect().value = items.model;
      tokenInput().value = items.token;
    },
  );
}

document.addEventListener('DOMContentLoaded', loadOptions);
badgeCheckbox().addEventListener('click', saveOptions);
submitnInput().addEventListener('click', saveBaseline);
