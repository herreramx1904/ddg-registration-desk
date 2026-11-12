import type { DeskGuest, GuestType } from "@/lib/domain/types";
import { Badge, IconAccess, IconStar, type BadgeVariant } from "@/components/ui";
import { accessFlags, timeOf, vipFlag } from "./search";

const typeVariant: Record<GuestType, BadgeVariant> = {
  Customer: "neutral",
  Partner: "info",
  VIP: "vip",
  Internal: "neutral",
  Press: "brand",
  Speaker: "brand",
  Unknown: "neutral",
};

/** Type badge + VIP/accessibility badges (VIP type and VIP flag collapse into one badge). */
export function TypeAndWarningBadges({ g, size = "sm" }: { g: DeskGuest; size?: "sm" | "md" }) {
  const vip = vipFlag(g);
  const access = accessFlags(g);
  return (
    <>
      {!(vip && g.guestType === "VIP") && g.guestType !== "Unknown" && (
        <Badge size={size} variant={typeVariant[g.guestType]}>{g.guestType}</Badge>
      )}
      {vip && <Badge size={size} variant="vip" solid icon={<IconStar size={12} />}>VIP</Badge>}
      {access.map((f, i) => (
        <Badge key={i} size={size} variant="access" solid icon={<IconAccess size={12} />}>{f.label}</Badge>
      ))}
    </>
  );
}

/** Status pill: green "In 11:42", amber "Cancelled", red "Do not admit". Null when simply expected. */
export function StatusBadge({ g, size = "sm" }: { g: DeskGuest; size?: "sm" | "md" }) {
  if (g.checkedIn) return <Badge size={size} variant="ok" solid>In {timeOf(g.checkedIn.at)}</Badge>;
  if (g.status === "do_not_admit") return <Badge size={size} variant="danger" solid>Do not admit</Badge>;
  if (g.status === "cancelled") return <Badge size={size} variant="warn" solid>Cancelled</Badge>;
  return null;
}
