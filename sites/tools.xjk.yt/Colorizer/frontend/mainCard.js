
function updatePreview(previewContent) {
    document.getElementById("previewString").innerText = previewContent;
}

function adjustModalPosition() {
    const modal = document.querySelector('.modal');

    modal.classList.remove('modal-active', 'modal-options-active');

    if (isColorCardOpen && !isOptionsCardOpen) {
        modal.classList.add('modal-active');
    } else if (!isColorCardOpen && isOptionsCardOpen) {
        modal.classList.add('modal-options-active');
    }
}
