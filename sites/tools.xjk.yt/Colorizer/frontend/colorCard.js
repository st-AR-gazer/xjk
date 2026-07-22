import { adjustModalPosition } from "./card-layout.js?v=2";
import { colorizeAndDisplay } from "./colorize.js?v=2";
import { colorizerState, DEFAULT_COLORS } from "./state.js?v=2";

document.addEventListener("DOMContentLoaded", function () {
  const colorCountSelector = document.getElementById("colorCountSelector");
  const togglePresetsButton = document.getElementById("togglePresets");

  colorCountSelector.addEventListener("change", function (event) {
    if (!event.target.matches('input[name="colorCount"]')) return;

    updateColorPickers(parseInt(event.target.value, 10));
    applyColorChanges();
  });

  togglePresetsButton.addEventListener("click", togglePresetsPanel);

  document.querySelectorAll("[data-preset-colors]").forEach((button) => {
    button.addEventListener("click", function () {
      applyPresetColors(this.dataset.presetColors.split(","));
    });
  });

  updateColorPickers(getSelectedColorCount());
});

function getSelectedColorCount() {
  const selectedColorCount = document.querySelector('input[name="colorCount"]:checked');
  return selectedColorCount ? parseInt(selectedColorCount.value, 10) : 2;
}

function toggleColorCard() {
  const colorCard = document.getElementById("colorCard");

  colorizerState.isColorCardOpen = !colorizerState.isColorCardOpen;
  colorCard.classList.toggle("color-card-active", colorizerState.isColorCardOpen);

  adjustModalPosition();
}

function updateColorPickers(count) {
  const colorPickersContainer = document.getElementById("colorPickers");
  const normalizedCount = Math.max(1, parseInt(count, 10) || 2);
  const nextColors = [];

  colorPickersContainer.replaceChildren();

  for (let i = 0; i < normalizedCount; i++) {
    const colorPicker = document.createElement("input");
    const colorValue = colorizerState.colors[i] || DEFAULT_COLORS[i % DEFAULT_COLORS.length] || "#FFFFFF";

    colorPicker.type = "color";
    colorPicker.id = `picker${i}`;
    colorPicker.value = colorValue;
    colorPicker.addEventListener("input", handleColorChange);

    nextColors.push(colorValue);
    colorPickersContainer.appendChild(colorPicker);
  }

  colorizerState.colors = nextColors;
}

function applyColorChanges() {
  const pickers = document.querySelectorAll('#colorPickers input[type="color"]');
  colorizerState.colors = Array.from(pickers).map((picker) => picker.value);
  colorizeAndDisplay();
}

function generateRandomColor() {
  return (
    "#" +
    Math.floor(Math.random() * 16777215)
      .toString(16)
      .padStart(6, "0")
  );
}

function randomizeColors() {
  const colorPickers = document.querySelectorAll('#colorPickers input[type="color"]');

  colorPickers.forEach((picker, index) => {
    const randomColor = generateRandomColor();
    picker.value = randomColor;
    colorizerState.colors[index] = randomColor;
  });

  colorizeAndDisplay();
}

function handleColorChange(event) {
  const index = parseInt(event.target.id.replace("picker", ""), 10);
  colorizerState.colors[index] = event.target.value;
  colorizeAndDisplay();
}

function swapColorValues() {
  const colorPickers = Array.from(document.querySelectorAll('#colorPickers input[type="color"]'));
  const count = colorPickers.length;

  for (let i = 0; i < Math.floor(count / 2); i++) {
    const endIndex = count - 1 - i;
    const startValue = colorPickers[i].value;

    colorPickers[i].value = colorPickers[endIndex].value;
    colorPickers[endIndex].value = startValue;

    colorizerState.colors[i] = colorPickers[i].value;
    colorizerState.colors[endIndex] = colorPickers[endIndex].value;
  }

  colorizeAndDisplay();
}

function setDefaultColors() {
  const colorPickers = document.querySelectorAll('#colorPickers input[type="color"]');

  colorPickers.forEach((picker, index) => {
    const defaultColor = DEFAULT_COLORS[index % DEFAULT_COLORS.length];
    picker.value = defaultColor;
    colorizerState.colors[index] = defaultColor;
  });

  colorizeAndDisplay();
}

function togglePresetsPanel() {
  document.getElementById("presetsPanel").classList.toggle("show");
}

function applyPresetColors(colors) {
  colorizerState.colors = [...colors];

  ensureColorCountOption(colors.length);

  const colorCountInput = document.querySelector(`input[name="colorCount"][value="${colors.length}"]`);
  if (colorCountInput) {
    colorCountInput.checked = true;
  }

  updateColorPickers(colors.length);
  colorizeAndDisplay();
}

function ensureColorCountOption(value) {
  if (document.querySelector(`input[name="colorCount"][value="${value}"]`)) return;

  const colorCountSelector = document.getElementById("colorCountSelector");
  const input = document.createElement("input");
  const label = document.createElement("label");

  input.type = "radio";
  input.id = `color${value}`;
  input.name = "colorCount";
  input.value = value;

  label.htmlFor = input.id;
  label.textContent = value;
  label.className = "btn";

  colorCountSelector.appendChild(input);
  colorCountSelector.appendChild(label);
}

export { randomizeColors, setDefaultColors, swapColorValues, toggleColorCard, updateColorPickers };
