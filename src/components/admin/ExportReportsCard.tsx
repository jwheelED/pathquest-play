import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, Table } from "lucide-react";
import { toast } from "sonner";

interface ExportReportsCardProps {
  data: any;
}

export default function ExportReportsCard({ data }: ExportReportsCardProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const exportToPDF = async () => {
    setLoading('pdf');
    try {
      // In a real implementation, this would generate a PDF using a library like jsPDF
      toast.success("PDF export would be generated here", {
        description: "Feature requires jsPDF library integration"
      });
    } catch (error) {
      toast.error("Failed to export PDF");
    } finally {
      setLoading(null);
    }
  };

  const exportToCSV = () => {
    setLoading('csv');
    try {
      // Generate CSV content
      const csvContent = [
        ['Metric', 'Value'],
        ['Total Students', data.totalStudents],
        ['Active Students', data.activeStudents],
        ['Avg Completion Rate', `${data.avgCompletionRate}%`],
        ['Total Lessons Completed', data.totalLessonsCompleted],
        ['Total Achievements', data.totalAchievementsUnlocked],
        ['Engagement Score', `${data.engagementScore}%`],
      ].map(row => row.join(',')).join('\n');

      // Create download link
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edvana-report-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("Report exported successfully!");
    } catch (error) {
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
            <FileText className="w-4 h-4 mr-2" />
            {loading === 'pdf' ? 'Generating PDF...' : 'Export as PDF'}
          </Button>

          <Button
            onClick={exportToCSV}
            disabled={loading === 'csv'}
            variant="outline"
            className="w-full justify-start"
          >
            <Table className="w-4 h-4 mr-2" />
            {loading === 'csv' ? 'Generating CSV...' : 'Export as CSV'}
          </Button>
        </div>

        <div className="pt-4 border-t">
          <h4 className="font-semibold mb-2 text-sm">Report Includes:</h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>• Student engagement metrics</li>
            <li>• Completion rates and progress</li>
            <li>• ROI calculations and time savings</li>
            <li>• Platform adoption statistics</li>
            <li>• Achievement and performance data</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
