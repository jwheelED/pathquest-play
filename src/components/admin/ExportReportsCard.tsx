import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, Table, Loader2 } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface CourseEngagementExportRow {
  courseTitle: string;
  sessionsInWindow: number;
  responseRateCurrent: number | null;
  responseRatePrior: number | null;
  activeStudents: number;
  openSupportCases: number;
}

export interface OrgSnapshot {
  totalStudents: number | null;
  activeStudents: number | null;
  totalInstructors: number | null;
  totalSessions: number | null;
  totalQuestions: number | null;
  avgCompletionRate: number | null;
  avgResponseRate: number | null;
  sessionsDelta?: number | null;
  responseRateDelta?: number | null;
  hasUsableData: boolean;
  periodLabel: string;
}

interface ExportReportsCardProps {
  snapshot: OrgSnapshot;
  courseEngagement?: CourseEngagementExportRow[];
}

const GOVERNANCE_LINE =
  "Aggregate, formative engagement data. Not an instructor evaluation. Behavioral signals only — no demographic or grade inputs.";

const fmtPct = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : `${Number(v).toFixed(1)}%`;
const fmtNum = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : String(v);
const fmtDelta = (v: number | null | undefined, unit = "") => {
  if (v === null || v === undefined || v === 0) return "";
  return ` (${v > 0 ? "+" : ""}${v}${unit} vs prior period)`;
};

