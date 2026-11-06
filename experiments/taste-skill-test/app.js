(() => {
  const button = document.querySelector(".menu-btn");
  const sheet = document.querySelector("#menu-sheet");
  if (!button || !sheet) return;

  const desktop = window.matchMedia("(min-width: 1024px)");
  const links = sheet.querySelectorAll("a");

  const close = ({ restoreFocus = false } = {}) => {
    sheet.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "Abrir menú");
    document.body.classList.remove("menu-open");
    if (restoreFocus) button.focus();
  };

  const open = () => {
    sheet.hidden = false;
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-label", "Cerrar menú");
    document.body.classList.add("menu-open");
    const first = sheet.querySelector("a");
    if (first) first.focus();
  };

  button.addEventListener("click", () => {
    if (sheet.hidden) open();
    else close({ restoreFocus: true });
  });

  links.forEach((link) => link.addEventListener("click", () => close()));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !sheet.hidden) close({ restoreFocus: true });
  });

  desktop.addEventListener("change", (event) => {
    if (event.matches) close();
  });
})();
