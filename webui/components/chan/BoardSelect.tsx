'use client';

import { useRouter } from 'next/navigation';

/** 5chan's mobile board picker: choosing a board navigates to it. */
export function BoardSelect({ current, options }: { current?: string; options: { value: string; label: string }[] }) {
  const router = useRouter();
  const known = options.some((option) => option.value === current);

  return (
    <select
      aria-label="Board"
      value={known ? current : ''}
      onChange={(event) => router.push(`/${encodeURIComponent(event.target.value)}`)}
    >
      {known ? null : <option value="">{current ? `/${current}/` : 'Home'}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
