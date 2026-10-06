import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText, Printer, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatCHF, signedUrls, type Customer, type Job } from "@/lib/app";
import { settingsQuery } from "@/lib/queries";
import { useServiceTotals } from "@/components/job/ServiceSections";
import {
  SERVICE_REPORT_CSS,
  buildServiceReport,
  canGenerateServiceReport,
  type ServiceReportModel,
} from "@/lib/service-report";
import { trimSignatureImage } from "@/lib/signature";

type JobForReport = Job & { customers?: Customer | null };

function money(n: number) {
  return formatCHF(n);
}

function qty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toLocaleString("de-CH", { maximumFractionDigits: 2 });
}

function hours(n: number) {
  return `${n.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;
}

function SignatureMark({ src, alt, empty }: { src: string | null; alt: string; empty: string }) {
  return src ? (
    <div className="sr-sig-box">
      <img src={src} alt={alt} />
    </div>
  ) : (
    <div className="sr-sig-empty">{empty}</div>
  );
}

function TotalsBox({ model }: { model: ServiceReportModel }) {
  return (
    <div className="sr-tot">
      <h3>Zusammenfassung</h3>
      <table>
        <tbody>
          <tr><td>Zwischensumme netto:</td><td className="num">{money(model.bill.subtotal)}</td></tr>
          <tr><td>MWST {model.vatRate}%:</td><td className="num">{money(model.bill.vat)}</td></tr>
          <tr className="grand"><td>Totalbetrag:</td><td className="num">{money(model.bill.total)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

export function ServiceReportDocument({ model }: { model: ServiceReportModel }) {
  const pageLabel = "Seite 1 von 1";
  return (
    <div className="sr-page">
      <header className="sr-header">
        <img className="sr-logo" src={model.logoUrl} alt={model.companyName} />
        <div className="sr-co">
          <strong>{model.companyName}</strong>
          {model.companyAddress}<br />
          {model.companyPhone}<br />
          {model.companyEmail}<br />
          {model.companyWebsite}
        </div>
      </header>
      <h1 className="sr-title">Regierapport</h1>
      <p className="sr-sub">Digitaler Service-Rapport</p>

      <div className="sr-grid">
        <div className="sr-box">
          <h3>Regierapport</h3>
          <dl>
            <dt>Rapportnummer:</dt><dd>{model.rapportNr}</dd>
            <dt>Datum:</dt><dd>{model.createdAt}</dd>
            <dt>Ausführungsdatum:</dt><dd>{model.executedAt}</dd>
            <dt>Monteur:</dt><dd>{model.technician}</dd>
          </dl>
        </div>
        <div className="sr-box">
          <h3>Kunde &amp; Einsatzort</h3>
          <dl>
            <dt>Kunde:</dt><dd>{model.customerName}</dd>
            <dt>Ansprechpartner:</dt><dd>{model.contactPerson}</dd>
            <dt>Einsatzort:</dt><dd>{model.site}</dd>
            <dt>Telefon:</dt><dd>{model.phone}</dd>
            {model.email !== "–" && <><dt>E-Mail:</dt><dd>{model.email}</dd></>}
          </dl>
        </div>
      </div>

      <section className="sr-sec">
        <h3>Auftrag / Problemstellung</h3>
        <p>{model.problem}</p>
      </section>

      {model.labour.length > 0 && (
        <section className="sr-sec">
          <h3>Ausgeführte Arbeiten &amp; Arbeitszeit</h3>
          <table className="sr-table">
            <thead>
              <tr>
                <th>Ausgeführte Arbeit</th>
                <th>Mitarbeiter</th>
                <th className="num">Stunden</th>
                <th className="num">Ansatz</th>
                <th className="num">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {model.labour.map((r, i) => (
                <tr key={i}>
                  <td>{r.description}</td>
                  <td>{r.technician}</td>
                  <td className="num">{hours(r.hours)}</td>
                  <td className="num">{money(r.rate)}</td>
                  <td className="num">{money(r.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Arbeitszeit total:</td>
                <td className="num">{money(model.bill.workCHF)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {model.material.length > 0 && (
        <section className="sr-sec">
          <h3>Material</h3>
          <table className="sr-table">
            <thead>
              <tr>
                <th>Position</th>
                <th className="num">Menge</th>
                <th>Einheit</th>
                <th className="num">Einzelpreis</th>
                <th className="num">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {model.material.map((r, i) => (
                <tr key={i}>
                  <td>{r.name}</td>
                  <td className="num">{qty(r.qty)}</td>
                  <td>{r.unit}</td>
                  <td className="num">{money(r.price)}</td>
                  <td className="num">{money(r.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Material total:</td>
                <td className="num">{money(model.bill.materialCHF)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {model.extras.length > 0 && (
        <section className="sr-sec">
          <h3>Pauschalen &amp; Zusatzkosten</h3>
          <table className="sr-table">
            <thead>
              <tr>
                <th>Position</th>
                <th className="num">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {model.extras.map((r, i) => (
                <tr key={i}>
                  <td>{r.name}</td>
                  <td className="num">{money(r.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Zuschläge total:</td>
                <td className="num">{money(model.bill.vehicleCHF + model.bill.extrasCHF)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      <TotalsBox model={model} />

      <h3 style={{ fontSize: "8.5pt", color: "#1e4d8c", margin: "14px 0 6px" }}>Unterschriften</h3>
      <p style={{ margin: "0 0 8px" }}>Arbeit ordnungsgemäss und vollständig ausgeführt.</p>
      <div className="sr-sig">
        <div>
          <SignatureMark src={model.signatureUrl} alt="Kundenunterschrift" empty="Keine Unterschrift hinterlegt" />
          <div className="sr-line">
            Kundenunterschrift<br />
            {model.signatureUrl ? <>Datum / Uhrzeit: {model.signedAt}<br />{model.signerName}</> : null}
          </div>
        </div>
        <div>
          <SignatureMark src={model.technicianSignatureUrl} alt="Monteurunterschrift" empty="Keine Unterschrift hinterlegt" />
          <div className="sr-line">
            {model.technicianRole || "Monteur"}<br />
            {model.technician}
            {model.technicianPhone !== "–" ? <><br />{model.technicianPhone}</> : null}
          </div>
        </div>
      </div>

      <footer className="sr-foot">
        <span>Digital erstellt via {model.companyName} Service-App</span>
        <span>{pageLabel}</span>
      </footer>
    </div>
  );
}

function wrapHtml(inner: string, title: string) {
  return `<!DOCTYPE html><html lang="de-CH"><head><meta charset="utf-8"/><title>${title}</title><style>${SERVICE_REPORT_CSS}</style></head><body>${inner}</body></html>`;
}

function printHtml(html: string) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error("Druckfenster nicht verfügbar");
  }
  doc.open();
  doc.write(html);
  doc.close();
  const run = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    window.setTimeout(() => iframe.remove(), 1500);
  };
  const imgs = Array.from(doc.images);
  if (!imgs.length) {
    run();
    return;
  }
  let n = 0;
  imgs.forEach((img) => {
    const done = () => {
      n += 1;
      if (n >= imgs.length) run();
    };
    if (img.complete) done();
    else {
      img.addEventListener("load", done);
      img.addEventListener("error", done);
    }
  });
}

function downloadHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ServiceReportAction({ job }: { job: JobForReport }) {
  const qc = useQueryClient();
  const settings = useQuery(settingsQuery());
  const t = useServiceTotals(job.id);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rapportNr, setRapportNr] = useState(job.report_number);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRapportNr(job.report_number);
  }, [job.report_number]);

  const ready = canGenerateServiceReport({
    labour: t.lab.data ?? [],
    material: t.mat.data ?? [],
    extras: t.ext.data ?? [],
    signaturePath: job.signature_path,
  });

  const sig = useQuery({
    queryKey: ["sig", job.signature_path],
    enabled: open && !!job.signature_path,
    queryFn: async () => (await signedUrls([job.signature_path!]))[job.signature_path!] ?? null,
  });
  const techPath = settings.data?.technician_signature_path ?? null;
  const techSig = useQuery({
    queryKey: ["sig", techPath],
    enabled: open && !!techPath,
    queryFn: async () => (await signedUrls([techPath!]))[techPath!] ?? null,
  });
  const [customerSig, setCustomerSig] = useState<string | null>(null);
  const [techSigUrl, setTechSigUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!sig.data) {
      setCustomerSig(null);
      return;
    }
    let live = true;
    void trimSignatureImage(sig.data).then((u) => { if (live) setCustomerSig(u); });
    return () => { live = false; };
  }, [sig.data]);
  useEffect(() => {
    if (!techSig.data) {
      setTechSigUrl(null);
      return;
    }
    let live = true;
    void trimSignatureImage(techSig.data).then((u) => { if (live) setTechSigUrl(u); });
    return () => { live = false; };
  }, [techSig.data]);

  const [reportCreatedAt, setReportCreatedAt] = useState(job.report_created_at);
  useEffect(() => {
    setReportCreatedAt(job.report_created_at);
  }, [job.report_created_at]);

  const model = useMemo(() => {
    if (!open) return null;
    return buildServiceReport({
      job: {
        ...job,
        report_number: rapportNr ?? job.report_number,
        report_created_at: reportCreatedAt ?? job.report_created_at,
      },
      customer: job.customers ?? null,
      settings: settings.data ?? null,
      labour: t.lab.data ?? [],
      material: t.mat.data ?? [],
      extras: t.ext.data ?? [],
      signatureUrl: customerSig,
      technicianSignatureUrl: techSigUrl,
    });
  }, [open, job, rapportNr, reportCreatedAt, settings.data, t.lab.data, t.mat.data, t.ext.data, customerSig, techSigUrl]);

  const loading = open && (
    t.lab.isLoading || t.mat.isLoading || t.ext.isLoading
    || (!!job.signature_path && (sig.isLoading || (!!sig.data && customerSig == null)))
    || (!!techPath && (techSig.isLoading || (!!techSig.data && techSigUrl == null)))
  );

  async function openReport() {
    setBusy(true);
    try {
      if (!rapportNr && !job.report_number) {
        const { data, error } = await supabase.rpc("assign_service_report_number", { p_job_id: job.id });
        if (error) throw error;
        const { data: row, error: readError } = await supabase
          .from("jobs")
          .select("report_number, report_created_at")
          .eq("id", job.id)
          .single();
        if (readError) throw readError;
        setRapportNr(row.report_number ?? data);
        setReportCreatedAt(row.report_created_at);
        void qc.invalidateQueries({ queryKey: ["job", job.id] });
        void qc.invalidateQueries({ queryKey: ["jobs"] });
      }
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rapportnummer konnte nicht vergeben werden");
    } finally {
      setBusy(false);
    }
  }

  function htmlOf() {
    const inner = pageRef.current?.innerHTML;
    if (!inner || !model) throw new Error("Rapport nicht bereit");
    return wrapHtml(inner, model.filename);
  }

  async function onPrint() {
    setBusy(true);
    try {
      printHtml(htmlOf());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Drucken fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function makePdf() {
    if (!pageRef.current || !model) throw new Error("Rapport nicht bereit");
    return elementToPdf(pageRef.current, model.filename);
  }

  async function onDownload() {
    setBusy(true);
    const t = toast.loading("PDF wird erstellt…");
    try {
      downloadFile(await makePdf());
      toast.success("PDF gespeichert", { id: t });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download fehlgeschlagen", { id: t });
    } finally {
      setBusy(false);
    }
  }

  async function onShare() {
    if (!model) return;
    setBusy(true);
    const t = toast.loading("PDF wird erstellt…");
    try {
      const r = await shareOrDownload(await makePdf(), `Regierapport ${model.rapportNr}`);
      if (r === "downloaded") toast.success("PDF heruntergeladen", { id: t });
      else toast.dismiss(t);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Teilen fehlgeschlagen", { id: t });
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <>
      <Button className="h-14 w-full text-base font-semibold" disabled={busy} onClick={() => void openReport()}>
        <FileText className="h-5 w-5" /> Regierapport als PDF generieren
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="flex h-[92vh] flex-col rounded-t-2xl p-0">
          <SheetHeader className="px-4 pt-4">
            <SheetTitle>Regierapport</SheetTitle>
          </SheetHeader>
          <div className="flex gap-2 px-4 pb-2">
            <Button className="h-11 flex-1" disabled={busy || loading || !model} onClick={() => void onPrint()}>
              <Printer className="h-4 w-4" /> Drucken / PDF
            </Button>
            <Button variant="outline" className="h-11 flex-1" disabled={busy || loading || !model} onClick={() => void onDownload()}>
              <Download className="h-4 w-4" /> Herunterladen
            </Button>
            <Button variant="outline" className="h-11 flex-1" disabled={busy || loading || !model} onClick={() => void onShare()}>
              <Share2 className="h-4 w-4" /> Teilen
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-muted/40 p-3">
            {loading && <p className="p-4 text-sm text-muted-foreground">Rapport wird erstellt…</p>}
            {!loading && model && (
              <>
                <style>{SERVICE_REPORT_CSS}</style>
                <div ref={pageRef} className="mx-auto max-w-[210mm] rounded-sm bg-white p-4 shadow-sm">
                  <ServiceReportDocument model={model} />
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