export default function ExportReportsCard({ snapshot, courseEngagement = [] }: ExportReportsCardProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const exportToPDF = async () => {
    setLoading("pdf");
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const today = new Date().toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric",
      });

      // Header
      doc.setFontSize(22);
      doc.setTextColor(40, 40, 40);
      doc.text("Edvana Leadership Report", pageWidth / 2, 22, { align: "center" });

      doc.setFontSize(11);
      doc.setTextColor(100, 100, 100);
      doc.text(`Period: ${snapshot.periodLabel}`, pageWidth / 2, 30, { align: "center" });
      doc.text(`Generated ${today}`, pageWidth / 2, 36, { align: "center" });

      // Governance line
      doc.setFontSize(9);
      doc.setTextColor(110, 110, 110);
      const govLines = doc.splitTextToSize(GOVERNANCE_LINE, pageWidth - 40);
      doc.text(govLines, pageWidth / 2, 44, { align: "center" });

      doc.setDrawColor(220, 220, 220);
      doc.line(20, 54, pageWidth - 20, 54);

      // Key engagement metrics
      doc.setFontSize(14);
      doc.setTextColor(40, 40, 40);
      doc.text("Key Engagement Metrics", 20, 64);

      const metricsBody: string[][] = [
        ["Student Response Rate", `${fmtPct(snapshot.avgResponseRate)}${fmtDelta(snapshot.responseRateDelta, "pp")}`],
        ["Active Students (7d)", fmtNum(snapshot.activeStudents)],
        ["Sessions Run", `${fmtNum(snapshot.totalSessions)}${fmtDelta(snapshot.sessionsDelta)}`],
        ["Avg Completion Rate", fmtPct(snapshot.avgCompletionRate)],
        ["Total Instructors", fmtNum(snapshot.totalInstructors)],
        ["Total Students", fmtNum(snapshot.totalStudents)],
      ];

      autoTable(doc, {
        startY: 68,
        head: [["Metric", "Value"]],
        body: metricsBody,
        theme: "striped",
        headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [240, 250, 246] },
        margin: { left: 20, right: 20 },
      });

      if (!snapshot.hasUsableData) {
        const y = (doc as any).lastAutoTable.finalY + 10;
        doc.setFontSize(10);
        doc.setTextColor(180, 80, 0);
        doc.text(
          "No session data has been collected for this period yet. Connect your LMS to populate engagement metrics.",
          20, y, { maxWidth: pageWidth - 40 },
        );
      }

      // Course-level engagement summary
      if (courseEngagement.length > 0) {
        const startY = (doc as any).lastAutoTable.finalY + (snapshot.hasUsableData ? 12 : 22);

        doc.setFontSize(14);
        doc.setTextColor(40, 40, 40);
        doc.text("Course-Level Engagement Summary", 20, startY);

        autoTable(doc, {
          startY: startY + 4,
          head: [["Course", "Sessions", "Response Rate", "Δ vs prior", "Active Students", "Open Support Cases"]],
          body: courseEngagement.map(c => {
            const delta = c.responseRateCurrent !== null && c.responseRatePrior !== null
              ? c.responseRateCurrent - c.responseRatePrior
              : null;
            return [
              c.courseTitle,
              String(c.sessionsInWindow),
              fmtPct(c.responseRateCurrent),
              delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta}pp`,
              String(c.activeStudents),
              String(c.openSupportCases),
            ];
          }),
          theme: "striped",
          headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [239, 246, 255] },
          margin: { left: 20, right: 20 },
          styles: { fontSize: 9 },
        });
      }

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Page ${i} of ${pageCount}  •  Edvana Leadership Console  •  Aggregate engagement, not instructor evaluation`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: "center" },
        );
      }

      doc.save(`edvana-leadership-${new Date().toISOString().split("T")[0]}.pdf`);
      toast.success("PDF report exported");
    } catch (e) {
      console.error("PDF export error:", e);
      toast.error("Failed to export PDF");
    } finally {
      setLoading(null);
    }
  };

  const exportToCSV = () => {
    setLoading("csv");
    try {
      const rows: string[][] = [
        ["Edvana Leadership Report"],
        [`Period: ${snapshot.periodLabel}`],
        [`Generated: ${new Date().toLocaleDateString()}`],
        [GOVERNANCE_LINE],
        [],
        ["Key Engagement Metrics"],
        ["Metric", "Value"],
        ["Student Response Rate", fmtPct(snapshot.avgResponseRate)],
        ["Active Students (7d)", fmtNum(snapshot.activeStudents)],
        ["Sessions Run", fmtNum(snapshot.totalSessions)],
        ["Avg Completion Rate", fmtPct(snapshot.avgCompletionRate)],
        ["Total Instructors", fmtNum(snapshot.totalInstructors)],
        ["Total Students", fmtNum(snapshot.totalStudents)],
      ];

      if (courseEngagement.length > 0) {
        rows.push([], ["Course-Level Engagement Summary"]);
        rows.push(["Course", "Sessions", "Response Rate", "Active Students", "Open Support Cases"]);
        courseEngagement.forEach(c => {
          rows.push([
            c.courseTitle,
            String(c.sessionsInWindow),
            fmtPct(c.responseRateCurrent),
            String(c.activeStudents),
            String(c.openSupportCases),
          ]);
        });
      }

      const csvContent = rows.map(row =>
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      ).join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `edvana-leadership-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("CSV report exported");
    } catch (e) {
      console.error("CSV export error:", e);
      toast.error("Failed to export CSV");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Card className="border-2 border-accent shadow-glow">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="w-5 h-5 text-accent" />
          Export Reports
        </CardTitle>
        <CardDescription>Board-ready engagement report for the current period.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <Button
            onClick={exportToPDF}
            disabled={loading === "pdf"}
            variant="outline"
            className="w-full justify-start"
          >
            {loading === "pdf" ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FileText className="w-4 h-4 mr-2" />
            )}
            {loading === "pdf" ? "Generating PDF..." : "Export as PDF"}
          </Button>

          <Button
            onClick={exportToCSV}
            disabled={loading === "csv"}
            variant="outline"
            className="w-full justify-start"
          >
            {loading === "csv" ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Table className="w-4 h-4 mr-2" />
            )}
            {loading === "csv" ? "Generating CSV..." : "Export as CSV"}
          </Button>
        </div>

        <div className="pt-4 border-t">
          <h4 className="font-semibold mb-2 text-sm">Report Includes:</h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>• Reporting period &amp; governance disclosure</li>
            <li>• Key engagement metrics with trend deltas</li>
            <li>• Course-level engagement summary</li>
            <li>• Empty-state handling (— instead of misleading 0%)</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-3 italic">
            Student-level rows are excluded from leadership exports. Advisors and instructors of record
            access named records via the Support Queue (FERPA-gated, audit-logged).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
