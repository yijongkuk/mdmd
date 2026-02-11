'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Box, Map, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useBuilderStore } from '@/features/builder/store';

const navLinks = [
  { href: '/map', label: '유휴지 탐색', icon: Map },
  { href: '/projects', label: '프로젝트', icon: FolderOpen },
];

export function Header() {
  const pathname = usePathname();
  const parcelCenter = useBuilderStore((s) => s.parcelCenter);

  const isBuilder = pathname?.startsWith('/builder');
  const isMap = pathname === '/map';

  // 빌더에서 유휴지 탐색 클릭 시 현재 필지 위치로 지도 이동
  const mapHref = isBuilder && parcelCenter
    ? `/map?lat=${parcelCenter.lat}&lng=${parcelCenter.lng}`
    : '/map';

  return (
    <header className={cn(
      'sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur',
      isBuilder && 'z-50'
    )}>
      <div className={cn(
        'mx-auto flex h-14 items-center justify-between px-4',
        !isBuilder && !isMap && 'max-w-7xl'
      )}>
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <Box className="h-6 w-6 text-blue-600" />
          <span className="text-slate-900">모두의 모듈</span>
        </Link>

        <nav className="flex items-center gap-1">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href === '/map' ? mapHref : href}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                pathname === href
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
