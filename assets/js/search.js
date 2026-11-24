(function () {
  var toggle = document.getElementById("search-toggle");
  var modal = document.getElementById("search-modal");
  if (!toggle || !modal) return;
  var ui = null;

  function open() {
    modal.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("ananke-search-open");
    // Build the UI (and load the index) only on first open.
    if (!ui && typeof PagefindUI !== "undefined") {
      ui = new PagefindUI({ element: "#search", showSubResults: true, showImages: false });
    }
    var input = modal.querySelector(".pagefind-ui__search-input");
    if (input) input.focus();
  }

  function close() {
    modal.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("ananke-search-open");
    toggle.focus();
  }

  toggle.addEventListener("click", function () {
    if (modal.hidden) { open(); } else { close(); }
  });
  modal.addEventListener("click", function (event) {
    if (event.target.hasAttribute("data-search-close")) close();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !modal.hidden) close();
  });
})();
