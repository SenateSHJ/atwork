import { redirect } from 'next/navigation';

// Meta Ads is the client-tier landing page (three-page client tier: Meta Ads,
// Google Ads, Website).
export default function Root() {
  redirect('/meta');
}
