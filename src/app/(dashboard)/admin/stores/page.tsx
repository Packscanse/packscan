import { prisma } from "@/lib/prisma";
import { CreateStoreForm } from "@/components/admin/CreateStoreForm";
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
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Packages</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores.map((store) => (
                <TableRow key={store.id}>
                  <TableCell>{store.name}</TableCell>
                  <TableCell className="font-mono">{store.code}</TableCell>
                  <TableCell>{store.address ?? "—"}</TableCell>
                  <TableCell>{store._count.users}</TableCell>
                  <TableCell>{store._count.packages}</TableCell>
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
