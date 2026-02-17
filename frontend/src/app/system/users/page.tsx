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
import {
  systemService,
  type LocalUserSummary,
  type LoginConfigResponse,
  type LoginAuthServerConfig,
} from "@/lib/api/system";
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

function parseOptionalBoundedInteger(value: string, fieldLabel: string): number | null {
  const text = value.trim();
  if (!text) return null;
  if (!/^\d+$/.test(text)) {
    throw new Error(`${fieldLabel} must be a whole number.`);
  }
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${fieldLabel} must be between 1 and 65535.`);
  }
  return parsed;
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function isRouteNotFoundError(error: unknown): boolean {
  const status = getErrorStatus(error);
  const message = getErrorMessage(error, "").trim().toLowerCase();
  return status === 404 && (message === "not found" || message === "404 not found");
}

interface LoginServerFormState {
  address: string;
  key: string;
  port: string;
  timeout: string;
  disabled: boolean;
}

const EMPTY_LOGIN_SERVER: LoginServerFormState = {
  address: "",
  key: "",
  port: "",
  timeout: "",
  disabled: false,
};

const EMPTY_LOGIN_CONFIG: LoginConfigResponse = {
  configured: false,
  banner_pre_login: "",
  banner_post_login: "",
  max_sessions_per_user: null,
  timeout: null,
  radius_source_address: "",
  radius_vrf: "",
  tacacs_source_address: "",
  tacacs_vrf: "",
  radius_servers: [],
  tacacs_servers: [],
};

function toServerForm(entry: LoginAuthServerConfig): LoginServerFormState {
  return {
    address: entry.address || "",
    key: entry.key || "",
    port: typeof entry.port === "number" ? String(entry.port) : "",
    timeout: typeof entry.timeout === "number" ? String(entry.timeout) : "",
    disabled: entry.disabled === true,
  };
}

function normalizeLoginServerRows(
  rows: LoginServerFormState[],
  fieldName: "RADIUS" | "TACACS",
): LoginAuthServerConfig[] {
  const dedupe = new Map<string, LoginAuthServerConfig>();
  for (const row of rows) {
    const address = row.address.trim();
    const key = row.key.trim();
    const portText = row.port.trim();
    const timeoutText = row.timeout.trim();
    if (!address && !key && !portText && !timeoutText) continue;
    if (!address) throw new Error(`${fieldName} server address is required.`);
    if (!key) throw new Error(`${fieldName} server '${address}' requires key.`);

    let port: number | null = null;
    if (portText) {
      if (!/^\d+$/.test(portText)) throw new Error(`${fieldName} server '${address}' port must be a whole number.`);
      port = Number(portText);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`${fieldName} server '${address}' port must be between 1 and 65535.`);
      }
    }

    let timeout: number | null = null;
    if (timeoutText) {
      if (!/^\d+$/.test(timeoutText)) {
        throw new Error(`${fieldName} server '${address}' timeout must be a whole number.`);
      }
      timeout = Number(timeoutText);
      if (!Number.isInteger(timeout) || timeout < 1 || timeout > 65535) {
        throw new Error(`${fieldName} server '${address}' timeout must be between 1 and 65535.`);
      }
    }

    dedupe.set(address, { address, key, port, timeout, disabled: row.disabled === true });
  }
  return Array.from(dedupe.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([, entry]) => entry);
}

export default function SystemUsersPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.SYSTEM);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingLoginConfig, setSavingLoginConfig] = useState(false);
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
  const [createPrincipal, setCreatePrincipal] = useState("");
  const [createOtpKey, setCreateOtpKey] = useState("");
  const [createOtpRateLimit, setCreateOtpRateLimit] = useState("");
  const [createOtpWindowSize, setCreateOtpWindowSize] = useState("");
  const [createKeys, setCreateKeys] = useState("");

  const [editFullName, setEditFullName] = useState("");
  const [editLevel, setEditLevel] = useState("admin");
  const [editPassword, setEditPassword] = useState("");
  const [editPasswordType, setEditPasswordType] = useState<"plaintext" | "encrypted">("plaintext");
  const [editDisabled, setEditDisabled] = useState(false);
  const [editPrincipal, setEditPrincipal] = useState("");
  const [editOtpKey, setEditOtpKey] = useState("");
  const [editOtpRateLimit, setEditOtpRateLimit] = useState("");
  const [editOtpWindowSize, setEditOtpWindowSize] = useState("");
  const [editKeys, setEditKeys] = useState("");

  const [loginConfig, setLoginConfig] = useState<LoginConfigResponse | null>(null);
  const [loginConfigUnavailable, setLoginConfigUnavailable] = useState<string | null>(null);
  const [bannerPreLogin, setBannerPreLogin] = useState("");
  const [bannerPostLogin, setBannerPostLogin] = useState("");
  const [maxSessionsPerUser, setMaxSessionsPerUser] = useState("");
  const [loginTimeout, setLoginTimeout] = useState("");
  const [radiusSourceAddress, setRadiusSourceAddress] = useState("");
  const [radiusVrf, setRadiusVrf] = useState("");
  const [tacacsSourceAddress, setTacacsSourceAddress] = useState("");
  const [tacacsVrf, setTacacsVrf] = useState("");
  const [radiusServers, setRadiusServers] = useState<LoginServerFormState[]>([]);
  const [tacacsServers, setTacacsServers] = useState<LoginServerFormState[]>([]);

  const selectedUser = useMemo(
    () => users.find((user) => user.username === selectedUserName) || null,
    [users, selectedUserName]
  );

  const syncLoginForm = (response: LoginConfigResponse) => {
    setLoginConfig(response);
    setBannerPreLogin(response.banner_pre_login || "");
    setBannerPostLogin(response.banner_post_login || "");
    setMaxSessionsPerUser(
      typeof response.max_sessions_per_user === "number"
        ? String(response.max_sessions_per_user)
        : ""
    );
    setLoginTimeout(typeof response.timeout === "number" ? String(response.timeout) : "");
    setRadiusSourceAddress(response.radius_source_address || "");
    setRadiusVrf(response.radius_vrf || "");
    setTacacsSourceAddress(response.tacacs_source_address || "");
    setTacacsVrf(response.tacacs_vrf || "");
    setRadiusServers((response.radius_servers || []).map(toServerForm));
    setTacacsServers((response.tacacs_servers || []).map(toServerForm));
  };

  const loadData = async () => {
    try {
      setError(null);
      setLoginConfigUnavailable(null);
      setRefreshing(true);
      const [usersResult, loginResult] = await Promise.allSettled([
        systemService.getLocalUsers(true),
        systemService.getLoginConfig(true),
      ]);

      const errors: string[] = [];

      if (usersResult.status === "fulfilled") {
        const userList = usersResult.value.users || [];
        setUsers(userList);
        if (!selectedUserName || !userList.find((user) => user.username === selectedUserName)) {
          setSelectedUserName(userList[0]?.username || "");
        }
      } else {
        errors.push(getErrorMessage(usersResult.reason, "Failed to load local users."));
      }

      if (loginResult.status === "fulfilled") {
        syncLoginForm(loginResult.value);
      } else if (isRouteNotFoundError(loginResult.reason)) {
        syncLoginForm(EMPTY_LOGIN_CONFIG);
        setLoginConfigUnavailable(
          "Global login authentication endpoint is unavailable on this backend build. Local user management is still available."
        );
      } else {
        errors.push(getErrorMessage(loginResult.reason, "Failed to load global login configuration."));
      }

      if (errors.length > 0) {
        setError(errors.join(" "));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user/login configuration");
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
    setEditPrincipal(selectedUser.principal || "");
    setEditOtpKey("");
    setEditOtpRateLimit(selectedUser.otp_rate_limit ? String(selectedUser.otp_rate_limit) : "");
    setEditOtpWindowSize(selectedUser.otp_window_size ? String(selectedUser.otp_window_size) : "");
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
      const otpRateLimit = parseOptionalBoundedInteger(createOtpRateLimit, "OTP rate-limit");
      const otpWindowSize = parseOptionalBoundedInteger(createOtpWindowSize, "OTP window-size");
      if ((otpRateLimit !== null || otpWindowSize !== null) && !createOtpKey.trim()) {
        throw new Error("OTP key is required when OTP rate-limit or window-size is provided.");
      }

      await systemService.createLocalUser({
        username: createUserName.trim(),
        full_name: createFullName.trim() || null,
        level: createLevel.trim() || null,
        password: createPassword || null,
        password_type: createPasswordType,
        ssh_public_keys: keyTextareaToList(createKeys),
        disabled: createDisabled,
        principal: createPrincipal.trim() || null,
        otp_key: createOtpKey.trim() || null,
        otp_rate_limit: otpRateLimit,
        otp_window_size: otpWindowSize,
      });
      setSuccess(`Local user '${createUserName.trim()}' created.`);
      setCreateUserName("");
      setCreateFullName("");
      setCreateLevel("admin");
      setCreatePassword("");
      setCreatePasswordType("plaintext");
      setCreateDisabled(false);
      setCreatePrincipal("");
      setCreateOtpKey("");
      setCreateOtpRateLimit("");
      setCreateOtpWindowSize("");
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
      const otpRateLimit = parseOptionalBoundedInteger(editOtpRateLimit, "OTP rate-limit");
      const otpWindowSize = parseOptionalBoundedInteger(editOtpWindowSize, "OTP window-size");

      await systemService.updateLocalUser(selectedUser.username, {
        full_name: editFullName.trim(),
        level: editLevel.trim(),
        password: editPassword.trim() ? editPassword : undefined,
        password_type: editPasswordType,
        ssh_public_keys: keyTextareaToList(editKeys),
        disabled: editDisabled,
        principal: editPrincipal.trim(),
        otp_key: editOtpKey.trim(),
        otp_rate_limit: otpRateLimit,
        otp_window_size: otpWindowSize,
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

  const updateServerRow = (
    collection: "radius" | "tacacs",
    index: number,
    key: keyof LoginServerFormState,
    value: string | boolean,
  ) => {
    const updater =
      collection === "radius" ? setRadiusServers : setTacacsServers;
    updater((previous) =>
      previous.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row))
    );
  };

  const addServerRow = (collection: "radius" | "tacacs") => {
    const updater = collection === "radius" ? setRadiusServers : setTacacsServers;
    updater((previous) => [...previous, { ...EMPTY_LOGIN_SERVER }]);
  };

  const removeServerRow = (collection: "radius" | "tacacs", index: number) => {
    const updater = collection === "radius" ? setRadiusServers : setTacacsServers;
    updater((previous) => previous.filter((_, rowIndex) => rowIndex !== index));
  };

  const handleSaveLoginConfig = async () => {
    if (!canEdit) return;
    if (loginConfigUnavailable) {
      setError(loginConfigUnavailable);
      setSuccess(null);
      return;
    }

    setSavingLoginConfig(true);
    setError(null);
    setSuccess(null);
    try {
      const parsedMaxSessions = maxSessionsPerUser.trim()
        ? parseOptionalBoundedInteger(maxSessionsPerUser, "Max sessions per user")
        : null;
      const parsedTimeout = loginTimeout.trim()
        ? parseOptionalBoundedInteger(loginTimeout, "Session timeout")
        : null;

      const payload = {
        banner_pre_login: bannerPreLogin,
        banner_post_login: bannerPostLogin,
        max_sessions_per_user: parsedMaxSessions,
        timeout: parsedTimeout,
        radius_source_address: radiusSourceAddress.trim() || null,
        radius_vrf: radiusVrf.trim() || null,
        tacacs_source_address: tacacsSourceAddress.trim() || null,
        tacacs_vrf: tacacsVrf.trim() || null,
        radius_servers: normalizeLoginServerRows(radiusServers, "RADIUS"),
        tacacs_servers: normalizeLoginServerRows(tacacsServers, "TACACS"),
      };

      const response = await systemService.updateLoginConfig(payload);
      syncLoginForm(response);
      setSuccess("Global login authentication settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save login configuration");
    } finally {
      setSavingLoginConfig(false);
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
              <details className="rounded-md border border-border/60 p-3">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  Advanced Authentication
                </summary>
                <div className="mt-3 grid gap-3">
                  <div>
                    <Label>Principal</Label>
                    <Input
                      value={createPrincipal}
                      onChange={(event) => setCreatePrincipal(event.target.value)}
                      placeholder="user@realm.example"
                      disabled={!canEdit || saving}
                    />
                  </div>
                  <div>
                    <Label>OTP Key</Label>
                    <Input
                      value={createOtpKey}
                      onChange={(event) => setCreateOtpKey(event.target.value)}
                      placeholder="Shared secret"
                      disabled={!canEdit || saving}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>OTP Rate Limit</Label>
                      <Input
                        value={createOtpRateLimit}
                        onChange={(event) => setCreateOtpRateLimit(event.target.value)}
                        placeholder="30"
                        disabled={!canEdit || saving}
                      />
                    </div>
                    <div>
                      <Label>OTP Window Size</Label>
                      <Input
                        value={createOtpWindowSize}
                        onChange={(event) => setCreateOtpWindowSize(event.target.value)}
                        placeholder="6"
                        disabled={!canEdit || saving}
                      />
                    </div>
                  </div>
                </div>
              </details>
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
                  <details className="rounded-md border border-border/60 p-3">
                    <summary className="cursor-pointer text-sm font-medium text-foreground">
                      Advanced Authentication
                    </summary>
                    <div className="mt-3 grid gap-3">
                      <div>
                        <Label>Principal</Label>
                        <Input
                          value={editPrincipal}
                          onChange={(event) => setEditPrincipal(event.target.value)}
                          placeholder="user@realm.example"
                          disabled={!canEdit || saving}
                        />
                      </div>
                      <div>
                        <Label>OTP Key</Label>
                        <Input
                          value={editOtpKey}
                          onChange={(event) => setEditOtpKey(event.target.value)}
                          placeholder={
                            selectedUser?.otp_key_configured ? "Configured (set new value to rotate)" : "Shared secret"
                          }
                          disabled={!canEdit || saving}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label>OTP Rate Limit</Label>
                          <Input
                            value={editOtpRateLimit}
                            onChange={(event) => setEditOtpRateLimit(event.target.value)}
                            placeholder="30"
                            disabled={!canEdit || saving}
                          />
                        </div>
                        <div>
                          <Label>OTP Window Size</Label>
                          <Input
                            value={editOtpWindowSize}
                            onChange={(event) => setEditOtpWindowSize(event.target.value)}
                            placeholder="6"
                            disabled={!canEdit || saving}
                          />
                        </div>
                      </div>
                    </div>
                  </details>
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
            <CardTitle className="text-base flex items-center gap-2">
              Global Login Authentication
              <Badge variant={loginConfig?.configured ? "default" : "secondary"}>
                {loginConfig?.configured ? "Configured" : "Default"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loginConfigUnavailable ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
                {loginConfigUnavailable}
              </div>
            ) : (
              <>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Max Sessions Per User</Label>
                <Input
                  value={maxSessionsPerUser}
                  onChange={(event) => setMaxSessionsPerUser(event.target.value)}
                  placeholder="Optional"
                  disabled={!canEdit || saving || savingLoginConfig}
                />
              </div>
              <div>
                <Label>Session Timeout</Label>
                <Input
                  value={loginTimeout}
                  onChange={(event) => setLoginTimeout(event.target.value)}
                  placeholder="Optional"
                  disabled={!canEdit || saving || savingLoginConfig}
                />
              </div>
              <div>
                <Label>RADIUS Source Address</Label>
                <Input
                  value={radiusSourceAddress}
                  onChange={(event) => setRadiusSourceAddress(event.target.value)}
                  placeholder="Optional IPv4/IPv6 address"
                  disabled={!canEdit || saving || savingLoginConfig}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>RADIUS VRF</Label>
                <Input
                  value={radiusVrf}
                  onChange={(event) => setRadiusVrf(event.target.value)}
                  placeholder="Optional VRF name"
                  disabled={!canEdit || saving || savingLoginConfig}
                />
              </div>
              <div>
                <Label>TACACS Source Address</Label>
                <Input
                  value={tacacsSourceAddress}
                  onChange={(event) => setTacacsSourceAddress(event.target.value)}
                  placeholder="Optional IPv4/IPv6 address"
                  disabled={!canEdit || saving || savingLoginConfig}
                />
              </div>
              <div>
                <Label>TACACS VRF</Label>
                <Input
                  value={tacacsVrf}
                  onChange={(event) => setTacacsVrf(event.target.value)}
                  placeholder="Optional VRF name"
                  disabled={!canEdit || saving || savingLoginConfig}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Pre-login Banner</Label>
                <Textarea
                  value={bannerPreLogin}
                  onChange={(event) => setBannerPreLogin(event.target.value)}
                  className="min-h-[90px]"
                  placeholder="Shown before authentication"
                  disabled={!canEdit || saving || savingLoginConfig}
                />
              </div>
              <div>
                <Label>Post-login Banner</Label>
                <Textarea
                  value={bannerPostLogin}
                  onChange={(event) => setBannerPostLogin(event.target.value)}
                  className="min-h-[90px]"
                  placeholder="Shown after authentication"
                  disabled={!canEdit || saving || savingLoginConfig}
                />
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
              <div className="rounded-md border border-border/60 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">RADIUS Servers</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addServerRow("radius")}
                    disabled={!canEdit || saving || savingLoginConfig}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add
                  </Button>
                </div>
                {radiusServers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No RADIUS servers configured.</p>
                ) : (
                  <div className="space-y-2">
                    {radiusServers.map((row, index) => (
                      <div key={`radius-${index}`} className="grid gap-2 md:grid-cols-12">
                        <Input
                          value={row.address}
                          onChange={(event) => updateServerRow("radius", index, "address", event.target.value)}
                          placeholder="Address"
                          className="md:col-span-3"
                          disabled={!canEdit || saving || savingLoginConfig}
                        />
                        <Input
                          value={row.key}
                          onChange={(event) => updateServerRow("radius", index, "key", event.target.value)}
                          placeholder="Shared key"
                          className="md:col-span-3"
                          disabled={!canEdit || saving || savingLoginConfig}
                        />
                        <Input
                          value={row.port}
                          onChange={(event) => updateServerRow("radius", index, "port", event.target.value)}
                          placeholder="Port"
                          className="md:col-span-2"
                          disabled={!canEdit || saving || savingLoginConfig}
                        />
                        <Input
                          value={row.timeout}
                          onChange={(event) => updateServerRow("radius", index, "timeout", event.target.value)}
                          placeholder="Timeout"
                          className="md:col-span-2"
                          disabled={!canEdit || saving || savingLoginConfig}
                        />
                        <label className="md:col-span-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <Checkbox
                            checked={row.disabled}
                            onCheckedChange={(checked) =>
                              updateServerRow("radius", index, "disabled", checked === true)
                            }
                            disabled={!canEdit || saving || savingLoginConfig}
                          />
                          Disabled
                        </label>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeServerRow("radius", index)}
                          disabled={!canEdit || saving || savingLoginConfig}
                          className="md:col-span-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-md border border-border/60 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">TACACS Servers</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addServerRow("tacacs")}
                    disabled={!canEdit || saving || savingLoginConfig}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add
                  </Button>
                </div>
                {tacacsServers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No TACACS servers configured.</p>
                ) : (
                  <div className="space-y-2">
                    {tacacsServers.map((row, index) => (
                      <div key={`tacacs-${index}`} className="grid gap-2 md:grid-cols-12">
                        <Input
                          value={row.address}
                          onChange={(event) => updateServerRow("tacacs", index, "address", event.target.value)}
                          placeholder="Address"
                          className="md:col-span-3"
                          disabled={!canEdit || saving || savingLoginConfig}
                        />
                        <Input
                          value={row.key}
                          onChange={(event) => updateServerRow("tacacs", index, "key", event.target.value)}
                          placeholder="Shared key"
                          className="md:col-span-3"
                          disabled={!canEdit || saving || savingLoginConfig}
                        />
                        <Input
                          value={row.port}
                          onChange={(event) => updateServerRow("tacacs", index, "port", event.target.value)}
                          placeholder="Port"
                          className="md:col-span-2"
                          disabled={!canEdit || saving || savingLoginConfig}
                        />
                        <Input
                          value={row.timeout}
                          onChange={(event) => updateServerRow("tacacs", index, "timeout", event.target.value)}
                          placeholder="Timeout"
                          className="md:col-span-2"
                          disabled={!canEdit || saving || savingLoginConfig}
                        />
                        <label className="md:col-span-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <Checkbox
                            checked={row.disabled}
                            onCheckedChange={(checked) =>
                              updateServerRow("tacacs", index, "disabled", checked === true)
                            }
                            disabled={!canEdit || saving || savingLoginConfig}
                          />
                          Disabled
                        </label>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeServerRow("tacacs", index)}
                          disabled={!canEdit || saving || savingLoginConfig}
                          className="md:col-span-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <Button onClick={handleSaveLoginConfig} disabled={!canEdit || saving || savingLoginConfig}>
              <Save className="mr-2 h-4 w-4" />
              {savingLoginConfig ? "Saving..." : "Save Login Settings"}
            </Button>
              </>
            )}
          </CardContent>
        </Card>

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
                      <TableHead>Principal</TableHead>
                      <TableHead>OTP</TableHead>
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
                        <TableCell className="font-mono text-xs">
                          {user.principal || "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.otp_key_configured && <Badge variant="outline">key</Badge>}
                            {typeof user.otp_rate_limit === "number" && (
                              <Badge variant="outline">rate {user.otp_rate_limit}</Badge>
                            )}
                            {typeof user.otp_window_size === "number" && (
                              <Badge variant="outline">window {user.otp_window_size}</Badge>
                            )}
                            {!user.otp_key_configured &&
                              typeof user.otp_rate_limit !== "number" &&
                              typeof user.otp_window_size !== "number" && (
                                <Badge variant="secondary">none</Badge>
                              )}
                          </div>
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
