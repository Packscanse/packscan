import Link from "next/link";
import { format } from "date-fns";
import { getRequiredSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hourProfileUtc } from "@/lib/reports";
import { carrierLabel } from "@/lib/carriers";
import { getT } from "@/lib/i18n/server";
import { PreAdviceImportForm } from "@/components/admin/PreAdviceImportForm";
import { ShelfChip } from "@/components/shelf/ShelfBlock";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * What the carriers announced as inbound — reframed as "today's truck":
 * what's still on it, what already arrived, and (when history says so)
 * when the van usually shows up. The import form (admin) is the manual
 * seam until carrier API feeds exist.
 */
export default async function ExpectedPage() {
  const session = await getRequiredSession();
  const t = await getT();
  const storeId = session.user.storeId;

  const [announced, receivedToday, hourBuckets] = await Promise.all([
    prisma.preAdvice.findMany({
      where: { storeId, status: "ANNOUNCED" },
      orderBy: { announcedAt: "asc" },
      take: 200,
    }),
    prisma.preAdvice.findMany({
      where: {
        storeId,
        status: "RECEIVED",
        receivedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      orderBy: { receivedAt: "desc" },
      take: 100,
    }),
    hourProfileUtc(new Date(Date.now() - 30 * 86_400_000), storeId),
  ]);

  // Where each received parcel went — for the shelf chip on its row.
  const packageIds = receivedToday
    .map((advice) => advice.packageId)
    .filter((id): id is string => Boolean(id));
  const shelfById = new Map(
    (packageIds.length > 0
      ? await prisma.package.findMany({
          where: { id: { in: packageIds } },
          select: { id: true, shelfLocation: true },
        })
      : []
    ).map((pkg) => [pkg.id, pkg.shelfLocation])
  );

  // "The van usually comes ~10:00" — the modal arrival hour over 30 days.
  // Only claimed once there is enough history to mean something.
  const tzShift = Math.round(-new Date().getTimezoneOffset() / 60);
  const receivedByHour = Array.from({ length: 24 }, () => 0);
  let samples = 0;
  for (const bucket of hourBuckets) {
    const hour = (bucket.hour + tzShift + 24) % 24;
    receivedByHour[hour] += bucket.received;
    samples += bucket.received;
  }
  const peak = Math.max(...receivedByHour);
  const vanHour = receivedByHour.indexOf(peak);
  const showVan = samples >= 10 && peak > 2;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight">{t.expected.title}</h1>
        <p className="text-sm text-muted-foreground">
          {t.expected.meta
            .replace("{announced}", String(announced.length))
            .replace("{received}", String(receivedToday.length))}
          {showVan &&
            ` · ${t.expected.vanUsually.replace(
              "{time}",
              `${String(vanHour).padStart(2, "0")}:00`
            )}`}
        </p>
      </div>

      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[15px] font-bold">
              <span aria-hidden className="size-2.5 rounded-full bg-warn" />
              {t.expected.stillOnTruck.replace("{count}", String(announced.length))}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5">
            {announced.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.expected.nothingOutstanding}</p>
            ) : (
              announced.map((advice) => (
                <div
                  key={advice.id}
                  className="flex items-center gap-3 rounded-[12px] bg-muted px-3 py-2.5 text-sm"
                >
                  <span className="min-w-24 truncate font-semibold">
                    {advice.customerName ?? "—"}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {carrierLabel(advice.carrier, t)}
                  </span>
                  <span className="ml-auto truncate font-mono text-xs text-faint">
                    …{advice.trackingNumber.slice(-6)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[15px] font-bold">
              <span aria-hidden className="size-2.5 rounded-full bg-ok" />
              {t.expected.receivedToday.replace("{count}", String(receivedToday.length))}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5">
            {receivedToday.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              receivedToday.map((advice) => {
                const row = (
                  <div className="flex items-center gap-3 rounded-[12px] bg-muted px-3 py-2 text-sm">
                    <ShelfChip
                      code={advice.packageId ? (shelfById.get(advice.packageId) ?? null) : null}
                      size="desktop"
                    />
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {advice.customerName ?? advice.trackingNumber}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {advice.receivedAt ? format(advice.receivedAt, "HH:mm") : ""}
                    </span>
                  </div>
                );
                return advice.packageId ? (
                  <Link key={advice.id} href={`/packages/${advice.packageId}`}>
                    {row}
                  </Link>
                ) : (
                  <div key={advice.id}>{row}</div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {session.user.role === "ADMIN" && (
        <div className="grid gap-2 rounded-[20px] border-2 border-dashed border-dash p-5">
          <p className="text-[15px] font-bold">{t.expected.importTitle}</p>
          <p className="text-[13px] text-muted-foreground">{t.expected.importHint}</p>
          <PreAdviceImportForm storeId={storeId} />
        </div>
      )}
    </div>
  );
}
