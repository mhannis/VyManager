"use client";

import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";
import { systemService, type LocalUserSummary } from "@/lib/api/system";
import {
  AlertCircle,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  UserCog,
} from "lucide-react";

function keyTextareaToList(value: string): string[] {
  const list: string[] = [];
  const seen = new Set<string>();
  for (const line of value.split("\n")) {
    const key = line.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    list.push(key);
  }
  return list;
}

function keysToTextarea(keys: string[]): string {
  return keys.join("\n");
}

export default function SystemUsersPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.SYSTEM);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [users, setUsers] = useState<LocalUserSummary[]>([]);
  const [selectedUserName, setSelectedUserName] = useState("");

  const [createUserName, setCreateUserName] = useState("");
  const [createFullName, setCreateFullName] = useState("");
  const [createLevel, setCreateLevel] = useState("admin");
  const [createPassword, setCreatePassword] = useState("");
  const [createPasswordType, setCreatePasswordType] = useState<"plaintext" | "encrypted">("plaintext");
  const [createDisabled, setCreateDisabled] = useState(false);
  const [createKeys, setCreateKeys] = useState("");

  const [editFullName, setEditFullName] = useState("");
  const [editLevel, setEditLevel] = useState("admin");
  const [editPassword, setEditPassword] = useState("");
  const [editPasswordType, setEditPasswordType] = useState<"plaintext" | "encrypted">("plaintext");
  const [editDisabled, setEditDisabled] = useState(false);
  const [editKeys, setEditKeys] = useState("");

  const selectedUser = useMemo(
    () => users.find((user) => user.username === selectedUserName) || null,
    [users, selectedUserName]
  );

  const loadData = async () => {
    try {
      setError(null);
      setRefreshing(true);
      const response = await systemService.getLocalUsers(true);
      const userList = response.users || [];
      setUsers(userList);
      if (!selectedUserName || !userList.find((user) => user.username === selectedUserName)) {
        setSelectedUserName(userList[0]?.username || "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load local users");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedUser) return;
    setEditFullName(selectedUser.full_name || "");
    setEditLevel(selectedUser.level || "admin");
    setEditDisabled(selectedUser.disabled);
    setEditKeys(keysToTextarea(selectedUser.public_keys || []));
    setEditPassword("");
    setEditPasswordType("plaintext");
  }, [selectedUserName, selectedUser]);

  const handleCreateUser = async () => {
    if (!canEdit) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await systemService.createLocalUser({
        username: createUserName.trim(),
        full_name: createFullName.trim() || null,
        level: createLevel.trim() || null,
        password: createPassword || null,
        password_type: createPasswordType,
        ssh_public_keys: keyTextareaToList(createKeys),
        disabled: createDisabled,
      });
      setSuccess(`Local user '${createUserName.trim()}' created.`);
      setCreateUserName("");
      setCreateFullName("");
      setCreateLevel("admin");
      setCreatePassword("");
      setCreatePasswordType("plaintext");
      setCreateDisabled(false);
      setCreateKeys("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create local user");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUser = async () => {
    if (!canEdit || !selectedUser) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await systemService.updateLocalUser(selectedUser.username, {
        full_name: editFullName.trim(),
        level: editLevel.trim(),
        password: editPassword.trim() ? editPassword : undefined,
        password_type: editPasswordType,
        ssh_public_keys: keyTextareaToList(editKeys),
        disabled: editDisabled,
      });
      setSuccess(`Local user '${selectedUser.username}' updated.`);
      await loadData();
      setEditPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update local user");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!canEdit || !selectedUser) return;
    if (!window.confirm(`Delete local user '${selectedUser.username}'?`)) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await systemService.deleteLocalUser(selectedUser.username);
      setSuccess(`Local user '${selectedUser.username}' deleted.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete local user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">System Users</h1>
            <p className="text-muted-foreground mt-1">
              Manage local VyOS login users under <code>system login user</code>.
            </p>
          </div>
          <Button variant="outline" onClick={loadData} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Users</p>
              <p className="mt-1 text-2xl font-bold">{users.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Enabled</p>
              <p className="mt-1 text-2xl font-bold">{users.filter((user) => !user.disabled).length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Permissions</p>
              <div className="mt-1">
                <Badge variant={canEdit ? "default" : "secondary"}>
                  {canEdit ? "Editable" : "Read-only"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-700">
            {success}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Create Local User</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Username</Label>
                <Input
                  value={createUserName}
                  onChange={(event) => setCreateUserName(event.target.value)}
                  placeholder="vyadmin"
                  disabled={!canEdit || saving}
                />
              </div>
              <div>
                <Label>Full Name</Label>
                <Input
                  value={createFullName}
                  onChange={(event) => setCreateFullName(event.target.value)}
                  placeholder="Optional display name"
                  disabled={!canEdit || saving}
                />
              </div>
              <div>
                <Label>Privilege Level</Label>
                <Input
                  value={createLevel}
                  onChange={(event) => setCreateLevel(event.target.value)}
                  placeholder="admin"
                  disabled={!canEdit || saving}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={createPassword}
                    onChange={(event) => setCreatePassword(event.target.value)}
                    placeholder="Optional when SSH keys provided"
                    disabled={!canEdit || saving}
                  />
                </div>
                <div>
                  <Label>Password Type</Label>
                  <Select
                    value={createPasswordType}
                    onValueChange={(value) => setCreatePasswordType(value as "plaintext" | "encrypted")}
                    disabled={!canEdit || saving}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="plaintext">plaintext</SelectItem>
                      <SelectItem value="encrypted">encrypted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>SSH Public Keys (one per line)</Label>
                <Textarea
                  value={createKeys}
                  onChange={(event) => setCreateKeys(event.target.value)}
                  className="min-h-[120px] font-mono text-xs"
                  placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA..."
                  disabled={!canEdit || saving}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={createDisabled}
                  onCheckedChange={(checked) => setCreateDisabled(checked === true)}
                  disabled={!canEdit || saving}
                />
                Create as disabled
              </label>
              <Button onClick={handleCreateUser} disabled={!canEdit || saving}>
                <Plus className="mr-2 h-4 w-4" />
                Create User
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Edit Local User</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Select User</Label>
                <Select value={selectedUserName || undefined} onValueChange={setSelectedUserName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select local user" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem value={user.username} key={user.username}>
                        {user.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!selectedUser ? (
                <div className="rounded-md border p-4 text-sm text-muted-foreground">
                  No local users found.
                </div>
              ) : (
                <>
                  <div>
                    <Label>Full Name</Label>
                    <Input
                      value={editFullName}
                      onChange={(event) => setEditFullName(event.target.value)}
                      disabled={!canEdit || saving}
                    />
                  </div>
                  <div>
                    <Label>Privilege Level</Label>
                    <Input
                      value={editLevel}
                      onChange={(event) => setEditLevel(event.target.value)}
                      disabled={!canEdit || saving}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <Label>New Password (optional)</Label>
                      <Input
                        type="password"
                        value={editPassword}
                        onChange={(event) => setEditPassword(event.target.value)}
                        placeholder="Leave blank to keep existing password"
                        disabled={!canEdit || saving}
                      />
                    </div>
                    <div>
                      <Label>Password Type</Label>
                      <Select
                        value={editPasswordType}
                        onValueChange={(value) => setEditPasswordType(value as "plaintext" | "encrypted")}
                        disabled={!canEdit || saving}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="plaintext">plaintext</SelectItem>
                          <SelectItem value="encrypted">encrypted</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>SSH Public Keys (one per line)</Label>
                    <Textarea
                      value={editKeys}
                      onChange={(event) => setEditKeys(event.target.value)}
                      className="min-h-[120px] font-mono text-xs"
                      disabled={!canEdit || saving}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={editDisabled}
                      onCheckedChange={(checked) => setEditDisabled(checked === true)}
                      disabled={!canEdit || saving}
                    />
                    User disabled
                  </label>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveUser} disabled={!canEdit || saving}>
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </Button>
                    <Button variant="destructive" onClick={handleDeleteUser} disabled={!canEdit || saving}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Local User Inventory</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading users...</div>
            ) : users.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No local users configured.</div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Full Name</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Password</TableHead>
                      <TableHead>SSH Keys</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.username}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <UserCog className="h-4 w-4 text-primary" />
                            <span className="font-mono">{user.username}</span>
                          </div>
                        </TableCell>
                        <TableCell>{user.full_name || "-"}</TableCell>
                        <TableCell>{user.level || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={user.disabled ? "secondary" : "default"}>
                            {user.disabled ? "Disabled" : "Enabled"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.auth.has_plaintext_password && (
                              <Badge variant="outline">plaintext</Badge>
                            )}
                            {user.auth.has_encrypted_password && (
                              <Badge variant="outline">encrypted</Badge>
                            )}
                            {!user.auth.has_plaintext_password && !user.auth.has_encrypted_password && (
                              <Badge variant="secondary">none</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            <KeyRound className="mr-1 h-3 w-3" />
                            {user.public_keys?.length || user.public_key_names.length}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
