import { Loader2, FileSpreadsheet, IdCard } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BulkRecord } from "@/lib/intake.functions";

export type { BulkRecord };

const STAGES = ["Lead", "Contacted", "Qualified", "Quoted", "Negotiation", "Won", "Lost"];
const RISKS = ["Low", "Medium", "High"];

interface Props {
  records: BulkRecord[];
  loggedInName: string;
  saving: boolean;
  onPatch: (idx: number, field: keyof BulkRecord, value: BulkRecord[keyof BulkRecord]) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function BulkIntakeTable({ records, loggedInName, saving, onPatch, onSave, onCancel }: Props) {
  return (
    <Card className="card-soft border-0 shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          Review extracted records
          <Badge className="ml-auto bg-primary/10 text-primary border-primary/20 text-xs font-semibold">
            {records.length} customer{records.length !== 1 ? "s" : ""}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 md:hidden">
          {records.map((r, idx) => (
            <div key={idx} className="rounded-lg border border-border bg-background/70 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="font-mono text-xs font-semibold text-muted-foreground">#{idx + 1}</div>
                <Badge variant="secondary" className="text-[10px]">
                  {r.intake_code ?? "New intake"}
                </Badge>
              </div>
              <div className="grid gap-3">
                <MobileField label="Customer">
                  <Input
                    className="h-9 text-sm"
                    value={r.customer ?? ""}
                    onChange={(e) => onPatch(idx, "customer", e.target.value || null)}
                    placeholder="Customer name"
                  />
                </MobileField>
                <MobileField label="Product">
                  <Input
                    className="h-9 text-sm"
                    value={r.product ?? ""}
                    onChange={(e) => onPatch(idx, "product", e.target.value || null)}
                    placeholder="Product"
                  />
                </MobileField>
                <div className="grid grid-cols-2 gap-3">
                  <MobileField label="Stage">
                    <Select
                      value={r.pipeline_stage ?? ""}
                      onValueChange={(v) => onPatch(idx, "pipeline_stage", v || null)}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </MobileField>
                  <MobileField label="Risk">
                    <Select
                      value={r.risk_level ?? ""}
                      onValueChange={(v) => onPatch(idx, "risk_level", v || null)}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {RISKS.map((lv) => (
                          <SelectItem key={lv} value={lv}>{lv}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </MobileField>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <MobileField label="Revenue">
                    <Input
                      className="h-9 text-sm"
                      type="number"
                      value={r.expected_revenue ?? ""}
                      onChange={(e) => onPatch(idx, "expected_revenue", e.target.value ? Number(e.target.value) : null)}
                      placeholder="0"
                    />
                  </MobileField>
                  <MobileField label="Follow-up">
                    <Input
                      className="h-9 text-sm"
                      type="date"
                      value={r.follow_up_date ?? ""}
                      onChange={(e) => onPatch(idx, "follow_up_date", e.target.value || null)}
                    />
                  </MobileField>
                </div>
                <MobileField label="English translation">
                  <Input
                    className="h-9 text-sm"
                    value={r.english_translation ?? ""}
                    onChange={(e) => onPatch(idx, "english_translation", e.target.value || null)}
                    placeholder="English translation"
                  />
                </MobileField>
                <MobileField label="Summary">
                  <Input
                    className="h-9 text-sm"
                    value={r.summary ?? ""}
                    onChange={(e) => onPatch(idx, "summary", e.target.value || null)}
                    placeholder="Summary"
                  />
                </MobileField>
                <div className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 text-sm font-medium text-foreground">
                  <IdCard className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate">{r.salesperson ?? loggedInName}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden rounded-lg border border-border md:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-8 text-center">#</TableHead>
                <TableHead className="min-w-[160px]">Customer</TableHead>
                <TableHead className="min-w-[130px]">Product</TableHead>
                <TableHead className="min-w-[110px]">Stage</TableHead>
                <TableHead className="min-w-[130px]">Revenue ₹</TableHead>
                <TableHead className="min-w-[120px]">Follow-up</TableHead>
                <TableHead className="min-w-[90px]">Risk</TableHead>
                <TableHead className="min-w-[220px]">English translation</TableHead>
                <TableHead className="min-w-[200px]">Summary</TableHead>
                <TableHead className="min-w-[140px]">Salesperson</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r, idx) => (
                <TableRow key={idx} className="align-top">
                  <TableCell className="text-center text-xs text-muted-foreground pt-3 font-mono">{idx + 1}</TableCell>

                  <TableCell className="py-1.5">
                    <Input
                      className="h-8 text-sm"
                      value={r.customer ?? ""}
                      onChange={(e) => onPatch(idx, "customer", e.target.value || null)}
                      placeholder="Customer name"
                    />
                  </TableCell>

                  <TableCell className="py-1.5">
                    <Input
                      className="h-8 text-sm"
                      value={r.product ?? ""}
                      onChange={(e) => onPatch(idx, "product", e.target.value || null)}
                      placeholder="Product"
                    />
                  </TableCell>

                  <TableCell className="py-1.5">
                    <Select
                      value={r.pipeline_stage ?? ""}
                      onValueChange={(v) => onPatch(idx, "pipeline_stage", v || null)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>

                  <TableCell className="py-1.5">
                    <Input
                      className="h-8 text-sm"
                      type="number"
                      value={r.expected_revenue ?? ""}
                      onChange={(e) => onPatch(idx, "expected_revenue", e.target.value ? Number(e.target.value) : null)}
                      placeholder="0"
                    />
                  </TableCell>

                  <TableCell className="py-1.5">
                    <Input
                      className="h-8 text-sm"
                      type="date"
                      value={r.follow_up_date ?? ""}
                      onChange={(e) => onPatch(idx, "follow_up_date", e.target.value || null)}
                    />
                  </TableCell>

                  <TableCell className="py-1.5">
                    <Select
                      value={r.risk_level ?? ""}
                      onValueChange={(v) => onPatch(idx, "risk_level", v || null)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {RISKS.map((lv) => (
                          <SelectItem key={lv} value={lv}>{lv}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>

                  <TableCell className="py-1.5">
                    <Input
                      className="h-8 text-sm"
                      value={r.english_translation ?? ""}
                      onChange={(e) => onPatch(idx, "english_translation", e.target.value || null)}
                      placeholder="English translation"
                    />
                  </TableCell>

                  <TableCell className="py-1.5">
                    <Input
                      className="h-8 text-sm"
                      value={r.summary ?? ""}
                      onChange={(e) => onPatch(idx, "summary", e.target.value || null)}
                      placeholder="Summary"
                    />
                  </TableCell>

                  <TableCell className="py-1.5">
                    <div className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 text-sm font-medium text-foreground">
                      <IdCard className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate">{r.salesperson ?? loggedInName}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground">
          Edit any cell directly. The{" "}
          <span className="font-semibold text-foreground">Salesperson</span> column is auto-locked to your login.
        </p>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-1.5 h-4 w-4" />
            )}
            Save {records.length} intake{records.length !== 1 ? "s" : ""}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MobileField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
