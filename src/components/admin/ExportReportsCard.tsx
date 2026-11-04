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
  activeCourseCount?: number | null;
  totalCourseCount?: number | null;
  topRising?: { title: string; delta: number }[];
  topFalling?: { title: string; delta: number }[];
  topMisconceptions?: { text: string; correctRate: number; courseName?: string }[];
  openSupportCases?: number;
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

      const activeCourses = snapshot.activeCourseCount ?? 0;
      const totalCourses = snapshot.totalCourseCount ?? courseEngagement.length;
      const openCases = snapshot.openSupportCases ?? 0;

      // ===== Page 1 — Executive Summary =====
      doc.setFontSize(22);
      doc.setTextColor(40, 40, 40);
      doc.text("Edvana Leadership Report", pageWidth / 2, 22, { align: "center" });

      doc.setFontSize(11);
      doc.setTextColor(100, 100, 100);
      doc.text(`Period: ${snapshot.periodLabel}`, pageWidth / 2, 30, { align: "center" });
      doc.text(`Generated ${today}`, pageWidth / 2, 36, { align: "center" });

      doc.setFontSize(9);
      doc.setTextColor(110, 110, 110);
      const govLines = doc.splitTextToSize(GOVERNANCE_LINE, pageWidth - 40);
      doc.text(govLines, pageWidth / 2, 44, { align: "center" });

      doc.setDrawColor(220, 220, 220);
      doc.line(20, 54, pageWidth - 20, 54);

      // Executive KPI strip
      doc.setFontSize(14);
      doc.setTextColor(40, 40, 40);
      doc.text("Executive Summary", 20, 64);

      autoTable(doc, {
        startY: 68,
        head: [["Active Courses", "Sessions Run", "Response Rate", "Active Students (7d)", "Open Support Cases"]],
        body: [[
          `${activeCourses} of ${totalCourses}`,
          `${fmtNum(snapshot.totalSessions)}${fmtDelta(snapshot.sessionsDelta)}`,
          `${fmtPct(snapshot.avgResponseRate)}${fmtDelta(snapshot.responseRateDelta, "pp")}`,
          fmtNum(snapshot.activeStudents),
          String(openCases),
        ]],
        theme: "grid",
        headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: "bold", fontSize: 9 },
        bodyStyles: { fontSize: 10, halign: "center" },
        margin: { left: 20, right: 20 },
      });

      let cursorY = (doc as any).lastAutoTable.finalY + 8;

      if (!snapshot.hasUsableData) {
        doc.setFontSize(10);
        doc.setTextColor(180, 80, 0);
        const msg = "No session activity in this period. Engagement metrics will populate once sessions run and participants respond.";
        const lines = doc.splitTextToSize(msg, pageWidth - 40);
        doc.text(lines, 20, cursorY);
        cursorY += lines.length * 5 + 4;
      }

      // Engagement trend block
      doc.setFontSize(12);
      doc.setTextColor(40, 40, 40);
      doc.text("Engagement Trend", 20, cursorY + 4);
      cursorY += 8;
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      const trendLines = [
        `Sessions Run: ${fmtNum(snapshot.totalSessions)}${fmtDelta(snapshot.sessionsDelta)}`,
        `Response Rate: ${fmtPct(snapshot.avgResponseRate)}${fmtDelta(snapshot.responseRateDelta, "pp")}`,
        `Avg Completion: ${fmtPct(snapshot.avgCompletionRate)}`,
      ];
      trendLines.forEach((line, i) => {
        doc.text(`• ${line}`, 24, cursorY + 5 + i * 5);
      });
      cursorY += 5 + trendLines.length * 5 + 6;

      // Where engagement is moving
      const rising = snapshot.topRising || [];
      const falling = snapshot.topFalling || [];
      if (rising.length || falling.length) {
        doc.setFontSize(12);
        doc.setTextColor(40, 40, 40);
        doc.text("Where Engagement is Moving", 20, cursorY);
        cursorY += 4;
        autoTable(doc, {
          startY: cursorY,
          head: [["Rising (Δ response rate)", "Falling (Δ response rate)"]],
          body: [[
            rising.length
              ? rising.map(r => `↑ ${r.title}  (+${Math.round(r.delta)}pp)`).join("\n")
              : "No rising courses this period.",
            falling.length
              ? falling.map(r => `↓ ${r.title}  (${Math.round(r.delta)}pp)`).join("\n")
              : "No falling courses this period.",
          ]],
          theme: "striped",
          headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold", fontSize: 9 },
          bodyStyles: { fontSize: 9, valign: "top" },
          margin: { left: 20, right: 20 },
        });
        cursorY = (doc as any).lastAutoTable.finalY + 8;
      }

      // Top misconception themes
      const misconceptions = snapshot.topMisconceptions || [];
      if (misconceptions.length) {
        doc.setFontSize(12);
        doc.setTextColor(40, 40, 40);
        doc.text("Top Misconception Themes", 20, cursorY);
        cursorY += 4;
        autoTable(doc, {
          startY: cursorY,
          head: [["Question / Topic", "Course", "Correct Rate"]],
          body: misconceptions.map(m => [
            m.text,
            m.courseName || "—",
            fmtPct(m.correctRate),
          ]),
          theme: "striped",
          headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: "bold", fontSize: 9 },
          bodyStyles: { fontSize: 9 },
          margin: { left: 20, right: 20 },
        });
      }

      // ===== Page 2+ — Appendix A: Course Detail =====
      doc.addPage();
      doc.setFontSize(16);
      doc.setTextColor(40, 40, 40);
      doc.text("Appendix A — Course-Level Engagement", 20, 22);

      doc.setFontSize(9);
      doc.setTextColor(110, 110, 110);
      const appendixNote = totalCourses > 0
        ? `Showing ${activeCourses} of ${totalCourses} total courses. Courses with zero sessions and zero activity in this period are omitted.`
        : "No courses found for this organization.";
      doc.text(doc.splitTextToSize(appendixNote, pageWidth - 40), 20, 30);

      if (courseEngagement.length === 0) {
        doc.setFontSize(11);
        doc.setTextColor(120, 120, 120);
        doc.text("No courses had sessions in this period.", 20, 44);
      } else {
        autoTable(doc, {
          startY: 38,
          head: [["Course", "Sessions", "Response Rate", "Δ vs prior", "Active Students", "Open Support Cases"]],
          body: courseEngagement.map(c => {
            const delta = c.responseRateCurrent !== null && c.responseRatePrior !== null
              ? c.responseRateCurrent - c.responseRatePrior
              : null;
            return [
              c.courseTitle,
              String(c.sessionsInWindow),
              fmtPct(c.responseRateCurrent),
              delta === null ? "—" : `${delta > 0 ? "+" : ""}${Math.round(delta)}pp`,
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
      const activeCourses = snapshot.activeCourseCount ?? 0;
      const totalCourses = snapshot.totalCourseCount ?? courseEngagement.length;

      const rows: string[][] = [
        ["Edvana Leadership Report"],
        [`Period: ${snapshot.periodLabel}`],
        [`Generated: ${new Date().toLocaleDateString()}`],
        [GOVERNANCE_LINE],
        [],
        ["Executive Summary"],
        ["Metric", "Value"],
        ["Active Courses", `${activeCourses} of ${totalCourses}`],
        ["Sessions Run", fmtNum(snapshot.totalSessions)],
        ["Response Rate", fmtPct(snapshot.avgResponseRate)],
        ["Active Students (7d)", fmtNum(snapshot.activeStudents)],
        ["Avg Completion Rate", fmtPct(snapshot.avgCompletionRate)],
        ["Open Support Cases", String(snapshot.openSupportCases ?? 0)],
      ];

      const rising = snapshot.topRising || [];
      const falling = snapshot.topFalling || [];
      if (rising.length || falling.length) {
        rows.push([], ["Where Engagement is Moving"]);
        rows.push(["Direction", "Course", "Δ pp"]);
        rising.forEach(r => rows.push(["Rising", r.title, `+${Math.round(r.delta)}`]));
        falling.forEach(r => rows.push(["Falling", r.title, String(Math.round(r.delta))]));
      }

      const misconceptions = snapshot.topMisconceptions || [];
      if (misconceptions.length) {
        rows.push([], ["Top Misconception Themes"]);
        rows.push(["Question / Topic", "Course", "Correct Rate"]);
        misconceptions.forEach(m => rows.push([m.text, m.courseName || "", fmtPct(m.correctRate)]));
      }

      rows.push([], ["Appendix A — Course-Level Engagement"]);
      rows.push([`Showing ${activeCourses} of ${totalCourses} total courses. Empty rows omitted.`]);
      if (courseEngagement.length > 0) {
        rows.push(["Course", "Sessions", "Response Rate", "Δ vs prior (pp)", "Active Students", "Open Support Cases"]);
        courseEngagement.forEach(c => {
          const delta = c.responseRateCurrent !== null && c.responseRatePrior !== null
            ? Math.round(c.responseRateCurrent - c.responseRatePrior)
            : null;
          rows.push([
            c.courseTitle,
            String(c.sessionsInWindow),
            fmtPct(c.responseRateCurrent),
            delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta}`,
            String(c.activeStudents),
            String(c.openSupportCases),
          ]);
        });
      } else {
        rows.push(["No courses had sessions in this period."]);
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
            <li>• Page 1 — Executive summary, trend, rising/falling courses, top misconceptions</li>
            <li>• Appendix A — Course-level detail (active courses only, deduplicated)</li>
            <li>• Governance disclosure and reporting period</li>
            <li>• Empty rows suppressed; "—" shown when no data instead of misleading 0%</li>
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
