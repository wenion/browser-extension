'use strict';

/**
 * Return the checkbox that toggles whether badge requests are sent.
 */
function badgeCheckbox() {
  return (document.getElementById('badge')) as HTMLInputElement;
}

function modelSelect() {
  return (document.getElementById('model')) as HTMLSelectElement;
}

function tokenInput() {
  return (document.getElementById('token')) as HTMLInputElement;
}

function urlInput() {
  return (document.getElementById('url')) as HTMLInputElement;
}

function listInput() {
  return (document.getElementById('model-list')) as HTMLUListElement;
}

function submitForm() {
  return (document.getElementById('config-form')) as HTMLFormElement;
}

function optionForm() {
  return (document.getElementById('option-form')) as HTMLFormElement;
}

function saveOptions() {
  chrome.storage.sync.set({
    badge: badgeCheckbox().checked,
  });
}

function saveBaseline(e: SubmitEvent) {
  e.preventDefault();
  chrome.storage.sync.set({
    model: modelSelect().value,
    token: tokenInput().value,
    url: urlInput().value,
  });
}

function saveSelections(e: SubmitEvent) {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const formData = new FormData(form);

  // Extract values
  const option = formData.get('option') as string;
  if (option.trim() == "") {
    return;
  }
  chrome.storage.sync.get('selections', (response) => {
    if (!response.selections) {
      const value = JSON.stringify([option, ])
      chrome.storage.sync.set({
        selections: value
      });
    }
    else {
      const exist: string[] = JSON.parse(response.selections);
      exist.push(option);
      const value = JSON.stringify(exist)
      chrome.storage.sync.set({
        selections: value
      });
    }
    // const models: string []= JSON.parse(response.selections);
  });
  window.location.reload();
}

function initData() {
  chrome.storage.sync.get('selections', (response) => {
    if (!response.selections) {
      return;
    }
    const models: string []= JSON.parse(response.selections);
    const ul = listInput();
    const select = modelSelect();
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      select.appendChild(option);

      const li = document.createElement('li');
      li.classList.add('list-item');

      const textSpan = document.createElement('span');
      textSpan.textContent = model;
      // li.textContent = model;

      // Create a delete button for each list item
      const deleteButton = document.createElement('button');
      deleteButton.textContent = 'Delete';
      deleteButton.classList.add('delete-btn'); // Optional: Add a class for styling
      deleteButton.addEventListener('click', () => {
        chrome.storage.sync.get('selections', (response) => {
          if (!response.selections) {
            return;
          }
          else {
            let exist: string[] = JSON.parse(response.selections);
            exist = exist.filter(item => item !== model);
            if (exist.length === 0) {
              chrome.storage.sync.remove("selections");
            }
            else {
              const value = JSON.stringify(exist)
              chrome.storage.sync.set({
                selections: value
              });
            }
          }
          // const models: string []= JSON.parse(response.selections);
        });
        window.location.reload();
        // li.remove(); // Remove the list item when the button is clicked
      });

      li.appendChild(textSpan);
      li.appendChild(deleteButton);

      ul.appendChild(li);
    });
  });
}

function loadOptions() {
  initData();
  chrome.storage.sync.get(
    {
      badge: true,
      model: '',
      token: '',
      url: '',
    },
    items => {
      badgeCheckbox().checked = items.badge;
      modelSelect().value = items.model;
      tokenInput().value = items.token;
      urlInput().value = items.url;
    },
  );
}

document.addEventListener('DOMContentLoaded', loadOptions);
badgeCheckbox().addEventListener('click', saveOptions);
submitForm().addEventListener('submit', (e) => saveBaseline(e));
optionForm().addEventListener('submit', (e) => saveSelections(e));
