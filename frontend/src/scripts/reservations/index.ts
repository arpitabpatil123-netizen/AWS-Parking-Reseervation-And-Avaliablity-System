/**
 * My Reservations client controller — entry point.
 *
 * Boot order matches the original bottom-of-page bootstrap block in
 * `my-reservations.astro`:
 *   1. Auth guard (bounce unauthenticated visitors to /login).
 *   2. Bind toolbar (filter tabs + plate search).
 *   3. Bind cancel flow (delegation + dialog + confirm handler).
 *   4. Bind loader (refresh button + error-state retry).
 *   5. Kick off the initial fetch + start the 60s relative-time tick.
 *
 * If the auth guard redirects, none of the above runs.
 */

import { guardAuth } from "./auth";
import { bindToolbar } from "./toolbar";
import { bindCancelFlow } from "./cancelFlow";
import { bindLoader, startInitialLoad } from "./loader";

const user = guardAuth();
if (user) {
  bindToolbar();
  bindCancelFlow();
  bindLoader();
  startInitialLoad();
}