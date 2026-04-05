let isColorCardOpen = false;
let colorArrayGlobal = ["#0033CC", "#33FFFF"];

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('colorCountSelector').addEventListener('change', function(event) {
        const selectedCount = parseInt(event.target.value, 10);
        updateColorPickers(selectedCount);
        applyColorChanges();
    });

    updateColorPickers(parseInt(document.querySelector('input[name="colorCount"]:checked').value, 10));
});

document.getElementById('colorCountSelector').addEventListener('change', function(event) {
    updateColorPickers(event);
    colorizeAndDisplay();
});

function toggleColorCard() {
    const modal = document.querySelector('.modal');
    const colorCard = document.getElementById('colorCard');

    isColorCardOpen = !isColorCardOpen;
    colorCard.classList.toggle('color-card-active');

    adjustModalPosition();
}

function updateColorPickers(count) {
    const colorPickersContainer = document.getElementById('colorPickers');
    colorPickersContainer.innerHTML = ''; // Clear existing pickers

    for (let i = 0; i < count; i++) {
        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.id = `picker${i}`;
        colorPicker.value = colorArrayGlobal[i] || '#FFFFFF';

        colorPicker.addEventListener('change', function() {
            colorArrayGlobal[i] = this.value;
            colorizeAndDisplay();
        });

        colorPickersContainer.appendChild(colorPicker);
    }

    colorArrayGlobal.length = count;
    colorArrayGlobal.fill('#FFFFFF', colorArrayGlobal.length, count);
}

function applyColorChanges() {
    const pickers = document.querySelectorAll('#colorPickers input[type="color"]');
    colorArrayGlobal = Array.from(pickers).map(picker => picker.value);
    colorizeAndDisplay();
}

function generateRandomColor() {
    const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    return randomColor;
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
    const colorPickers = document.querySelectorAll('#colorPickers input[type="color"]');
    const visibleColorPickers = Array.from(colorPickers).filter(picker => picker.style.display !== 'none');
    
    const count = visibleColorPickers.length;
    
    for (let i = 0; i < Math.floor(count / 2); i++) {
        const endIndex = count - 1 - i;
        let tempValue = visibleColorPickers[i].value;
        visibleColorPickers[i].value = visibleColorPickers[endIndex].value;
        visibleColorPickers[endIndex].value = tempValue;

        let tempColor = colorArrayGlobal[i];
        colorArrayGlobal[i] = colorArrayGlobal[endIndex];
        colorArrayGlobal[endIndex] = tempColor;
    }
    
    colorizeAndDisplay();
}

function randomizeColors() {
    const colorPickers = document.querySelectorAll('#colorPickers input[type="color"]');
    colorPickers.forEach(picker => {
        picker.value = generateRandomColor();
        picker.dispatchEvent(new Event('change'));
    });
}

const defaultColors = ["#0033CC", "#33FFFF", "#FF33CC", "#CC33FF", "#33CCFF"];

function setDefaultColors() {
    const colorPickers = document.querySelectorAll('#colorPickers input[type="color"]');
    colorPickers.forEach((picker, index) => {
        const defaultColor = defaultColors[index % defaultColors.length];
        picker.value = defaultColor;
        colorArrayGlobal[index] = defaultColor;
    });
    colorizeAndDisplay();
}

document.getElementById('togglePresets').addEventListener('click', function() {
    document.getElementById('presetsPanel').style.display = document.getElementById('presetsPanel').style.display === 'none' ? 'block' : 'none';
});

function applyPresetColors(colors) {
    colorArrayGlobal = colors;
    const colorCount = colors.length;
    document.getElementById('colorCount').value = colorCount.toString();
    updateColorPickers(colorCount);
    colorizeAndDisplay();
}

document.getElementById('togglePresets').addEventListener('click', function() {
    const presetsPanel = document.getElementById('presetsPanel');
    presetsPanel.classList.toggle('show');

    if (presetsPanel.classList.contains('show')) {
        const presetButtons = document.querySelectorAll('.preset-btn');
        setTimeout(() => {
            presetButtons.forEach(button => button.style.opacity = 1);
        }, 500);
    } else {
        const presetButtons = document.querySelectorAll('.preset-btn');
        presetButtons.forEach(button => button.style.opacity = 0);
    }
});


function applyPresetColors(colorArray) {
    colorArrayGlobal = [...colorArray];
    
    const maxColorsSupported = Math.max(...colorArray.map(arr => arr.length), 5);
    ensureColorCountOptions(maxColorsSupported);
    
    const colorCountInput = document.querySelector(`input[name="colorCount"][value="${colorArray.length}"]`);
    if(colorCountInput) {
        colorCountInput.checked = true;
    } else {
        addColorCountOption(colorArray.length);
        document.querySelector(`input[name="colorCount"][value="${colorArray.length}"]`).checked = true;
    }

    updateColorPickers(colorArray.length);

    colorArray.forEach((color, index) => {
        const picker = document.getElementById(`picker${index}`);
        if(picker) {
            picker.value = color;
        }
    });

    colorizeAndDisplay();
}

function ensureColorCountOptions(maxColors) {
    const colorCountSelector = document.getElementById("colorCountSelector");
    while(colorCountSelector.children.length < maxColors) {
        addColorCountOption(colorCountSelector.children.length + 1);
    }
}

function addColorCountOption(value) {
    const colorCountSelector = document.getElementById("colorCountSelector");
    const input = document.createElement("input");
    input.type = "radio";
    input.id = `color${value}`;
    input.name = "colorCount";
    input.value = value;

    const label = document.createElement("label");
    label.htmlFor = `color${value}`;
    label.textContent = value;
    label.className = "btn";

    colorCountSelector.appendChild(input);
    colorCountSelector.appendChild(label);
}
