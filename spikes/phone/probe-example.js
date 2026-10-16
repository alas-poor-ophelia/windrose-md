// Example --eval probe. The value of the LAST expression is printed (a Promise is awaited).
// Runs in the Obsidian renderer after each scene is set up.
(() => {
  const m = document.querySelector(".modal");
  const r = (m ?? document.body).getBoundingClientRect();
  return {
    scene: m ? "modal open" : "no modal",
    phone: document.body.classList.contains("is-phone"),
    rect: { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) },
    toolbarButtons: document.querySelectorAll(".windrose-tool-palette button").length,
  };
})()
