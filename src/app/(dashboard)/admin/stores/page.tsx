import { getRequiredAdminSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  updateStoreBrandAction,
  updateStoreDeadlineAction,
  updateStoreIdleAction,
} from "@/actions/admin";
import { CreateStoreForm } from "@/components/admin/CreateStoreForm";
import { StoreDetailsForm } from "@/components/admin/StoreDetailsForm";
import { StoreLogoForm } from "@/components/admin/StoreLogoForm";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function AdminStoresPage() {
  await getRequiredAdminSession();
  const stores = await prisma.store.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true, packages: true } } },
  });

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">Stores</h1>

      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name &amp; address</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Packages</TableHead>
                <TableHead>Idle logout</TableHead>
                <TableHead>Pickup deadline</TableHead>
                <TableHead>Brand color</TableHead>
                <TableHead>Logo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores.map((store) => (
                <TableRow key={store.id}>
                  <TableCell className="align-top">
                    <StoreDetailsForm storeId={store.id} name={store.name} address={store.address} />
                  </TableCell>
                  <TableCell className="align-top font-mono">{store.code}</TableCell>
                  <TableCell className="align-top">{store._count.users}</TableCell>
                  <TableCell>{store._count.packages}</TableCell>
                  <TableCell>
                    <form action={updateStoreIdleAction} className="flex items-center gap-2">
                      <input type="hidden" name="storeId" value={store.id} />
                      <select
                        name="sessionIdleMinutes"
                        // Remount when the saved value changes so the RSC
                        // refresh isn't masked by stale uncontrolled state.
                        key={store.sessionIdleMinutes}
                        defaultValue={store.sessionIdleMinutes}
                        aria-label={`Inactivity logout for ${store.name}`}
                        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                      >
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((min) => (
                          <option key={min} value={min}>
                            {min} min
                          </option>
                        ))}
                      </select>
                      <SubmitButton pendingText="Saving…">Save</SubmitButton>
                    </form>
                  </TableCell>
                  <TableCell>
                    <form action={updateStoreDeadlineAction} className="flex items-center gap-2">
                      <input type="hidden" name="storeId" value={store.id} />
                      <select
                        name="pickupDeadlineDays"
                        key={store.pickupDeadlineDays}
                        defaultValue={store.pickupDeadlineDays}
                        aria-label={`Pickup deadline for ${store.name}`}
                        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                      >
                        {[3, 5, 7, 10, 14, 21, 30].map((days) => (
                          <option key={days} value={days}>
                            {days} days
                          </option>
                        ))}
                      </select>
                      <SubmitButton pendingText="Saving…">Save</SubmitButton>
                    </form>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <form action={updateStoreBrandAction} className="flex items-center gap-2">
                        <input type="hidden" name="storeId" value={store.id} />
                        <input
                          type="color"
                          name="brandColor"
                          key={store.brandColor ?? "unset"}
                          defaultValue={store.brandColor ?? "#0a0a0a"}
                          aria-label={`Brand color for ${store.name}`}
                          className="size-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
                        />
                        <SubmitButton pendingText="Saving…">Save</SubmitButton>
                      </form>
                      {store.brandColor && (
                        <form action={updateStoreBrandAction}>
                          <input type="hidden" name="storeId" value={store.id} />
                          <input type="hidden" name="brandColor" value="" />
                          <SubmitButton variant="ghost" pendingText="…">Reset</SubmitButton>
                        </form>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StoreLogoForm
                      storeId={store.id}
                      storeName={store.name}
                      logoData={store.logoData}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add store</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateStoreForm />
        </CardContent>
      </Card>
    </div>
  );
}
