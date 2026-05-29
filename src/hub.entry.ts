import { init } from "./hub";
import { registerServiceWorker } from "./shared/pwa";

init();
registerServiceWorker();

// Lazy ambient living strip: pixi loads ONLY here, via dynamic import(), after
// first paint — so the hub boot graph stays pixi-free (bundle-size BOOT gate).
// Skipped under prefers-reduced-motion (the static CSS ground band remains as
// the fallback). The hub's WebGL context is freed on full-page nav to the Walk.
const dioramaHost = document.getElementById("hub-diorama");
const motionOk =
  typeof matchMedia !== "function" ||
  !matchMedia("(prefers-reduced-motion: reduce)").matches;
if (dioramaHost && motionOk) {
  const mount = (): void => {
    void import("./hub-diorama")
      .then((m) => m.mountHubDiorama(dioramaHost))
      .catch(() => {
        /* leave the CSS ground band as the fallback */
      });
  };
  if ("requestIdleCallback" in window) {
    (
      window as unknown as { requestIdleCallback: (cb: () => void) => void }
    ).requestIdleCallback(mount);
  } else {
    setTimeout(mount, 200);
  }
}
