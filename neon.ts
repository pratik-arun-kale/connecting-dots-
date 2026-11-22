import { defineConfig } from "@neon/config/v1";

// Branches that must never get the 7-day TTL below. `dev` holds local
// development data (see docs/BETA_LAUNCH_PLAN.md, M0.1).
const LONG_LIVED_BRANCHES = new Set(["dev"]);

export default defineConfig({
  // Declare your Neon services here
  auth: false,
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (LONG_LIVED_BRANCHES.has(branch.name)) {
      // Local development's database: never expires. (Its 7-day TTL from the
      // rule below was removed with `neon branches set-expiration dev`.)
      return {};
    }
    if (!branch.exists) {
      // New throwaway branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
