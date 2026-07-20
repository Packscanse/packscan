import { getRequiredManagerSession, managedStoreId } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CreateUserForm } from "@/components/admin/CreateUserForm";
import { UserActions } from "@/components/admin/UserActions";
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
  const session = await getRequiredManagerSession();
  const scope = managedStoreId(session);
  const isAdmin = session.user.role === "ADMIN";
  const [users, stores] = await Promise.all([
    prisma.user.findMany({
      where: scope ? { storeId: scope } : undefined,
      orderBy: { createdAt: "asc" },
      include: { store: { select: { name: true, code: true } } },
    }),
    prisma.store.findMany({
      where: scope ? { id: scope } : undefined,
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
                <TableHead>App sign-in #</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="align-top">{user.email}</TableCell>
                  <TableCell className="align-top">
                    {user.name}
                    {user.id === session.user.id && (
                      <span className="text-muted-foreground"> (you)</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top font-mono">
                    {user.loginNumber ?? "—"}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant={user.role === "ADMIN" ? "secondary" : "outline"}>
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top">
                    {user.store.name} ({user.store.code})
                  </TableCell>
                  <TableCell className="align-top">{user.active ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    {!isAdmin && user.role === "ADMIN" ? (
                      <p className="text-xs text-muted-foreground">Managed by chain admin</p>
                    ) : (
                      <UserActions
                        userId={user.id}
                        role={user.role}
                        active={user.active}
                        isSelf={user.id === session.user.id}
                        storeId={user.storeId}
                        stores={stores}
                        actorIsAdmin={isAdmin}
                      />
                    )}
                  </TableCell>
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
          <CreateUserForm stores={stores} canCreateAdmin={isAdmin} />
        </CardContent>
      </Card>
    </div>
  );
}
