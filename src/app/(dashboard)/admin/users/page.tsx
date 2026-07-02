import { getRequiredAdminSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CreateUserForm } from "@/components/admin/CreateUserForm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function AdminUsersPage() {
  await getRequiredAdminSession();
  const [users, stores] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: { store: { select: { name: true, code: true } } },
    }),
    prisma.store.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
  ]);

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">Users</h1>

      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === "ADMIN" ? "default" : "outline"}>
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.store.name} ({user.store.code})
                  </TableCell>
                  <TableCell>{user.active ? "Yes" : "No"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add user</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateUserForm stores={stores} />
        </CardContent>
      </Card>
    </div>
  );
}
