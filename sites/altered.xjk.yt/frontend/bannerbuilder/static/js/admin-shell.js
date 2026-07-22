window.addEventListener("DOMContentLoaded", () => {
  window.setTimeout(() => {
    document.querySelectorAll(".flash").forEach((element) => {
      element.classList.add("hide");
      element.addEventListener("animationend", () => element.remove(), { once: true });
    });
  }, 5000);
});
