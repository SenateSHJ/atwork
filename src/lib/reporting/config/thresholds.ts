// Default thresholds. A client may pass a different Thresholds object into
// its ClientConfig; nothing in the engine or rules hardcodes these values.

import type { Thresholds } from '../contract/types';

export const DEFAULT_THRESHOLDS: Thresholds = {
  materialPct:           10,
  minSampleForBestWorst: 50,
  materialityCap:        100,
  baselinePeriods:       3,
};
