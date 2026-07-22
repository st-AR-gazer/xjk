import { colorizerState } from "./state.js?v=2";

function adjustModalPosition() {
  const modal = document.querySelector(".modal");
  modal.classList.remove("modal-active", "modal-options-active");

  if (colorizerState.isColorCardOpen && !colorizerState.isOptionsCardOpen) {
    modal.classList.add("modal-active");
  } else if (!colorizerState.isColorCardOpen && colorizerState.isOptionsCardOpen) {
    modal.classList.add("modal-options-active");
  }
}

export { adjustModalPosition };
