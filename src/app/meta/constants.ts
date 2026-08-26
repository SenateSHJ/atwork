// Non-server-action constants shared between the page and the actions module.
// 'use server' files may only export async functions, so plain values live here.

// Website contact events recorded by the Meta pixel (contact_website).
// NOT venue bookings — atWork's booking flow leaves the site to OpenTable
// and cannot be attributed by the Meta pixel. Contact events = contact-form
// submissions and phone/email link taps on atworkbeerco.com.au.
// lead is excluded — 3-of-3 lead events over 90 days also fired
// contact_website with the same value, so lead is a subset. Counting both
// would double the 3 lead events.
// offsite_conversion_fb_pixel_lead is excluded — identical to lead per row.
// contact_total is excluded — identical to contact_website per row (no other
// contact channel is reported for this account).
export const META_CONVERSION_DEFINITION =
  'website contact events recorded by the Meta pixel (not venue bookings — bookings leave the site to OpenTable and are not attributable here)';
