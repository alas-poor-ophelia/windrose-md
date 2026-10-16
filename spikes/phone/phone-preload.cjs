// Renderer preload for the phone harness: turn on Obsidian's mobile emulation
// (same flag app.emulateMobile(true) writes) before the app scripts read it.
if (process.env.PHONE_EMULATE !== "0") {
  try {
    localStorage.setItem("EmulateMobile", "1");
  } catch {
    /* storage unavailable in this frame */
  }
}
