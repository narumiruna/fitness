import {
  Button,
  Card,
  Grid,
  Heading,
  Table,
  Text,
  TextField,
} from "@radix-ui/themes";
import { createUserAction } from "@/app/actions/users";
import { FormSelect } from "@/components/form-select";
import { requireAdmin } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";

export default async function UsersPage() {
  await requireAdmin();
  const t = await getDictionary();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
  });

  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <Heading as="h1" size="8">
            {t("users")}
          </Heading>
        </div>
      </div>
      <Grid columns={{ initial: "1", md: "2" }} gap="4">
        <Card asChild>
          <form action={createUserAction} className="form-grid">
            <Heading as="h2" size="5">
              {t("createUser")}
            </Heading>
            <Text as="label" size="2" weight="medium" className="field-label">
              {t("username")}
              <TextField.Root name="username" required />
            </Text>
            <Text as="label" size="2" weight="medium" className="field-label">
              {t("password")}
              <TextField.Root name="password" required type="password" />
            </Text>
            <Text as="label" size="2" weight="medium" className="field-label">
              {t("role")}
              <FormSelect
                name="role"
                label={t("role")}
                options={[
                  { value: "USER", label: "USER" },
                  { value: "ADMIN", label: "ADMIN" },
                ]}
              />
            </Text>
            <Button highContrast type="submit">
              {t("createUser")}
            </Button>
          </form>
        </Card>
        <Card asChild>
          <div>
            <div className="table-scroll">
              <Table.Root variant="surface">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>
                      {t("username")}
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>{t("role")}</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {users.map((user) => (
                    <Table.Row key={user.id}>
                      <Table.Cell>{user.username}</Table.Cell>
                      <Table.Cell>{user.role}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </div>
          </div>
        </Card>
      </Grid>
    </section>
  );
}
