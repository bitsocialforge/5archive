import { apiBase } from '@/lib/api';
import archive from '@/styles/archive.module.css';

/** Shown when the indexer API can't be reached, where the threads would be. */
export function ApiDown() {
  return (
    <div className={archive.notice}>
      <strong>The indexer API isn’t reachable.</strong> Start it with{' '}
      <code>cd server &amp;&amp; npm run dev</code> — expected at <code>{apiBase}</code>.
    </div>
  );
}
