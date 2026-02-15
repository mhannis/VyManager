"use client";

import { useCallback, useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { pkiApi } from "@/lib/api/pki";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";

type CaEntry = {
  name: string;
  certificatePath: string;
  privateKeyPath: string;
  passphrase: string;
};

type CertificateEntry = {
  name: string;
  certificatePath: string;
  privateKeyPath: string;
};

const EMPTY_CA_DRAFT: CaEntry = {
  name: "",
  certificatePath: "",
  privateKeyPath: "",
  passphrase: "",
};

const EMPTY_CERT_DRAFT: CertificateEntry = {
  name: "",
  certificatePath: "",
  privateKeyPath: "",
};

function normalizeText(value: string): string {
  return value.trim();
}

function caEqual(left: CaEntry, right: CaEntry): boolean {
  return (
    left.name === right.name &&
    left.certificatePath === right.certificatePath &&
    left.privateKeyPath === right.privateKeyPath &&
    left.passphrase === right.passphrase
  );
}

function certEqual(left: CertificateEntry, right: CertificateEntry): boolean {
  return (
    left.name === right.name &&
    left.certificatePath === right.certificatePath &&
    left.privateKeyPath === right.privateKeyPath
  );
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function readPrivateKeyPath(root: Record<string, unknown>): string {
  const privateRoot = asObject(root.private);
  const key = privateRoot.key;
  if (typeof key === "string") {
    return normalizeText(key);
  }
  return "";
}

function readPassphrase(root: Record<string, unknown>): string {
  const privateRoot = asObject(root.private);
  const passphrase = privateRoot.password;
  if (typeof passphrase === "string") {
    return normalizeText(passphrase);
  }
  return "";
}

export default function PkiPage() {
  const { canWrite } = usePermissions();
  const canEdit = canWrite(FeatureGroup.SYSTEM);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [cas, setCas] = useState<CaEntry[]>([]);
  const [certificates, setCertificates] = useState<CertificateEntry[]>([]);

  const [currentCas, setCurrentCas] = useState<CaEntry[]>([]);
  const [currentCertificates, setCurrentCertificates] = useState<CertificateEntry[]>([]);

  const [caDraft, setCaDraft] = useState<CaEntry>(EMPTY_CA_DRAFT);
  const [certDraft, setCertDraft] = useState<CertificateEntry>(EMPTY_CERT_DRAFT);

  const loadData = useCallback(async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);

      const config = await pkiApi.getConfig<Record<string, unknown>>(refresh);
      const caRoot = asObject(config.ca);
      const certRoot = asObject(config.certificate);

      const parsedCas = Object.entries(caRoot)
        .map(([name, value]) => {
          const root = asObject(value);
          return {
            name: normalizeText(name),
            certificatePath: normalizeText(String(root.certificate ?? "")),
            privateKeyPath: readPrivateKeyPath(root),
            passphrase: readPassphrase(root),
          };
        })
        .filter((entry) => entry.name)
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));

      const parsedCertificates = Object.entries(certRoot)
        .map(([name, value]) => {
          const root = asObject(value);
          return {
            name: normalizeText(name),
            certificatePath: normalizeText(String(root.certificate ?? "")),
            privateKeyPath: readPrivateKeyPath(root),
          };
        })
        .filter((entry) => entry.name)
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));

      setCas(parsedCas);
      setCertificates(parsedCertificates);
      setCurrentCas(parsedCas);
      setCurrentCertificates(parsedCertificates);
      setCaDraft(EMPTY_CA_DRAFT);
      setCertDraft(EMPTY_CERT_DRAFT);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load PKI configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const addCa = () => {
    setError(null);

    const entry: CaEntry = {
      name: normalizeText(caDraft.name),
      certificatePath: normalizeText(caDraft.certificatePath),
      privateKeyPath: normalizeText(caDraft.privateKeyPath),
      passphrase: normalizeText(caDraft.passphrase),
    };

    if (!entry.name) {
      setError("CA name is required.");
      return;
    }

    if (cas.some((item) => item.name === entry.name)) {
      setError("CA name already exists.");
      return;
    }

    setCas((previous) =>
      [...previous, entry].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))
    );

    setCaDraft(EMPTY_CA_DRAFT);
  };

  const removeCa = (name: string) => {
    setCas((previous) => previous.filter((entry) => entry.name !== name));
  };

  const addCertificate = () => {
    setError(null);

    const entry: CertificateEntry = {
      name: normalizeText(certDraft.name),
      certificatePath: normalizeText(certDraft.certificatePath),
      privateKeyPath: normalizeText(certDraft.privateKeyPath),
    };

    if (!entry.name) {
      setError("Certificate name is required.");
      return;
    }

    if (certificates.some((item) => item.name === entry.name)) {
      setError("Certificate name already exists.");
      return;
    }

    setCertificates((previous) =>
      [...previous, entry].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))
    );

    setCertDraft(EMPTY_CERT_DRAFT);
  };

  const removeCertificate = (name: string) => {
    setCertificates((previous) => previous.filter((entry) => entry.name !== name));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const operations: string[] = [];

      const currentCaMap = new Map(currentCas.map((entry) => [entry.name, entry]));
      const desiredCaMap = new Map(cas.map((entry) => [entry.name, entry]));

      for (const [name] of currentCaMap.entries()) {
        if (!desiredCaMap.has(name)) {
          operations.push(`delete pki ca ${name}`);
        }
      }

      for (const [name, desired] of desiredCaMap.entries()) {
        const current = currentCaMap.get(name);
        if (current && caEqual(current, desired)) {
          continue;
        }

        if (desired.certificatePath) {
          operations.push(`set pki ca ${name} certificate ${desired.certificatePath}`);
        } else if (current?.certificatePath) {
          operations.push(`delete pki ca ${name} certificate`);
        }

        if (desired.privateKeyPath) {
          operations.push(`set pki ca ${name} private key ${desired.privateKeyPath}`);
        } else if (current?.privateKeyPath) {
          operations.push(`delete pki ca ${name} private key`);
        }

        if (desired.passphrase) {
          operations.push(`set pki ca ${name} private password ${JSON.stringify(desired.passphrase)}`);
        } else if (current?.passphrase) {
          operations.push(`delete pki ca ${name} private password`);
        }
      }

      const currentCertMap = new Map(currentCertificates.map((entry) => [entry.name, entry]));
      const desiredCertMap = new Map(certificates.map((entry) => [entry.name, entry]));

      for (const [name] of currentCertMap.entries()) {
        if (!desiredCertMap.has(name)) {
          operations.push(`delete pki certificate ${name}`);
        }
      }

      for (const [name, desired] of desiredCertMap.entries()) {
        const current = currentCertMap.get(name);
        if (current && certEqual(current, desired)) {
          continue;
        }

        if (desired.certificatePath) {
          operations.push(`set pki certificate ${name} certificate ${desired.certificatePath}`);
        } else if (current?.certificatePath) {
          operations.push(`delete pki certificate ${name} certificate`);
        }

        if (desired.privateKeyPath) {
          operations.push(`set pki certificate ${name} private key ${desired.privateKeyPath}`);
        } else if (current?.privateKeyPath) {
          operations.push(`delete pki certificate ${name} private key`);
        }
      }

      if (operations.length === 0) {
        setMessage("No changes to apply.");
        return;
      }

      const result = await pkiApi.configure(operations);
      if (!result.success) {
        throw new Error(result.error || "Failed to save PKI configuration");
      }

      setMessage("PKI configuration saved successfully.");
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save PKI configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <LoadingSpinner />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">PKI</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage CA and certificate object references for VPN and secure service workflows.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => loadData(true)} disabled={loading || saving}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={handleSave} disabled={!canEdit || saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {message && (
          <Card className="border-primary/40">
            <CardContent className="pt-6 text-sm text-primary">{message}</CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Certificate Authorities</CardTitle>
            <CardDescription>Reference CA certificate and private key file paths.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={caDraft.name}
                  onChange={(event) => setCaDraft((previous) => ({ ...previous, name: event.target.value }))}
                  placeholder="LAB-CA"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Certificate Path</Label>
                <Input
                  value={caDraft.certificatePath}
                  onChange={(event) =>
                    setCaDraft((previous) => ({ ...previous, certificatePath: event.target.value }))
                  }
                  placeholder="/config/auth/ca.crt"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Private Key Path</Label>
                <Input
                  value={caDraft.privateKeyPath}
                  onChange={(event) =>
                    setCaDraft((previous) => ({ ...previous, privateKeyPath: event.target.value }))
                  }
                  placeholder="/config/auth/ca.key"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Private Key Passphrase</Label>
                <Input
                  value={caDraft.passphrase}
                  onChange={(event) =>
                    setCaDraft((previous) => ({ ...previous, passphrase: event.target.value }))
                  }
                  placeholder="optional"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <Button type="button" variant="outline" onClick={addCa} disabled={!canEdit}>
              <Plus className="mr-2 h-4 w-4" />
              Add CA
            </Button>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Certificate</TableHead>
                  <TableHead>Private Key</TableHead>
                  <TableHead>Passphrase</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      No CA entries configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  cas.map((entry) => (
                    <TableRow key={entry.name}>
                      <TableCell className="font-medium">{entry.name}</TableCell>
                      <TableCell className="font-mono text-xs">{entry.certificatePath || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{entry.privateKeyPath || "-"}</TableCell>
                      <TableCell>{entry.passphrase ? "Configured" : "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeCa(entry.name)}
                          disabled={!canEdit}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Certificates</CardTitle>
            <CardDescription>Reference certificate and private key paths for certificate objects.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={certDraft.name}
                  onChange={(event) => setCertDraft((previous) => ({ ...previous, name: event.target.value }))}
                  placeholder="REMOTE-PEER"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Certificate Path</Label>
                <Input
                  value={certDraft.certificatePath}
                  onChange={(event) =>
                    setCertDraft((previous) => ({ ...previous, certificatePath: event.target.value }))
                  }
                  placeholder="/config/auth/peer.crt"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Private Key Path</Label>
                <Input
                  value={certDraft.privateKeyPath}
                  onChange={(event) =>
                    setCertDraft((previous) => ({ ...previous, privateKeyPath: event.target.value }))
                  }
                  placeholder="/config/auth/peer.key"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <Button type="button" variant="outline" onClick={addCertificate} disabled={!canEdit}>
              <Plus className="mr-2 h-4 w-4" />
              Add Certificate
            </Button>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Certificate</TableHead>
                  <TableHead>Private Key</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {certificates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No certificate entries configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  certificates.map((entry) => (
                    <TableRow key={entry.name}>
                      <TableCell className="font-medium">{entry.name}</TableCell>
                      <TableCell className="font-mono text-xs">{entry.certificatePath || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{entry.privateKeyPath || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeCertificate(entry.name)}
                          disabled={!canEdit}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
