
function updatePreview(previewContent) {
    document.getElementById("previewString").innerText = previewContent;
}

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('toggleEscape').addEventListener('click', toggleEscapeCharacters);
    document.getElementById('toggleOptionCard').addEventListener('click', toggleOptionCard);
    document.getElementById('toggleColorCard').addEventListener('click', toggleColorCard);
    document.getElementById('clearFormatter').addEventListener('click', clearFormatter);
    document.getElementById('closeColorCard').addEventListener('click', toggleColorCard);
    document.getElementById('closeOptionsCard').addEventListener('click', toggleOptionCard);
    document.getElementById('randomizeColorsButton').addEventListener('click', randomizeColors);
    document.getElementById('setDefaultColorsButton').addEventListener('click', setDefaultColors);
    document.getElementById('swapColorValuesButton').addEventListener('click', swapColorValues);
    document.getElementById('copyButton').addEventListener('click', copyToClipboard);
    document.getElementById('colorizeButton').addEventListener('click', function() {
        colorizeAndDisplay();
        showNotification('Colorized!');
    });
});

function adjustModalPosition() {
    const modal = document.querySelector('.modal');

    modal.classList.remove('modal-active', 'modal-options-active');

    if (isColorCardOpen && !isOptionsCardOpen) {
        modal.classList.add('modal-active');
    } else if (!isColorCardOpen && isOptionsCardOpen) {
        modal.classList.add('modal-options-active');
    }
}

function clearFormatter() {
    document.getElementById('inputString').value = '';
    document.getElementById('outputString').innerText = 'Your formatted text will appear here...';
    document.getElementById('previewString').innerHTML = 'Preview color text here';

    includeEscapeCharacters = false;
    document.getElementById('toggleEscape').textContent = 'Include \\';

    const twoColorsInput = document.querySelector('input[name="colorCount"][value="2"]');
    if (twoColorsInput) {
        twoColorsInput.checked = true;
    }

    colorArrayGlobal = ['#0033CC', '#33FFFF'];
    updateColorPickers(2);
}

function copyToClipboard() {
    const outputString = document.getElementById('outputString').innerText;

    copyText(outputString)
        .then(() => {
            showNotification('Copied to clipboard!');
        })
        .catch(err => {
            console.error('Error in copying text: ', err);
            showNotification('Unable to copy text.');
        });
}

function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
    }

    return new Promise((resolve, reject) => {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            document.execCommand('copy') ? resolve() : reject(new Error('Copy command failed'));
        } catch (err) {
            reject(err);
        } finally {
            document.body.removeChild(textArea);
        }
    });
}

function showNotification(message) {
    const notification = document.createElement('div');
    const container = document.getElementById('notificationContainer');

    notification.classList.add('notification-message');
    notification.textContent = message;
    container.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 100);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentElement === container) {
                container.removeChild(notification);
            }
        }, 500);
    }, 3000);
}
