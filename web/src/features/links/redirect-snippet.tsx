// Redirect rule for the user's platform, from the broken path to the chosen fix.
// Copy-paste ready: the fastest way to turn a suggestion into a real fix.
import { useState } from 'react';
import { CodeBlock } from '../../components/copy-button';
import { SegmentedTabs } from '../../components/ui/tabs';
import { pathOf } from '../../lib/format';

type Platform = 'redirects' | 'vercel' | 'nginx' | 'apache' | 'nextjs';

function rule(platform: Platform, from: string, to: string): string {
  switch (platform) {
    case 'redirects':
      return `# _redirects (Cloudflare Pages / Netlify)\n${from}  ${to}  301`;
    case 'vercel':
      return JSON.stringify({ redirects: [{ source: from, destination: to, permanent: true }] }, null, 2);
    case 'nginx':
      return `location = ${from} {\n  return 301 ${to};\n}`;
    case 'apache':
      return `# .htaccess\nRedirect 301 ${from} ${to}`;
    case 'nextjs':
      return `// next.config.js\nasync redirects() {\n  return [{ source: '${from}', destination: '${to}', permanent: true }];\n}`;
  }
}

export function RedirectSnippet({ fromUrl, toUrl }: { fromUrl: string; toUrl: string }) {
  const [platform, setPlatform] = useState<Platform>('redirects');
  const from = pathOf(fromUrl).split('?')[0];
  const to = pathOf(toUrl).split('?')[0] || '/';
  return (
    <div className="space-y-3">
      <SegmentedTabs
        value={platform}
        onChange={setPlatform}
        items={[
          { value: 'redirects', label: '_redirects' },
          { value: 'vercel', label: 'Vercel' },
          { value: 'nextjs', label: 'Next.js' },
          { value: 'nginx', label: 'Nginx' },
          { value: 'apache', label: 'Apache' },
        ]}
      />
      <CodeBlock code={rule(platform, from, to)} label="Copy redirect rule" />
    </div>
  );
}
