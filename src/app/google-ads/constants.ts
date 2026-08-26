// Non-server-action constants for the Google Ads page.
// Google Ads returns a single aggregated `conversions` metric per stat row;
// atWork's Weld model does not include a conversion_action segment, so there
// is no per-action-type breakdown available. This is the source-of-truth
// definition surfaced under the scorecards.
export const GADS_CONVERSION_DEFINITION =
  'Google Ads native conversions (aggregated across all configured conversion actions in the account)';
