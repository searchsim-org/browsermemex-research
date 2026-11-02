# Maintenance and release policy

The main BrowserMemex extension is publicly available at https://github.com/searchsim-org/browser-memex and https://browsermemex.com. Its exact evaluated research companion is released separately at https://github.com/searchsim-org/browsermemex-research with source/data manifests and fresh-environment reproduction. Keep these artifact versions distinct. No external adoption, archival DOI or service-level support commitment is asserted.

For a published release, retain immutable tagged source and a manifest of files/checksums. Keep the source snapshot distinct from optional companion configurations and the prebuilt browser extension. Preserve original inputs and outputs when adding controls, as this bundle does for strong controls and the external date-protocol audit.

Use major dataset versions for changed labels, episode semantics, eligibility or metric denominators. Use minor software versions for new adapters with unchanged existing outputs. Record fixes and their effect on all tables. Existing artifacts should remain retrievable; deprecations should have a migration recipe.

Before an update, run core contracts, additional contracts, replay and controls; verify exact non-timing outcomes and regenerate tables. Browser persistence and generic SQLite readout should be rerun after changes to storage, VFS, schema or browser support. Timing results must include environment and operation boundaries and must not be described as deterministic.

Issue reports should include artifact version, command, input hash, environment, and a minimal synthetic reproduction. Do not request private browser state, API tokens or raw personal browsing histories. Researchers may add graph/dense-memory adapters and task validators through the documented interfaces. A new adapter must state metadata access and ingestion/reader costs, and cannot use scorer-only labels.
