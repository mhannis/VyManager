"use client";

import { useCallback, useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
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
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { pkiApi } from "@/lib/api/pki";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureGroup } from "@/lib/api/user-management";

type CaEntry = {
  name: string;
  certificatePath: string;
  crlPath: string;
  description: string;
  privateKeyPath: string;
  privatePasswordProtected: boolean;
};

type AcmeConfig = {
  domains: string[];
  email: string;
  listenAddress: string;
  rsaKeySize: string;
  url: string;
};

type CertificateEntry = {
  name: string;
  certificatePath: string;
  description: string;
  privateKeyPath: string;
  privatePasswordProtected: boolean;
  revoke: boolean;
  acme: AcmeConfig;
};

const EMPTY_CA_DRAFT: CaEntry = {
  name: "",
  certificatePath: "",
  crlPath: "",
  description: "",
  privateKeyPath: "",
  privatePasswordProtected: false,
};

const EMPTY_ACME_DRAFT: AcmeConfig = {
  domains: [],
  email: "",
  listenAddress: "",
  rsaKeySize: "",
  url: "",
};

const EMPTY_CERT_DRAFT: CertificateEntry = {
  name: "",
  certificatePath: "",
  description: "",
  privateKeyPath: "",
  privatePasswordProtected: false,
  revoke: false,
  acme: { ...EMPTY_ACME_DRAFT },
};

const RSA_KEY_SIZE_OPTIONS = ["", "2048", "3072", "4096"];

