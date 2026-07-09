import { getRequiredSession } from "@/lib/session";
import { ScanScreen } from "@/components/scan/ScanScreen";

export default async function ScanPage() {
  const session = await getRequiredSession();
  return (
    <ScanScreen
      canOverride={session.user.role === "ADMIN"}
      sessionUserId={session.user.id}
    />
  );
}
