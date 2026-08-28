// Non-server-action constants shared between the page and the actions module.
// 'use server' files may only export async functions, so plain values live here.

// Lead events recorded by the Meta pixel for atWork Australia.
// The `lead` action_type counts pixel-fired lead events (contact form
// submissions on atworkaustralia.com.au). Cross-checked with
// `offsite_conversion.fb_pixel_lead` and `onsite_web_lead` — same 34 events
// per 30-day window, so all three are the same underlying event under
// different Meta labels; using `lead` alone avoids triple-counting.
//
// contact_website is NOT used — atWork's Meta pixel does not fire that event
// (that was a Coolum-scaffold assumption for a venue-with-OpenTable setup).
export const META_CONVERSION_DEFINITION =
  'Meta pixel lead events (contact-form submissions on atworkaustralia.com.au). Excludes offsite_conversion.fb_pixel_lead and onsite_web_lead, which count the same events under different Meta labels.';
