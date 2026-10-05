"use client";

import { Card, ListRow, Sheet } from "@/components/ui";
import { MORE_LINKS } from "@/lib/nav";

/**
 * Everything that is not a tab and not an icon in Today's header. Opened by
 * the More button there. Today loads this file on first use.
 */
export function MoreSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet open onClose={onClose} title="More">
      <Card padded={false} raised className="mb-2 overflow-hidden">
        <nav aria-label="More" className="divide-y divide-line">
          {MORE_LINKS.map((l) => {
            const Icon = l.icon;
            return <ListRow key={l.href} href={l.href} left={<Icon size={20} aria-hidden />} title={l.label} sub={l.sub} />;
          })}
        </nav>
      </Card>
    </Sheet>
  );
}
