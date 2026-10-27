/**
 * Home page client controller — entry point.
 *
 * Boot order matches the original `init()` function in `index.astro`:
 *   1. Filter controls (search + zone-type tabs).
 *   2. Reserve modal-level wiring (close affordances + submit).
 *   3. Reserve trigger buttons (initial-bind).
 *   4. Rotation timer + sync label.
 *
 * Each concern is implemented in its own focused module; this file
 * just orchestrates initialisation.
 */

import { bindFilterControls } from "./filterController";
import { bindReserveModal, bindReserveTriggersOnce } from "./reserveModalController";
import { bindRotation } from "./rotation";

function init(): void {
  bindFilterControls();
  bindReserveModal();
  bindReserveTriggersOnce();
  bindRotation();
}

init();