function normalizeText(value: string): string {
  return value.trim();
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function uniqueList(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of values) {
    const value = normalizeText(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
}

function parseCsvList(value: string): string[] {
  return uniqueList(value.split(",").map((item) => item.trim()));
}

function serializeCsvList(values: string[]): string {
  return uniqueList(values).join(", ");
}

function arrayEquals(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function readPrivateKeyPath(root: Record<string, unknown>): string {
  const privateRoot = asObject(root.private);
  return normalizeText(asText(privateRoot.key));
}

function readPrivatePasswordProtected(root: Record<string, unknown>): boolean {
  const privateRoot = asObject(root.private);
  return (
    Object.prototype.hasOwnProperty.call(privateRoot, "password-protected") ||
    Object.prototype.hasOwnProperty.call(privateRoot, "password_protected")
  );
}

function readNodeList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueList(value.map((item) => asText(item)));
  }
  if (typeof value === "string") {
    return uniqueList([value]);
  }
  const root = asObject(value);
  const keys = Object.keys(root);
  if (keys.length > 0) {
    return uniqueList(keys);
  }
  return [];
}

function acmeEqual(left: AcmeConfig, right: AcmeConfig): boolean {
  return (
    arrayEquals([...left.domains].sort(), [...right.domains].sort()) &&
    left.email === right.email &&
    left.listenAddress === right.listenAddress &&
    left.rsaKeySize === right.rsaKeySize &&
    left.url === right.url
  );
}

function caEqual(left: CaEntry, right: CaEntry): boolean {
  return (
    left.name === right.name &&
    left.certificatePath === right.certificatePath &&
    left.crlPath === right.crlPath &&
    left.description === right.description &&
    left.privateKeyPath === right.privateKeyPath &&
    left.privatePasswordProtected === right.privatePasswordProtected
  );
}

function certEqual(left: CertificateEntry, right: CertificateEntry): boolean {
  return (
    left.name === right.name &&
    left.certificatePath === right.certificatePath &&
    left.description === right.description &&
    left.privateKeyPath === right.privateKeyPath &&
    left.privatePasswordProtected === right.privatePasswordProtected &&
    left.revoke === right.revoke &&
    acmeEqual(left.acme, right.acme)
  );
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
  const [certAcmeDomainsInput, setCertAcmeDomainsInput] = useState("");

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
            certificatePath: normalizeText(asText(root.certificate)),
            crlPath: normalizeText(asText(root.crl)),
            description: normalizeText(asText(root.description)),
            privateKeyPath: readPrivateKeyPath(root),
            privatePasswordProtected: readPrivatePasswordProtected(root),
          };
        })
        .filter((entry) => entry.name)
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));

      const parsedCertificates = Object.entries(certRoot)
        .map(([name, value]) => {
          const root = asObject(value);
          const acmeRoot = asObject(root.acme);
          return {
            name: normalizeText(name),
            certificatePath: normalizeText(asText(root.certificate)),
            description: normalizeText(asText(root.description)),
            privateKeyPath: readPrivateKeyPath(root),
            privatePasswordProtected: readPrivatePasswordProtected(root),
            revoke: Object.prototype.hasOwnProperty.call(root, "revoke"),
            acme: {
              domains: readNodeList(acmeRoot["domain-name"]),
              email: normalizeText(asText(acmeRoot.email)),
              listenAddress: normalizeText(asText(acmeRoot["listen-address"])),
              rsaKeySize: normalizeText(asText(acmeRoot["rsa-key-size"])),
              url: normalizeText(asText(acmeRoot.url)),
            },
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
      setCertAcmeDomainsInput("");
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
      crlPath: normalizeText(caDraft.crlPath),
      description: normalizeText(caDraft.description),
      privateKeyPath: normalizeText(caDraft.privateKeyPath),
      privatePasswordProtected: Boolean(caDraft.privatePasswordProtected),
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
      description: normalizeText(certDraft.description),
      privateKeyPath: normalizeText(certDraft.privateKeyPath),
      privatePasswordProtected: Boolean(certDraft.privatePasswordProtected),
      revoke: Boolean(certDraft.revoke),
      acme: {
        domains: parseCsvList(certAcmeDomainsInput),
        email: normalizeText(certDraft.acme.email),
        listenAddress: normalizeText(certDraft.acme.listenAddress),
        rsaKeySize: normalizeText(certDraft.acme.rsaKeySize),
        url: normalizeText(certDraft.acme.url),
      },
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
    setCertAcmeDomainsInput("");
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

        if (desired.crlPath) {
          operations.push(`set pki ca ${name} crl ${desired.crlPath}`);
        } else if (current?.crlPath) {
          operations.push(`delete pki ca ${name} crl`);
        }

        if (desired.description) {
          operations.push(`set pki ca ${name} description ${JSON.stringify(desired.description)}`);
        } else if (current?.description) {
          operations.push(`delete pki ca ${name} description`);
        }

        if (desired.privateKeyPath) {
          operations.push(`set pki ca ${name} private key ${desired.privateKeyPath}`);
        } else if (current?.privateKeyPath) {
          operations.push(`delete pki ca ${name} private key`);
        }

        if (desired.privatePasswordProtected) {
          operations.push(`set pki ca ${name} private password-protected`);
        } else if (current?.privatePasswordProtected) {
          operations.push(`delete pki ca ${name} private password-protected`);
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

        if (desired.description) {
          operations.push(`set pki certificate ${name} description ${JSON.stringify(desired.description)}`);
        } else if (current?.description) {
          operations.push(`delete pki certificate ${name} description`);
        }

        if (desired.privateKeyPath) {
          operations.push(`set pki certificate ${name} private key ${desired.privateKeyPath}`);
        } else if (current?.privateKeyPath) {
          operations.push(`delete pki certificate ${name} private key`);
        }

        if (desired.privatePasswordProtected) {
          operations.push(`set pki certificate ${name} private password-protected`);
        } else if (current?.privatePasswordProtected) {
          operations.push(`delete pki certificate ${name} private password-protected`);
        }

        if (desired.revoke) {
          operations.push(`set pki certificate ${name} revoke`);
        } else if (current?.revoke) {
          operations.push(`delete pki certificate ${name} revoke`);
        }

        const currentDomains = uniqueList(current?.acme.domains || []);
        const desiredDomains = uniqueList(desired.acme.domains);

        for (const domain of currentDomains) {
          if (!desiredDomains.includes(domain)) {
            operations.push(`delete pki certificate ${name} acme domain-name ${domain}`);
          }
        }

        for (const domain of desiredDomains) {
          if (!currentDomains.includes(domain)) {
            operations.push(`set pki certificate ${name} acme domain-name ${domain}`);
          }
        }

        if (desired.acme.email) {
          operations.push(`set pki certificate ${name} acme email ${desired.acme.email}`);
        } else if (current?.acme.email) {
          operations.push(`delete pki certificate ${name} acme email`);
        }

        if (desired.acme.listenAddress) {
          operations.push(`set pki certificate ${name} acme listen-address ${desired.acme.listenAddress}`);
        } else if (current?.acme.listenAddress) {
          operations.push(`delete pki certificate ${name} acme listen-address`);
        }

        if (desired.acme.rsaKeySize) {
          operations.push(`set pki certificate ${name} acme rsa-key-size ${desired.acme.rsaKeySize}`);
        } else if (current?.acme.rsaKeySize) {
          operations.push(`delete pki certificate ${name} acme rsa-key-size`);
        }

        if (desired.acme.url) {
          operations.push(`set pki certificate ${name} acme url ${desired.acme.url}`);
        } else if (current?.acme.url) {
          operations.push(`delete pki certificate ${name} acme url`);
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
              Manage PKI objects used by VPN and services, including ACME metadata and key protection flags.
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
            <CardDescription>Manage CA certificate references, CRLs, and private key protection metadata.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
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
                <Label>Certificate</Label>
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
                <Label>CRL</Label>
                <Input
                  value={caDraft.crlPath}
                  onChange={(event) => setCaDraft((previous) => ({ ...previous, crlPath: event.target.value }))}
                  placeholder="/config/auth/ca.crl"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={caDraft.description}
                  onChange={(event) =>
                    setCaDraft((previous) => ({ ...previous, description: event.target.value }))
                  }
                  placeholder="Root CA"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Private Key</Label>
                <Input
                  value={caDraft.privateKeyPath}
                  onChange={(event) =>
                    setCaDraft((previous) => ({ ...previous, privateKeyPath: event.target.value }))
                  }
                  placeholder="/config/auth/ca.key"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="ca-private-password-protected"
                  checked={caDraft.privatePasswordProtected}
                  onCheckedChange={(checked) =>
                    setCaDraft((previous) => ({ ...previous, privatePasswordProtected: Boolean(checked) }))
                  }
                  disabled={!canEdit}
                />
                <Label htmlFor="ca-private-password-protected">Private Key Password Protected</Label>
              </div>

              <Button type="button" variant="outline" onClick={addCa} disabled={!canEdit}>
                <Plus className="mr-2 h-4 w-4" />
                Add CA
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Certificate</TableHead>
                  <TableHead>CRL</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Private Key</TableHead>
                  <TableHead>Protected</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground">
                      No CA entries configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  cas.map((entry) => (
                    <TableRow key={entry.name}>
                      <TableCell className="font-medium">{entry.name}</TableCell>
                      <TableCell className="font-mono text-xs">{entry.certificatePath || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{entry.crlPath || "-"}</TableCell>
                      <TableCell>{entry.description || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{entry.privateKeyPath || "-"}</TableCell>
                      <TableCell>{entry.privatePasswordProtected ? "Yes" : "No"}</TableCell>
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
            <CardDescription>
              Manage certificate/private-key references, revocation flag, and ACME metadata.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
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
                <Label>Certificate</Label>
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
                <Label>Description</Label>
                <Input
                  value={certDraft.description}
                  onChange={(event) =>
                    setCertDraft((previous) => ({ ...previous, description: event.target.value }))
                  }
                  placeholder="Site-to-site peer cert"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Private Key</Label>
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

            <div className="grid gap-3 md:grid-cols-5">
              <div className="space-y-2">
                <Label>ACME Domains</Label>
                <Input
                  value={certAcmeDomainsInput}
                  onChange={(event) => setCertAcmeDomainsInput(event.target.value)}
                  placeholder="vpn.example.com, gw.example.com"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>ACME Email</Label>
                <Input
                  value={certDraft.acme.email}
                  onChange={(event) =>
                    setCertDraft((previous) => ({
                      ...previous,
                      acme: { ...previous.acme, email: event.target.value },
                    }))
                  }
                  placeholder="admin@example.com"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>ACME Listen Address</Label>
                <Input
                  value={certDraft.acme.listenAddress}
                  onChange={(event) =>
                    setCertDraft((previous) => ({
                      ...previous,
                      acme: { ...previous.acme, listenAddress: event.target.value },
                    }))
                  }
                  placeholder="192.0.2.10"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>ACME RSA Key Size</Label>
                <Select
                  value={certDraft.acme.rsaKeySize || "__unset__"}
                  onValueChange={(value) =>
                    setCertDraft((previous) => ({
                      ...previous,
                      acme: { ...previous.acme, rsaKeySize: value === "__unset__" ? "" : value },
                    }))
                  }
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Default" />
                  </SelectTrigger>
                  <SelectContent>
                    {RSA_KEY_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size || "default"} value={size || "__unset__"}>
                        {size || "Default"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>ACME URL</Label>
                <Input
                  value={certDraft.acme.url}
                  onChange={(event) =>
                    setCertDraft((previous) => ({
                      ...previous,
                      acme: { ...previous.acme, url: event.target.value },
                    }))
                  }
                  placeholder="https://acme-v02.api.letsencrypt.org/directory"
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="cert-private-password-protected"
                  checked={certDraft.privatePasswordProtected}
                  onCheckedChange={(checked) =>
                    setCertDraft((previous) => ({ ...previous, privatePasswordProtected: Boolean(checked) }))
                  }
                  disabled={!canEdit}
                />
                <Label htmlFor="cert-private-password-protected">Private Key Password Protected</Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="cert-revoke"
                  checked={certDraft.revoke}
                  onCheckedChange={(checked) =>
                    setCertDraft((previous) => ({ ...previous, revoke: Boolean(checked) }))
                  }
                  disabled={!canEdit}
                />
                <Label htmlFor="cert-revoke">Revoke Certificate</Label>
              </div>

              <Button type="button" variant="outline" onClick={addCertificate} disabled={!canEdit}>
                <Plus className="mr-2 h-4 w-4" />
                Add Certificate
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Certificate</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Private Key</TableHead>
                  <TableHead>Protected</TableHead>
                  <TableHead>Revoked</TableHead>
                  <TableHead>ACME Domains</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {certificates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground">
                      No certificate entries configured.
                    </TableCell>
                  </TableRow>
                ) : (
                  certificates.map((entry) => (
                    <TableRow key={entry.name}>
                      <TableCell className="font-medium">{entry.name}</TableCell>
                      <TableCell className="font-mono text-xs">{entry.certificatePath || "-"}</TableCell>
                      <TableCell>{entry.description || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{entry.privateKeyPath || "-"}</TableCell>
                      <TableCell>{entry.privatePasswordProtected ? "Yes" : "No"}</TableCell>
                      <TableCell>{entry.revoke ? "Yes" : "No"}</TableCell>
                      <TableCell>{entry.acme.domains.length > 0 ? serializeCsvList(entry.acme.domains) : "-"}</TableCell>
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
