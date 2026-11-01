'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Shell } from '@/components/Shell';
import { Card, Loading } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { canAccess, homeFor, STAFF_PANEL_ROLES } from '@/lib/nav';

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const staff = user && STAFF_PANEL_ROLES.includes(user.role);
  const allowed = staff && canAccess(user.role, pathname);

  useEffect(() => {
    if (loading) return;
    if (!user || !staff) router.replace('/login');
    else if (!allowed) router.replace(homeFor(user.role));
  }, [loading, user, staff, allowed, router]);

  if (loading || !user || !staff) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loading />
      </div>
    );
  }

  return (
    <Shell>
      {allowed ? (
        children
      ) : (
        <Card>
          <Loading text="Нет доступа к разделу, переходим…" />
        </Card>
      )}
    </Shell>
  );
}
