let isOptionsCardOpen = false;

function toggleOptionCard() {
    const modal = document.querySelector('.modal');
    const optionsCard = document.getElementById('optionsCard');

    isOptionsCardOpen = !isOptionsCardOpen;
    optionsCard.classList.toggle('options-card-active');

    adjustModalPosition();
}