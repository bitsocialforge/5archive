import Image from 'next/image';
import Link from 'next/link';
import { siteBadge, siteName, siteTitle } from '@/lib/site';
import { SearchBar } from './SearchBar';
import { UpstreamHeaderLink } from './Upstream';

export function BrandHeader() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand" aria-label={`${siteTitle} home`}>
          <Image className="brand-mark" src="/brand/archive-mark.png" alt="" width={34} height={34} priority />
          <span className="brand-name">{siteName}</span>
          {siteBadge ? <span className="badge">{siteBadge}</span> : null}
        </Link>
        <UpstreamHeaderLink />
        <div className="header-search">
          <SearchBar compact />
        </div>
      </div>
    </header>
  );
}
