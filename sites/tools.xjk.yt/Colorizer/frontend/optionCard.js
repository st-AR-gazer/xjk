import { adjustModalPosition } from "./card-layout.js?v=2";
import { colorizerState } from "./state.js?v=2";

function toggleOptionCard() {
  const optionsCard = document.getElementById("optionsCard");

  colorizerState.isOptionsCardOpen = !colorizerState.isOptionsCardOpen;
  optionsCard.classList.toggle("options-card-active");

  adjustModalPosition();
}

export { toggleOptionCard };
