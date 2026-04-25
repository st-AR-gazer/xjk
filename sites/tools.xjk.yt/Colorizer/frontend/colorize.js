let includeEscapeCharacters = false;

function toggleEscapeCharacters() {
    includeEscapeCharacters = !includeEscapeCharacters;
    document.getElementById('toggleEscape').textContent = includeEscapeCharacters ? "Exclude \\" : "Include \\";
    
    colorizeAndDisplay();
}

document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('[name="interpolation"]').forEach(radio => {
        radio.addEventListener('change', function() {
            colorizeAndDisplay();
        });
    });

    document.getElementById('inputString').addEventListener('input', function() {
        colorizeAndDisplay();
    });

    colorizeAndDisplay();
});

function hexToRgb(hex) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    return {r, g, b};
}    

function getActiveColors() {
    if (typeof colorArrayGlobal !== 'undefined' && colorArrayGlobal.length > 0) {
        return colorArrayGlobal;
    }

    return ["#0033CC", "#33FFFF"];
}

function interpolateColors(steps, type) {
    const activeColors = getActiveColors();

    if (type === 'DirectApply') {
        let directColors = [];
        for (let i = 0; i < steps; i++) {
            directColors.push(activeColors[i % activeColors.length]);
        }
        return directColors;
    }

    if (activeColors.length < 2 || steps < 2) {
        return Array(steps).fill(activeColors[0] || '#FFFFFF');
    }

    let colorArray = [];
    const totalSegments = activeColors.length - 1;

    for (let i = 0; i < steps; i++) {
        const position = (i / (steps - 1)) * totalSegments;
        const segmentIndex = Math.min(Math.floor(position), totalSegments - 1);
        const startColor = activeColors[segmentIndex];
        const endColor = activeColors[segmentIndex + 1];
        const {r: sR, g: sG, b: sB} = hexToRgb(startColor);
        const {r: eR, g: eG, b: eB} = hexToRgb(endColor);

        let t = applyInterpolation(position - segmentIndex, type);
        const r = Math.round(sR + (eR - sR) * t).toString(16).padStart(2, '0');
        const g = Math.round(sG + (eG - sG) * t).toString(16).padStart(2, '0');
        const b = Math.round(sB + (eB - sB) * t).toString(16).padStart(2, '0');
        colorArray.push(`#${r}${g}${b}`);
    }

    return colorArray;
}


function applyInterpolation(t, type) {
    switch(type) {
        case 'Linear':
            return t;
        case 'Quadratic':
            return t * t;
        case 'Quartic':
            return t * t * t * t;
        case 'Quintic':
            return t * t * t * t * t;
        case 'Cubic':
            return t * t * (3 - 2 * t);
        case 'Exponential':
            return Math.pow(t, 3);
        case 'Sinusoidal':
            return (Math.sin(t * Math.PI - Math.PI / 2) + 1) / 2;
        case 'Sine':
            return Math.sin(t * Math.PI / 2);
        case 'Back':
            let s = 1.70158;
            return t * t * ((s + 1) * t - s);
        case 'Elastic':
            let p = 0.3;
            let elasticValue = Math.pow(2, -10 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1;
            return Math.min(Math.max(elasticValue, 0), 1);
        case 'Bounce':
            let bounceValue;
            if (t < (1 / 2.75)) {
                bounceValue = 7.5625 * t * t;
            } else if (t < (2 / 2.75)) {
                t -= (1.5 / 2.75);
                bounceValue = 7.5625 * t * t + 0.75;
            } else if (t < (2.5 / 2.75)) {
                t -= (2.25 / 2.75);
                bounceValue = 7.5625 * t * t + 0.9375;
            } else {
                t -= (2.625 / 2.75);
                bounceValue = 7.5625 * t * t + 0.984375;
            }
            return Math.min(Math.max(bounceValue, 0), 1);
        case 'Smoothstep':
            return t * t * (3 - 2 * t);
        case 'Smootherstep':
            return t * t * t * (t * (t * 6 - 15) + 10);
        case 'Circular':
            return 1 - Math.sqrt(1 - t * t);
        default:
            return t; // Linear as default
    }
}


function formatColorCode(hexColor) {
    let r = parseInt(hexColor.slice(1, 3), 16) / 17;
    let g = parseInt(hexColor.slice(3, 5), 16) / 17;
    let b = parseInt(hexColor.slice(5, 7), 16) / 17;
    return includeEscapeCharacters ? `\\$${Math.floor(r).toString(16)}${Math.floor(g).toString(16)}${Math.floor(b).toString(16)}` : `$${Math.floor(r).toString(16)}${Math.floor(g).toString(16)}${Math.floor(b).toString(16)}`;
}

function colorizeString(inputString, type) {
    let colors = interpolateColors(inputString.length, type);
    let coloredString = "";

    let previewString = document.getElementById("previewString");
    previewString.innerHTML = "";

    for (let i = 0; i < inputString.length; i++) {
        let colorCode = formatColorCode(colors[i]);
        coloredString += `${colorCode}${inputString[i]}`;
        let span = document.createElement("span");
        span.style.color = colors[i];
        span.textContent = inputString[i];
        previewString.appendChild(span);
    }

    coloredString += includeEscapeCharacters ? "\\$g" : "$g";

    return coloredString;
}

function colorizeAndDisplay() {
    let inputString = document.getElementById("inputString").value;
    let type = document.querySelector('[name="interpolation"]:checked').value;

    if (!inputString) {
        document.getElementById("outputString").innerText = "Your formatted text will appear here...";
        document.getElementById("previewString").innerHTML = "Preview color text here";
        return;
    }

    let outputString = colorizeString(inputString, type);
    document.getElementById("outputString").innerText = outputString;
}
