'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { DateRangePicker } from './shared/DateRangePicker';

interface DateRangeControlProps {
  startDate: string;
  endDate:   string;
}

export function DateRangeControl({ startDate, endDate }: DateRangeControlProps) {
  const router = useRouter();
  const sp     = useSearchParams();

  const onChange = (from: string, to: string) => {
    const next = new URLSearchParams(sp.toString());
    next.set('from', from);
    next.set('to',   to);
    router.push(`?${next.toString()}`);
  };

  return <DateRangePicker startDate={startDate} endDate={endDate} onChange={onChange} />;
}
