'use client';

import { useRouter } from 'next/navigation';

/** 5chan's "Posts: Active / Archived / All" search filter; changing it reruns the search. */
export function StatusSelect({ value, hrefs }: { value: string; hrefs: Record<string, string> }) {
  const router = useRouter();
  return (
    <select aria-label="Posts" value={value} onChange={(event) => {
      const href = hrefs[event.target.value];
      if (href !== undefined) router.push(href);
    }}>
      <option value="active">Active</option>
      <option value="archived">Archived</option>
      <option value="all">All</option>
    </select>
  );
}
