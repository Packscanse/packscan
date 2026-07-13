import { getRequiredSession } from "@/lib/session";
import { ScanScreen } from "@/components/scan/ScanScreen";

export default async function ScanPage() {
  const session = await getRequiredSession();
  return (
    <ScanScreen
      canOverride={(session.user.role === "ADMIN" || session.user.role === "MANAGER") && session.user.authMethod === "PASSWORD"}
      sessionUserId={session.user.id}
    />
  );
}
