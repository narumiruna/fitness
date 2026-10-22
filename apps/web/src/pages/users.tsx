import {
  Button,
  Card,
  Heading,
  Table,
  Text,
  TextField,
} from "@radix-ui/themes";
import { createUserAction } from "@/api/actions";
import { usePageView } from "@/api/views";
import { ActionForm } from "@/components/action-form";
import { FormSelect } from "@/components/form-select";
import { useDictionary } from "@/lib/i18n";

export default function UsersPage() {
  const { users } = usePageView("users");
  const t = useDictionary();
  return (
    <section className="stack">
      <div className="page-header">
        <div>
          <Heading as="h1" size="8">
            {t("users")}
          </Heading>
        </div>
      </div>

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
                  <Table.Row key={user?.id}>
                    <Table.Cell>{user.username}</Table.Cell>
                    <Table.Cell>
                      {t(user.role === "ADMIN" ? "roleAdmin" : "roleUser")}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </div>
        </div>
      </Card>
      <details className="admin-create">
        <summary>{t("createUser")}</summary>
        <Card asChild>
          <ActionForm
            action={createUserAction}
            className="form-grid"
            resetOnSuccess
          >
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
                  { value: "USER", label: t("roleUser") },
                  { value: "ADMIN", label: t("roleAdmin") },
                ]}
              />
            </Text>
            <Button highContrast type="submit">
              {t("createUser")}
            </Button>
          </ActionForm>
        </Card>
      </details>
    </section>
  );
}
