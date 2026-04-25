let isColorCardOpen = false;
let colorArrayGlobal = ["#0033CC", "#33FFFF"];

const defaultColors = ["#0033CC", "#33FFFF", "#FF33CC", "#CC33FF", "#33CCFF"];

document.addEventListener('DOMContentLoaded', function() {
    const colorCountSelector = document.getElementById('colorCountSelector');
    const togglePresetsButton = document.getElementById('togglePresets');

    colorCountSelector.addEventListener('change', function(event) {
        if (!event.target.matches('input[name="colorCount"]')) return;

        updateColorPickers(parseInt(event.target.value, 10));
        applyColorChanges();
    });

    togglePresetsButton.addEventListener('click', togglePresetsPanel);

    document.querySelectorAll('[data-preset-colors]').forEach(button => {
        button.addEventListener('click', function() {
            applyPresetColors(this.dataset.presetColors.split(','));
        });
    });

    updateColorPickers(getSelectedColorCount());
});

function getSelectedColorCount() {
    const selectedColorCount = document.querySelector('input[name="colorCount"]:checked');
    return selectedColorCount ? parseInt(selectedColorCount.value, 10) : 2;
}

function toggleColorCard() {
    const colorCard = document.getElementById('colorCard');

    isColorCardOpen = !isColorCardOpen;
    colorCard.classList.toggle('color-card-active', isColorCardOpen);

    adjustModalPosition();
}

function updateColorPickers(count) {
    const colorPickersContainer = document.getElementById('colorPickers');
    const normalizedCount = Math.max(1, parseInt(count, 10) || 2);
    const nextColors = [];

    colorPickersContainer.innerHTML = '';

    for (let i = 0; i < normalizedCount; i++) {
        const colorPicker = document.createElement('input');
        const colorValue = colorArrayGlobal[i] || defaultColors[i % defaultColors.length] || '#FFFFFF';

        colorPicker.type = 'color';
        colorPicker.id = `picker${i}`;
        colorPicker.value = colorValue;
        colorPicker.addEventListener('input', handleColorChange);

        nextColors.push(colorValue);
        colorPickersContainer.appendChild(colorPicker);
    }

    colorArrayGlobal = nextColors;
}

function applyColorChanges() {
    const pickers = document.querySelectorAll('#colorPickers input[type="color"]');
    colorArrayGlobal = Array.from(pickers).map(picker => picker.value);
    colorizeAndDisplay();
}

function generateRandomColor() {
    return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
}

function randomizeColors() {
    const colorPickers = document.querySelectorAll('#colorPickers input[type="color"]');

    colorPickers.forEach((picker, index) => {
        const randomColor = generateRandomColor();
        picker.value = randomColor;
        colorArrayGlobal[index] = randomColor;
    });

    colorizeAndDisplay();
}

function handleColorChange(event) {
    const index = parseInt(event.target.id.replace('picker', ''), 10);
    colorArrayGlobal[index] = event.target.value;
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

        colorArrayGlobal[i] = colorPickers[i].value;
        colorArrayGlobal[endIndex] = colorPickers[endIndex].value;
    }

    colorizeAndDisplay();
}

function setDefaultColors() {
    const colorPickers = document.querySelectorAll('#colorPickers input[type="color"]');

    colorPickers.forEach((picker, index) => {
        const defaultColor = defaultColors[index % defaultColors.length];
        picker.value = defaultColor;
        colorArrayGlobal[index] = defaultColor;
    });

    colorizeAndDisplay();
}

function togglePresetsPanel() {
    document.getElementById('presetsPanel').classList.toggle('show');
}

function applyPresetColors(colors) {
    colorArrayGlobal = [...colors];

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

    const colorCountSelector = document.getElementById('colorCountSelector');
    const input = document.createElement('input');
    const label = document.createElement('label');

    input.type = 'radio';
    input.id = `color${value}`;
    input.name = 'colorCount';
    input.value = value;

    label.htmlFor = input.id;
    label.textContent = value;
    label.className = 'btn';

    colorCountSelector.appendChild(input);
    colorCountSelector.appendChild(label);
}
