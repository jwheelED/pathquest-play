import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, Table, Loader2 } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ExportReportsCardProps {
  data: {
    totalStudents?: number;
    activeStudents?: number;
    avgCompletionRate?: number;
    totalInstructors?: number;
    totalSessions?: number;
    totalQuestions?: number;
    avgResponseRate?: number;
    atRiskStudents?: Array<{
      name: string;
      email: string;
      riskScore: number;
      lastActive: string;
    }>;
    instructorPerformance?: Array<{
      name: string;
      sessionsCount: number;
      avgQuestions: number;
      avgResponseRate: number;
    }>;
  };
}

export default function ExportReportsCard({ data }: ExportReportsCardProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const exportToPDF = async () => {
    setLoading('pdf');
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const today = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      // Header
      doc.setFontSize(24);
      doc.setTextColor(40, 40, 40);
      doc.text("Edvana Leadership Report", pageWidth / 2, 25, { align: "center" });
      
      doc.setFontSize(12);
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated on ${today}`, pageWidth / 2, 35, { align: "center" });

      // Divider line
      doc.setDrawColor(200, 200, 200);
      doc.line(20, 42, pageWidth - 20, 42);

      // Key Metrics Section
      doc.setFontSize(16);
      doc.setTextColor(40, 40, 40);
      doc.text("Key Metrics Overview", 20, 55);

      const metricsData = [
        ["Metric", "Value"],
        ["Total Students", String(data.totalStudents ?? 0)],
        ["Active Students", String(data.activeStudents ?? 0)],
        ["Total Instructors", String(data.totalInstructors ?? 0)],
        ["Total Sessions", String(data.totalSessions ?? 0)],
        ["Total Questions Asked", String(data.totalQuestions ?? 0)],
        ["Avg Completion Rate", `${(data.avgCompletionRate ?? 0).toFixed(1)}%`],
        ["Avg Response Rate", `${(data.avgResponseRate ?? 0).toFixed(1)}%`],
      ];

      autoTable(doc, {
        startY: 60,
        head: [metricsData[0]],
        body: metricsData.slice(1),
        theme: 'striped',
        headStyles: { 
          fillColor: [79, 70, 229], 
          textColor: 255,
          fontStyle: 'bold'
        },
        alternateRowStyles: { fillColor: [245, 245, 250] },
        margin: { left: 20, right: 20 },
      });

      // At-Risk Students Section (if data exists)
      if (data.atRiskStudents && data.atRiskStudents.length > 0) {
        const finalY = (doc as any).lastAutoTable.finalY || 100;
        
        doc.setFontSize(16);
        doc.setTextColor(40, 40, 40);
        doc.text("At-Risk Students", 20, finalY + 15);

        const atRiskData = data.atRiskStudents.map(student => [
          student.name,
          student.email,
          `${student.riskScore}%`,
          student.lastActive
        ]);

        autoTable(doc, {
          startY: finalY + 20,
          head: [["Name", "Email", "Risk Score", "Last Active"]],
          body: atRiskData,
          theme: 'striped',
          headStyles: { 
            fillColor: [220, 38, 38], 
            textColor: 255,
            fontStyle: 'bold'
          },
          alternateRowStyles: { fillColor: [254, 242, 242] },
          margin: { left: 20, right: 20 },
        });
      }

      // Instructor Performance Section (if data exists)
      if (data.instructorPerformance && data.instructorPerformance.length > 0) {
        const finalY = (doc as any).lastAutoTable.finalY || 150;
        
        // Check if we need a new page
        if (finalY > 220) {
          doc.addPage();
          doc.setFontSize(16);
          doc.setTextColor(40, 40, 40);
          doc.text("Instructor Performance", 20, 25);
          
          const instructorData = data.instructorPerformance.map(instructor => [
            instructor.name,
            String(instructor.sessionsCount),
            instructor.avgQuestions.toFixed(1),
            `${instructor.avgResponseRate.toFixed(1)}%`
          ]);

          autoTable(doc, {
            startY: 30,
            head: [["Instructor", "Sessions", "Avg Questions", "Response Rate"]],
            body: instructorData,
            theme: 'striped',
            headStyles: { 
              fillColor: [16, 185, 129], 
              textColor: 255,
              fontStyle: 'bold'
            },
            alternateRowStyles: { fillColor: [236, 253, 245] },
            margin: { left: 20, right: 20 },
          });
        } else {
          doc.setFontSize(16);
          doc.setTextColor(40, 40, 40);
          doc.text("Instructor Performance", 20, finalY + 15);

          const instructorData = data.instructorPerformance.map(instructor => [
            instructor.name,
            String(instructor.sessionsCount),
            instructor.avgQuestions.toFixed(1),
            `${instructor.avgResponseRate.toFixed(1)}%`
          ]);

          autoTable(doc, {
            startY: finalY + 20,
            head: [["Instructor", "Sessions", "Avg Questions", "Response Rate"]],
            body: instructorData,
            theme: 'striped',
            headStyles: { 
              fillColor: [16, 185, 129], 
              textColor: 255,
              fontStyle: 'bold'
            },
            alternateRowStyles: { fillColor: [236, 253, 245] },
            margin: { left: 20, right: 20 },
          });
        }
      }

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Page ${i} of ${pageCount} | Edvana - Educational Analytics Platform`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: "center" }
        );
      }

      // Save the PDF
      doc.save(`edvana-report-${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success("PDF report exported successfully!");
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error("Failed to export PDF");
    } finally {
      setLoading(null);
    }
  };

  const exportToCSV = () => {
    setLoading('csv');
    try {
      // Generate CSV content with all available data
      const rows: string[][] = [
        ['Edvana Leadership Report'],
        [`Generated: ${new Date().toLocaleDateString()}`],
        [],
        ['Key Metrics'],
        ['Metric', 'Value'],
        ['Total Students', String(data.totalStudents ?? 0)],
        ['Active Students', String(data.activeStudents ?? 0)],
        ['Total Instructors', String(data.totalInstructors ?? 0)],
        ['Total Sessions', String(data.totalSessions ?? 0)],
        ['Total Questions', String(data.totalQuestions ?? 0)],
        ['Avg Completion Rate', `${(data.avgCompletionRate ?? 0).toFixed(1)}%`],
        ['Avg Response Rate', `${(data.avgResponseRate ?? 0).toFixed(1)}%`],
      ];

      // Add at-risk students if available
      if (data.atRiskStudents && data.atRiskStudents.length > 0) {
        rows.push([], ['At-Risk Students']);
        rows.push(['Name', 'Email', 'Risk Score', 'Last Active']);
        data.atRiskStudents.forEach(student => {
          rows.push([student.name, student.email, `${student.riskScore}%`, student.lastActive]);
        });
      }

      // Add instructor performance if available
      if (data.instructorPerformance && data.instructorPerformance.length > 0) {
        rows.push([], ['Instructor Performance']);
        rows.push(['Instructor', 'Sessions', 'Avg Questions', 'Response Rate']);
        data.instructorPerformance.forEach(instructor => {
          rows.push([
            instructor.name,
            String(instructor.sessionsCount),
            instructor.avgQuestions.toFixed(1),
            `${instructor.avgResponseRate.toFixed(1)}%`
          ]);
        });
      }

      const csvContent = rows.map(row => 
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ).join('\n');

      // Create download link
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edvana-report-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("CSV report exported successfully!");
    } catch (error) {
      console.error('CSV export error:', error);
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
        <CardDescription>Download reports for board presentations and analysis</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <Button
            onClick={exportToPDF}
            disabled={loading === 'pdf'}
            variant="outline"
            className="w-full justify-start"
          >
            {loading === 'pdf' ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FileText className="w-4 h-4 mr-2" />
            )}
            {loading === 'pdf' ? 'Generating PDF...' : 'Export as PDF'}
          </Button>

          <Button
            onClick={exportToCSV}
            disabled={loading === 'csv'}
            variant="outline"
            className="w-full justify-start"
          >
            {loading === 'csv' ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Table className="w-4 h-4 mr-2" />
            )}
            {loading === 'csv' ? 'Generating CSV...' : 'Export as CSV'}
          </Button>
        </div>

        <div className="pt-4 border-t">
          <h4 className="font-semibold mb-2 text-sm">Report Includes:</h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>• Student enrollment & activity metrics</li>
            <li>• Assignment completion rates</li>
            <li>• At-risk student identification</li>
            <li>• Course-level engagement summary</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-3 italic">
            Student-level rows are only included for roles with documented legitimate interest
            (FERPA). Chairs receive aggregate-only reports.
          </p>
        </div>

      </CardContent>
    </Card>
  );
}
