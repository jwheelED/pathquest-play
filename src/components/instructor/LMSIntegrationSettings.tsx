import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  GraduationCap, 
  Link2, 
  CheckCircle2, 
  XCircle, 
  Copy, 
  ExternalLink,
  RefreshCw,
  AlertCircle
} from "lucide-react";

interface LMSPlatform {
  id: string;
  platform_name: string;
  platform_type: string;
  issuer: string;
  client_id: string;
  is_active: boolean;
  created_at: string;
}

interface GradeSyncLog {
  id: string;
  assignment_type: string;
  score_given: number;
  score_maximum: number;
  sync_status: string;
  error_message: string | null;
  synced_at: string;
}

const LMS_TYPES = [
  { value: 'canvas', label: 'Canvas', issuerHint: 'https://canvas.instructure.com' },
  { value: 'blackboard', label: 'Blackboard Learn', issuerHint: 'https://developer.blackboard.com' },
  { value: 'moodle', label: 'Moodle', issuerHint: 'https://your-moodle-site.edu' },
  { value: 'brightspace', label: 'D2L Brightspace', issuerHint: 'https://your-brightspace.edu' },
  { value: 'schoology', label: 'Schoology', issuerHint: 'https://app.schoology.com' },
];

export function LMSIntegrationSettings() {
  const [platforms, setPlatforms] = useState<LMSPlatform[]>([]);
  const [syncLogs, setSyncLogs] = useState<GradeSyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  
  // Form state
  const [platformType, setPlatformType] = useState('');
  const [platformName, setPlatformName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [clientId, setClientId] = useState('');
  const [deploymentId, setDeploymentId] = useState('');
  const [authUrl, setAuthUrl] = useState('');
  const [tokenUrl, setTokenUrl] = useState('');
  const [jwksUrl, setJwksUrl] = useState('');

  useEffect(() => {
    fetchPlatforms();
    fetchSyncLogs();
  }, []);

  const fetchPlatforms = async () => {
    try {
      const { data, error } = await supabase
        .from('lti_platforms')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPlatforms(data || []);
    } catch (error) {
      console.error('Error fetching platforms:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSyncLogs = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('grade_sync_log')
        .select(`
          id,
          assignment_type,
          score_given,
          score_maximum,
          sync_status,
          error_message,
          synced_at
        `)
        .order('synced_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setSyncLogs(data || []);
    } catch (error) {
      console.error('Error fetching sync logs:', error);
    }
  };

  const handleLMSTypeChange = (value: string) => {
    setPlatformType(value);
    const lms = LMS_TYPES.find(l => l.value === value);
    if (lms) {
      setIssuer(lms.issuerHint);
      
      // Set common URL patterns based on LMS type
      switch (value) {
        case 'canvas':
          setAuthUrl('https://canvas.instructure.com/api/lti/authorize_redirect');
          setTokenUrl('https://canvas.instructure.com/login/oauth2/token');
          setJwksUrl('https://canvas.instructure.com/api/lti/security/jwks');
          break;
        case 'blackboard':
          setAuthUrl(`${lms.issuerHint}/api/v1/gateway/oidcauth`);
          setTokenUrl(`${lms.issuerHint}/api/v1/gateway/oauth2/jwttoken`);
          setJwksUrl(`${lms.issuerHint}/.well-known/jwks.json`);
          break;
        default:
          setAuthUrl('');
          setTokenUrl('');
          setJwksUrl('');
      }
    }
  };

  const handleAddPlatform = async () => {
    if (!platformType || !platformName || !issuer || !clientId) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsAdding(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single();

      const { error } = await supabase
        .from('lti_platforms')
        .insert({
          org_id: profile?.org_id,
          platform_type: platformType,
          platform_name: platformName,
          issuer,
          client_id: clientId,
          deployment_id: deploymentId || null,
          auth_url: authUrl,
          token_url: tokenUrl,
          jwks_url: jwksUrl,
        });

      if (error) throw error;

      toast.success('LMS platform added successfully');
      fetchPlatforms();
      
      // Reset form
      setPlatformType('');
      setPlatformName('');
      setIssuer('');
      setClientId('');
      setDeploymentId('');
      setAuthUrl('');
      setTokenUrl('');
      setJwksUrl('');
    } catch (error: any) {
      console.error('Error adding platform:', error);
      toast.error(error.message || 'Failed to add platform');
    } finally {
      setIsAdding(false);
    }
  };

  const togglePlatformActive = async (platformId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('lti_platforms')
        .update({ is_active: !isActive })
        .eq('id', platformId);

      if (error) throw error;
      
      toast.success(`Platform ${isActive ? 'disabled' : 'enabled'}`);
      fetchPlatforms();
    } catch (error) {
      toast.error('Failed to update platform status');
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const supabaseUrl = 'https://otsmjgrhyteyvpufkwdh.supabase.co';
  const toolConfig = {
    oidcInitiationUrl: `${supabaseUrl}/functions/v1/lti-oidc-login`,
    targetLinkUri: `${supabaseUrl}/functions/v1/lti-launch`,
    jwksUrl: `${supabaseUrl}/functions/v1/lti-jwks`,
    deepLinkingUrl: `${supabaseUrl}/functions/v1/lti-launch`,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5" />
          LMS Integration (LTI 1.3)
        </CardTitle>
        <CardDescription>
          Connect Edvana to your Learning Management System for automatic grade sync
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="platforms">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="platforms">Platforms</TabsTrigger>
            <TabsTrigger value="setup">Tool Setup</TabsTrigger>
            <TabsTrigger value="logs">Sync Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="platforms" className="space-y-4">
            {/* Connected Platforms */}
            {platforms.length > 0 && (
              <div className="space-y-2">
                <Label>Connected Platforms</Label>
                {platforms.map((platform) => (
                  <div 
                    key={platform.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {platform.is_active ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium">{platform.platform_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {LMS_TYPES.find(l => l.value === platform.platform_type)?.label || platform.platform_type}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={platform.is_active ? "default" : "secondary"}>
                        {platform.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      <Switch
                        checked={platform.is_active}
                        onCheckedChange={() => togglePlatformActive(platform.id, platform.is_active)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add New Platform */}
            <div className="space-y-4 pt-4 border-t">
              <Label className="text-base font-semibold">Add New LMS Platform</Label>
              
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>LMS Type</Label>
                    <Select value={platformType} onValueChange={handleLMSTypeChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select LMS" />
                      </SelectTrigger>
                      <SelectContent>
                        {LMS_TYPES.map((lms) => (
                          <SelectItem key={lms.value} value={lms.value}>
                            {lms.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Platform Name</Label>
                    <Input
                      placeholder="e.g., My University Canvas"
                      value={platformName}
                      onChange={(e) => setPlatformName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Issuer URL</Label>
                    <Input
                      placeholder="https://canvas.instructure.com"
                      value={issuer}
                      onChange={(e) => setIssuer(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Client ID</Label>
                    <Input
                      placeholder="From LMS Developer Portal"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Deployment ID (Optional)</Label>
                  <Input
                    placeholder="LMS-specific deployment identifier"
                    value={deploymentId}
                    onChange={(e) => setDeploymentId(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Auth URL</Label>
                    <Input
                      placeholder="OIDC authorization endpoint"
                      value={authUrl}
                      onChange={(e) => setAuthUrl(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Token URL</Label>
                    <Input
                      placeholder="OAuth2 token endpoint"
                      value={tokenUrl}
                      onChange={(e) => setTokenUrl(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>JWKS URL</Label>
                    <Input
                      placeholder="Platform JWKS endpoint"
                      value={jwksUrl}
                      onChange={(e) => setJwksUrl(e.target.value)}
                    />
                  </div>
                </div>

                <Button onClick={handleAddPlatform} disabled={isAdding}>
                  {isAdding ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4 mr-2" />
                      Add Platform
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="setup" className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-blue-500 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">Configure these URLs in your LMS Admin</p>
                  <p className="text-muted-foreground">
                    When setting up Edvana as an LTI 1.3 tool in your LMS, use the following configuration:
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-2 bg-background rounded border">
                  <div>
                    <Label className="text-xs text-muted-foreground">OIDC Initiation URL</Label>
                    <p className="text-sm font-mono">{toolConfig.oidcInitiationUrl}</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => copyToClipboard(toolConfig.oidcInitiationUrl, 'OIDC URL')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center justify-between p-2 bg-background rounded border">
                  <div>
                    <Label className="text-xs text-muted-foreground">Target Link URI (Launch URL)</Label>
                    <p className="text-sm font-mono">{toolConfig.targetLinkUri}</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => copyToClipboard(toolConfig.targetLinkUri, 'Launch URL')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center justify-between p-2 bg-background rounded border">
                  <div>
                    <Label className="text-xs text-muted-foreground">Public Keyset URL (JWKS)</Label>
                    <p className="text-sm font-mono">{toolConfig.jwksUrl}</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => copyToClipboard(toolConfig.jwksUrl, 'JWKS URL')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-1">Required LTI Scopes:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>openid</li>
                  <li>https://purl.imsglobal.org/spec/lti-ags/scope/lineitem</li>
                  <li>https://purl.imsglobal.org/spec/lti-ags/scope/score</li>
                </ul>
              </div>

              <Button variant="outline" asChild>
                <a 
                  href="https://www.imsglobal.org/spec/lti/v1p3/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  LTI 1.3 Specification
                </a>
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Recent Grade Syncs</Label>
              <Button variant="ghost" size="sm" onClick={fetchSyncLogs}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>

            {syncLogs.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <GraduationCap className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No grade syncs yet</p>
                <p className="text-sm">Grades will appear here when synced to your LMS</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {syncLogs.map((log) => (
                  <div 
                    key={log.id}
                    className="flex items-center justify-between p-3 border rounded-lg text-sm"
                  >
                    <div className="flex items-center gap-3">
                      {log.sync_status === 'success' ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : log.sync_status === 'failed' ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <RefreshCw className="h-4 w-4 text-yellow-500 animate-spin" />
                      )}
                      <div>
                        <p className="font-medium capitalize">{log.assignment_type.replace('_', ' ')}</p>
                        <p className="text-muted-foreground text-xs">
                          {new Date(log.synced_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {log.score_given}/{log.score_maximum}
                      </p>
                      <Badge 
                        variant={log.sync_status === 'success' ? 'default' : 'destructive'}
                        className="text-xs"
                      >
                        {log.sync_status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
